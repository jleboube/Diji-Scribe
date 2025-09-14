// server/routes/upload.js
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const fs = require('fs');
const clamav = require('clamav.js');
const net = require('net');
const jwt = require('jsonwebtoken');
const OpenAI = require('openai');
const File = require('../models/File');
const router = express.Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
}); // Temp local storage

const accessKeyId = process.env.LINODE_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.LINODE_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const s3Region = process.env.S3_REGION || 'us-east-1';
const s3Endpoint = process.env.S3_ENDPOINT || 'https://us-east-1.linodeobjects.com';

const s3 = new S3Client({
  region: s3Region,
  endpoint: s3Endpoint,
  forcePathStyle: false,
  credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
});

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiBaseURL = process.env.OPENAI_BASE_URL || undefined;
const openaiOrg = process.env.OPENAI_ORG || undefined;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey, baseURL: openaiBaseURL, organization: openaiOrg }) : null;

// Guess a basic content type from filename (fallback to octet-stream)
function guessContentType(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.mp3')) return 'audio/mpeg';
  if (n.endsWith('.wav')) return 'audio/wav';
  if (n.endsWith('.m4a')) return 'audio/mp4';
  if (n.endsWith('.mp4')) return 'video/mp4';
  if (n.endsWith('.webm')) return 'audio/webm';
  if (n.endsWith('.ogg')) return 'audio/ogg';
  return 'application/octet-stream';
}

// Deepgram prerecording transcription via REST (no SDK dependency)
async function transcribeWithDeepgram(filePath, fileName) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not configured');
  const model = process.env.DEEPGRAM_MODEL || 'nova-2';
  const language = process.env.DEEPGRAM_LANGUAGE || '';
  const smart = String(process.env.DEEPGRAM_SMART_FORMAT || 'true') === 'true';
  const punctuate = String(process.env.DEEPGRAM_PUNCTUATE || 'true') === 'true';

  const params = new URLSearchParams();
  if (model) params.set('model', model);
  if (language) params.set('language', language);
  if (smart) params.set('smart_format', 'true');
  if (punctuate) params.set('punctuate', 'true');

  const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;
  const ct = guessContentType(fileName);
  const buf = fs.readFileSync(filePath);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': ct },
    body: buf
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Deepgram HTTP ${resp.status}: ${text}`);
  }
  const json = await resp.json();
  const alt = json?.results?.channels?.[0]?.alternatives?.[0];
  const transcript = alt?.paragraphs?.transcript || alt?.transcript || '';
  if (!transcript) throw new Error('Deepgram returned no transcript');
  return transcript;
}

// AssemblyAI transcription (upload + create transcript + poll)
async function transcribeWithAssemblyAI(filePath) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error('ASSEMBLYAI_API_KEY not configured');
  const baseUrl = process.env.ASSEMBLYAI_BASE_URL || 'https://api.assemblyai.com';
  const model = process.env.ASSEMBLYAI_MODEL || 'universal';
  const totalTimeoutMs = Number(process.env.ASSEMBLYAI_TIMEOUT_MS || 300000);
  const pollIntervalMs = Math.max(1500, Number(process.env.ASSEMBLYAI_POLL_MS || 3000));

  // 1) Upload file (stream)
  const uploadResp = await fetch(`${baseUrl}/v2/upload`, {
    method: 'POST',
    headers: { authorization: apiKey },
    body: fs.createReadStream(filePath)
  });
  if (!uploadResp.ok) {
    const t = await uploadResp.text().catch(() => '');
    throw new Error(`AssemblyAI upload failed: ${uploadResp.status} ${t}`);
  }
  const uploadJson = await uploadResp.json();
  const audioUrl = uploadJson?.upload_url;
  if (!audioUrl) throw new Error('AssemblyAI upload_url missing');

  // 2) Create transcript job
  const createResp = await fetch(`${baseUrl}/v2/transcript`, {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: audioUrl, speech_model: model })
  });
  if (!createResp.ok) {
    const t = await createResp.text().catch(() => '');
    throw new Error(`AssemblyAI create transcript failed: ${createResp.status} ${t}`);
  }
  const createJson = await createResp.json();
  const id = createJson?.id;
  if (!id) throw new Error('AssemblyAI transcript id missing');

  // 3) Poll until complete
  const deadline = Date.now() + totalTimeoutMs;
  const endpoint = `${baseUrl}/v2/transcript/${id}`;
  while (Date.now() < deadline) {
    const poll = await fetch(endpoint, { headers: { authorization: apiKey } });
    if (!poll.ok) {
      const t = await poll.text().catch(() => '');
      throw new Error(`AssemblyAI poll failed: ${poll.status} ${t}`);
    }
    const data = await poll.json();
    if (data?.status === 'completed') return data?.text || '';
    if (data?.status === 'error') throw new Error(`AssemblyAI error: ${data?.error || 'unknown'}`);
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  throw new Error('AssemblyAI transcription timeout');
}

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.userId;
    next();
  });
};

router.post('/', verifyToken, upload.single('file'), async (req, res) => {
  const { hasPII, hasPCI } = req.body;
  const preferredProvider = String(req.body.provider || 'auto').toLowerCase();
  const shouldEncrypt = String(hasPII) === 'true' || String(hasPCI) === 'true';
  const filePath = req.file.path;
  const fileName = req.file.originalname;
  const bucket = process.env.LINODE_BUCKET;
  const clamdHost = process.env.CLAMAV_HOST || 'clamd';
  const clamdPort = Number(process.env.CLAMAV_PORT || 3310);
  const skipVirusScan = String(process.env.SKIP_VIRUS_SCAN || 'false') === 'true';
  const skipTranscription = String(process.env.SKIP_TRANSCRIPTION || 'false') === 'true';
  const whisperMaxMB = Number(process.env.WHISPER_MAX_MB || 25);
  const openaiTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 120000);
  const openaiRetries = Math.max(0, Number(process.env.OPENAI_RETRIES || 3));
  const failOnTranscriptionError = String(process.env.FAIL_ON_TRANSCRIPTION_ERROR || 'false') === 'true';

  try {
    if (!bucket) throw new Error('LINODE_BUCKET not configured');
    const bad = (v) => !v || String(v).trim() === '' || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined';
    if (bad(accessKeyId) || bad(secretAccessKey)) {
      throw new Error('S3 credentials not configured (set LINODE_ACCESS_KEY/LINODE_SECRET_KEY or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)');
    }

    console.log(`[upload] start user=${req.userId} name=${fileName} size=${req.file.size || 'unknown'}`);

    // Virus scan using clamd INSTREAM protocol for reliability
    if (!skipVirusScan) {
      const isClean = await (async function scanWithClamd(host, port, path) {
        return new Promise((resolve, reject) => {
          const socket = new net.Socket();
          let response = '';
          let settled = false;

          const cleanup = () => {
            try { socket.destroy(); } catch (_) {}
          };

          socket.setTimeout(60000, () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('Clamd scan timed out'));
          });

          socket.on('error', (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
          });

          socket.on('data', (data) => {
            response += data.toString('utf8');
          });

          socket.on('close', () => {
            if (settled) return;
            settled = true;
            // Typical responses: "stream: OK" or "stream: Eicar-Test-Signature FOUND"
            const resp = response.trim();
            if (String(process.env.LOG_SCAN_RESPONSES || 'false') === 'true') {
              console.log(`[clamd] host=${host} port=${port} file=${path} resp=${JSON.stringify(resp)}`);
            }
            // Consider infected only when explicit FOUND appears in response
            const infected = /\bFOUND\b/i.test(resp);
            const isOk = !infected && /\bOK\b/i.test(resp);
            resolve(isOk);
          });

          socket.connect(port, host, () => {
            socket.write('INSTREAM\n');
            const readStream = fs.createReadStream(path, { highWaterMark: 64 * 1024 });
            readStream.on('error', (err) => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(err);
            });
            readStream.on('data', (chunk) => {
              const lenBuf = Buffer.alloc(4);
              lenBuf.writeUInt32BE(chunk.length, 0);
              socket.write(lenBuf);
              socket.write(chunk);
            });
            readStream.on('end', () => {
              const zeroBuf = Buffer.alloc(4);
              zeroBuf.writeUInt32BE(0, 0);
              socket.write(zeroBuf);
              // allow clamd to close after final response
            });
          });
        });
      })(clamdHost, clamdPort, filePath);

      if (!isClean) {
        fs.unlinkSync(filePath);
        const errMsg = 'Virus detected by ClamAV';
        return res.status(400).json({ error: errMsg });
      }
    }

    let fileBuffer = fs.readFileSync(filePath);
    let textContent = '';
    let key = null;
    let iv = null;

    if (shouldEncrypt) {
      key = crypto.randomBytes(32); // In prod, use secure key management (KMS)
      iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      fileBuffer = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
    }

    // Upload to 'upload/'
    const uploadKey = `upload/${fileName}`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: uploadKey, Body: fileBuffer }));
    console.log(`[upload] uploaded to s3 key=${uploadKey}`);

    // Create file record (processing)
    const fileRecord = await File.create({
      userId: req.userId,
      originalName: fileName,
      uploadKey,
      hasPII: String(hasPII) === 'true',
      hasPCI: String(hasPCI) === 'true',
      encrypted: shouldEncrypt,
      encryptionKeyB64: shouldEncrypt && key ? key.toString('base64') : undefined,
      encryptionIvB64: shouldEncrypt && iv ? iv.toString('base64') : undefined,
      status: 'processing'
    });

    // Transcribe
    if (skipTranscription) {
      textContent = '[transcription skipped]';
    } else {
      const bytes = req.file.size || fs.statSync(filePath).size;
      const sizeMB = bytes / (1024 * 1024);
      const deepgramAvailable = !!process.env.DEEPGRAM_API_KEY;
      const assemblyAvailable = !!process.env.ASSEMBLYAI_API_KEY;

      const doWhisper = async () => {
        const model = process.env.WHISPER_MODEL || 'whisper-1';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), openaiTimeoutMs);
        try {
          const resp = await Promise.race([
            openai.audio.transcriptions.create({ file: fs.createReadStream(filePath), model, response_format: 'text', signal: controller.signal }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Transcription timeout')), openaiTimeoutMs + 1000))
          ]);
          clearTimeout(timeout);
          return typeof resp === 'string' ? resp : (resp?.text || '');
        } catch (e) {
          clearTimeout(timeout);
          throw e;
        }
      };

      const tryWhisperWithRetries = async () => {
        let result = '';
        let lastErr = null;
        for (let i = 0; i <= openaiRetries; i++) {
          try {
            result = await doWhisper();
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            const msg = e?.message || '';
            const code = e?.code || e?.cause?.code;
            const isTransient = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|Transcription timeout/i.test(msg) || /ECONNRESET|ETIMEDOUT/i.test(String(code || '')) || e?.name === 'APIConnectionError';
            if (i < openaiRetries && isTransient) {
              const backoff = Math.min(15000, 1000 * Math.pow(2, i));
              console.warn(`[upload] Whisper transient error, retry ${i + 1}/${openaiRetries} in ${backoff}ms:`, msg || code);
              await new Promise(r => setTimeout(r, backoff));
              continue;
            }
            break;
          }
        }
        if (lastErr) throw lastErr;
        return result;
      };

      const mode = ['openai', 'deepgram', 'assemblyai'].includes(preferredProvider) ? preferredProvider : 'auto';

      if (mode === 'deepgram') {
        try {
          textContent = await transcribeWithDeepgram(filePath, fileName);
        } catch (e) {
          console.error('[upload] Deepgram error:', e?.message || e);
          if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (e?.message || 'unknown error'));
          textContent = '[transcription temporarily unavailable]';
        }
      } else if (mode === 'assemblyai') {
        try {
          textContent = await transcribeWithAssemblyAI(filePath);
        } catch (e) {
          console.error('[upload] AssemblyAI error:', e?.message || e);
          if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (e?.message || 'unknown error'));
          textContent = '[transcription temporarily unavailable]';
        }
      } else if (mode === 'openai') {
        if (!openai) throw new Error('OPENAI_API_KEY not configured');
        if (sizeMB > whisperMaxMB) {
          console.warn(`[upload] Whisper size limit: ${sizeMB.toFixed(2)}MB > ${whisperMaxMB}MB`);
          textContent = `[transcription skipped: file ${sizeMB.toFixed(1)}MB exceeds Whisper limit ${whisperMaxMB}MB]`;
        } else {
          try {
            textContent = await tryWhisperWithRetries();
          } catch (e) {
            console.error('[upload] Whisper error:', e?.message || e);
            if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (e?.message || 'unknown error'));
            textContent = '[transcription temporarily unavailable]';
          }
        }
      } else {
        // auto: try Whisper (if configured and within size), else Deepgram
        if (sizeMB > whisperMaxMB || !openai) {
          if (deepgramAvailable) {
            try {
              textContent = await transcribeWithDeepgram(filePath, fileName);
            } catch (e) {
              console.error('[upload] Deepgram error on auto path:', e?.message || e);
              if (assemblyAvailable) {
                try { textContent = await transcribeWithAssemblyAI(filePath); }
                catch (ae) {
                  console.error('[upload] AssemblyAI error on auto path:', ae?.message || ae);
                  if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (ae?.message || 'unknown error'));
                  textContent = '[transcription temporarily unavailable]';
                }
              } else {
                if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (e?.message || 'unknown error'));
                textContent = '[transcription temporarily unavailable]';
              }
            }
          } else if (assemblyAvailable) {
            try { textContent = await transcribeWithAssemblyAI(filePath); }
            catch (ae) {
              console.error('[upload] AssemblyAI error on auto path (no DG):', ae?.message || ae);
              if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (ae?.message || 'unknown error'));
              textContent = '[transcription temporarily unavailable]';
            }
          } else {
            if (!openai) throw new Error('Transcription not configured (OPENAI_API_KEY or DEEPGRAM_API_KEY required)');
            if (sizeMB > whisperMaxMB) {
              textContent = `[transcription skipped: file ${sizeMB.toFixed(1)}MB exceeds Whisper limit ${whisperMaxMB}MB]`;
            } else {
              try { textContent = await tryWhisperWithRetries(); }
              catch (e) {
                console.error('[upload] Whisper error (auto):', e?.message || e);
                if (deepgramAvailable) {
                  try { textContent = await transcribeWithDeepgram(filePath, fileName); }
                  catch (dgErr) {
                    if (assemblyAvailable) {
                      try { textContent = await transcribeWithAssemblyAI(filePath); }
                      catch (ae) {
                        console.error('[upload] AssemblyAI error after DG fail:', ae?.message || ae);
                        if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (ae?.message || 'unknown error'));
                        textContent = '[transcription temporarily unavailable]';
                      }
                    } else {
                      if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (dgErr?.message || 'unknown error'));
                      textContent = '[transcription temporarily unavailable]';
                    }
                  }
                } else if (assemblyAvailable) {
                  try { textContent = await transcribeWithAssemblyAI(filePath); }
                  catch (ae) {
                    console.error('[upload] AssemblyAI error (auto, no DG):', ae?.message || ae);
                    if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (ae?.message || 'unknown error'));
                    textContent = '[transcription temporarily unavailable]';
                  }
                } else {
                  if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (e?.message || 'unknown error'));
                  textContent = '[transcription temporarily unavailable]';
                }
              }
            }
          }
        } else {
          try {
            textContent = await tryWhisperWithRetries();
          } catch (e) {
            console.error('[upload] Whisper error after retries (auto):', e?.message || e);
            if (deepgramAvailable) {
              try { textContent = await transcribeWithDeepgram(filePath, fileName); }
              catch (dgErr) {
                if (assemblyAvailable) {
                  try { textContent = await transcribeWithAssemblyAI(filePath); }
                  catch (ae) {
                    console.error('[upload] AssemblyAI fallback error (auto):', ae?.message || ae);
                    if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (ae?.message || 'unknown error'));
                    textContent = '[transcription temporarily unavailable]';
                  }
                } else {
                  console.error('[upload] Deepgram fallback error (auto):', dgErr?.message || dgErr);
                  if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (dgErr?.message || 'unknown error'));
                  textContent = '[transcription temporarily unavailable]';
                }
              }
            } else if (assemblyAvailable) {
              try { textContent = await transcribeWithAssemblyAI(filePath); }
              catch (ae) {
                console.error('[upload] AssemblyAI fallback error (auto, no DG):', ae?.message || ae);
                if (failOnTranscriptionError) throw new Error('Transcription failed: ' + (ae?.message || 'unknown error'));
                textContent = '[transcription temporarily unavailable]';
              }
            } else if (failOnTranscriptionError) {
              throw new Error('Transcription failed: ' + (e?.message || 'unknown error'));
            } else {
              textContent = '[transcription temporarily unavailable]';
            }
          }
        }
      }
    }

    if (shouldEncrypt) {
      // Encrypt text similarly
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv); // Reuse key/iv
      textContent = Buffer.concat([cipher.update(textContent), cipher.final()]).toString('base64');
    }

    // Save text to 'completed/'
    const transcriptKey = `completed/${fileName}.txt`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: transcriptKey, Body: textContent }));
    console.log(`[upload] transcript saved key=${transcriptKey}`);

    // Move original to 'processed/' (copy then delete)
    const processedKey = `processed/${fileName}`;
    await s3.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${encodeURIComponent(uploadKey)}`, Key: processedKey }));
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: uploadKey }));
    console.log(`[upload] moved to processed key=${processedKey}`);

    fs.unlinkSync(filePath); // Clean temp
    // Update record
    fileRecord.status = 'completed';
    fileRecord.transcriptKey = transcriptKey;
    fileRecord.processedKey = processedKey;
    await fileRecord.save();

    res.json({ message: 'File processed successfully', fileId: fileRecord._id });
  } catch (err) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {}
    console.error('Upload processing error:', err?.stack || err);
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
});

module.exports = router;
