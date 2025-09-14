// server/routes/files.js
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const OpenAI = require('openai');
const File = require('../models/File');

const router = express.Router();

// JWT auth middleware (duplicate of upload route's inline for simplicity)
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.userId;
    next();
  });
};

const accessKeyId = process.env.LINODE_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.LINODE_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const s3Region = process.env.S3_REGION || 'us-east-1';
const s3Endpoint = process.env.S3_ENDPOINT || 'https://us-east-1.linodeobjects.com';
const bucket = process.env.LINODE_BUCKET;

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

router.get('/', verifyToken, async (req, res) => {
  try {
    if (!bucket) return res.status(500).json({ error: 'Server not configured: LINODE_BUCKET missing' });
    const files = await File.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100);

    const results = await Promise.all(files.map(async (f) => {
      let processedUrl = null;
      let transcriptUrl = null;
      try {
        if (f.processedKey) {
          processedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: f.processedKey }), { expiresIn: 3600 });
        }
        if (f.transcriptKey) {
          transcriptUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: f.transcriptKey }), { expiresIn: 3600 });
        }
      } catch (e) {
        // If signing fails, leave URLs null but still return metadata
      }
      return {
        id: f._id,
        originalName: f.originalName,
        status: f.status,
        hasPII: f.hasPII,
        hasPCI: f.hasPCI,
        encrypted: f.encrypted,
        createdAt: f.createdAt,
        processedUrl,
        transcriptUrl
      };
    }));

    res.json({ files: results });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

module.exports = router;

// Helpers
const streamToBuffer = async (readable) => {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

// Get plaintext transcript content (handles decryption if needed)
router.get('/:id/transcript', verifyToken, async (req, res) => {
  try {
    const f = await File.findOne({ _id: req.params.id, userId: req.userId });
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (!f.transcriptKey) return res.status(404).json({ error: 'Transcript not available' });

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: f.transcriptKey }));
    const buf = await streamToBuffer(obj.Body);
    let text;
    if (f.encrypted) {
      const key = Buffer.from(f.encryptionKeyB64, 'base64');
      const iv = Buffer.from(f.encryptionIvB64, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const decrypted = Buffer.concat([decipher.update(Buffer.from(buf.toString(), 'base64')), decipher.final()]);
      text = decrypted.toString('utf8');
    } else {
      text = buf.toString('utf8');
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch (err) {
    console.error('Get transcript error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Save revised transcript as a new S3 object: completed/revised-<base>.txt
router.post('/:id/revise', verifyToken, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (typeof text !== 'string') return res.status(400).json({ error: 'Missing text' });
    const f = await File.findOne({ _id: req.params.id, userId: req.userId });
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (!f.transcriptKey) return res.status(400).json({ error: 'Transcript not available to revise' });

    const base = path.basename(f.transcriptKey); // e.g., test.mp3.txt
    const revisedName = 'revised-' + base; // revised-test.mp3.txt
    const revisedKey = path.posix.join('completed', revisedName);

    let body;
    if (f.encrypted) {
      const key = Buffer.from(f.encryptionKeyB64, 'base64');
      const iv = Buffer.from(f.encryptionIvB64, 'base64');
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      body = Buffer.concat([cipher.update(Buffer.from(text, 'utf8')), cipher.final()]).toString('base64');
    } else {
      body = text;
    }

    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: revisedKey, Body: body, ContentType: 'text/plain; charset=utf-8' }));
    const revisedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: revisedKey }), { expiresIn: 3600 });
    res.json({ message: 'Revised transcript saved', revisedTranscriptKey: revisedKey, revisedTranscriptUrl: revisedUrl });
  } catch (err) {
    console.error('Save revised transcript error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Re-transcribe an existing processed file (not supported for encrypted files)
router.post('/:id/retranscribe', verifyToken, async (req, res) => {
  try {
    const f = await File.findOne({ _id: req.params.id, userId: req.userId });
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.encrypted) return res.status(400).json({ error: 'Cannot retranscribe encrypted files' });
    const deepgramAvailable = !!process.env.DEEPGRAM_API_KEY;
    const assemblyAvailable = !!process.env.ASSEMBLYAI_API_KEY;
    if (!openai && !deepgramAvailable && !assemblyAvailable) return res.status(500).json({ error: 'No transcription provider configured' });
    const whisperMaxMB = Number(process.env.WHISPER_MAX_MB || 25);
    const preferredProvider = String(req.body?.provider || 'auto').toLowerCase();
    const key = f.processedKey || f.uploadKey;
    if (!key) return res.status(400).json({ error: 'No source file available to transcribe' });

    // Download the audio to a temp file
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const tmpPath = path.join(os.tmpdir(), `retranscribe-${f._id}-${Date.now()}`);
    const write = fs.createWriteStream(tmpPath);
    await new Promise((resolve, reject) => {
      obj.Body.pipe(write).on('finish', resolve).on('error', reject);
    });

    const stats = fs.statSync(tmpPath);
    const sizeMB = stats.size / (1024 * 1024);
    const openaiRetries = Math.max(0, Number(process.env.OPENAI_RETRIES || 3));
    const openaiTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 120000);
    const model = process.env.WHISPER_MODEL || 'whisper-1';

    const attempt = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), openaiTimeoutMs);
      try {
        const resp = await Promise.race([
          openai.audio.transcriptions.create({ file: fs.createReadStream(tmpPath), model, response_format: 'text', signal: controller.signal }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Transcription timeout')), openaiTimeoutMs + 1000))
        ]);
        clearTimeout(timeout);
        return typeof resp === 'string' ? resp : (resp?.text || '');
      } catch (e) {
        clearTimeout(timeout);
        throw e;
      }
    };

    let text = '';
    let lastErr = null;
    const mode = ['openai', 'deepgram', 'assemblyai'].includes(preferredProvider) ? preferredProvider : 'auto';
    if (mode === 'deepgram') {
      try {
        text = await transcribeWithDeepgram(tmpPath, f.originalName);
      } catch (e) {
        lastErr = e;
      }
    } else if (mode === 'assemblyai') {
      try {
        // Inline AssemblyAI transcription (reuse logic from upload route)
        const apiKey = process.env.ASSEMBLYAI_API_KEY;
        const baseUrl = process.env.ASSEMBLYAI_BASE_URL || 'https://api.assemblyai.com';
        const model = process.env.ASSEMBLYAI_MODEL || 'universal';
        const totalTimeoutMs = Number(process.env.ASSEMBLYAI_TIMEOUT_MS || 300000);
        const pollIntervalMs = Math.max(1500, Number(process.env.ASSEMBLYAI_POLL_MS || 3000));
        const up = await fetch(`${baseUrl}/v2/upload`, { method: 'POST', headers: { authorization: apiKey }, body: fs.createReadStream(tmpPath) });
        if (!up.ok) throw new Error(`AssemblyAI upload failed: ${up.status}`);
        const audioUrl = (await up.json())?.upload_url;
        const cr = await fetch(`${baseUrl}/v2/transcript`, { method: 'POST', headers: { authorization: apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ audio_url: audioUrl, speech_model: model }) });
        if (!cr.ok) throw new Error(`AssemblyAI create transcript failed: ${cr.status}`);
        const id = (await cr.json())?.id; const end = `${baseUrl}/v2/transcript/${id}`; const deadline = Date.now() + totalTimeoutMs;
        while (Date.now() < deadline) {
          const p = await fetch(end, { headers: { authorization: apiKey } });
          if (!p.ok) throw new Error(`AssemblyAI poll failed: ${p.status}`);
          const d = await p.json();
          if (d?.status === 'completed') { text = d?.text || ''; lastErr = null; break; }
          if (d?.status === 'error') throw new Error(`AssemblyAI error: ${d?.error || 'unknown'}`);
          await new Promise(r => setTimeout(r, pollIntervalMs));
        }
        if (!text) throw new Error('AssemblyAI transcription timeout');
      } catch (e) { lastErr = e; }
    } else if (mode === 'openai') {
      if (!openai) {
        lastErr = new Error('OPENAI_API_KEY not configured');
      } else if (sizeMB > whisperMaxMB) {
        lastErr = new Error(`File ${sizeMB.toFixed(1)}MB exceeds Whisper limit ${whisperMaxMB}MB`);
      } else {
        for (let i = 0; i <= openaiRetries; i++) {
          try {
            text = await attempt();
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            const msg = e?.message || '';
            const code = e?.code || e?.cause?.code;
            const isTransient = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|Transcription timeout/i.test(msg) || /ECONNRESET|ETIMEDOUT/i.test(String(code || '')) || e?.name === 'APIConnectionError';
            if (i < openaiRetries && isTransient) {
              const backoff = Math.min(15000, 1000 * Math.pow(2, i));
              await new Promise(r => setTimeout(r, backoff));
              continue;
            }
            break;
          }
        }
      }
    } else {
      // auto
      if (openai && sizeMB <= whisperMaxMB) {
        for (let i = 0; i <= openaiRetries; i++) {
          try {
            text = await attempt();
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            const msg = e?.message || '';
            const code = e?.code || e?.cause?.code;
            const isTransient = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|Transcription timeout/i.test(msg) || /ECONNRESET|ETIMEDOUT/i.test(String(code || '')) || e?.name === 'APIConnectionError';
            if (i < openaiRetries && isTransient) {
              const backoff = Math.min(15000, 1000 * Math.pow(2, i));
              await new Promise(r => setTimeout(r, backoff));
              continue;
            }
            break;
          }
        }
      }
      if (lastErr || !openai || sizeMB > whisperMaxMB) {
        if (deepgramAvailable) {
          try {
            text = await transcribeWithDeepgram(tmpPath, f.originalName);
            lastErr = null;
          } catch (dgErr) {
            if (assemblyAvailable) {
              try {
                const apiKey = process.env.ASSEMBLYAI_API_KEY;
                const baseUrl = process.env.ASSEMBLYAI_BASE_URL || 'https://api.assemblyai.com';
                const model = process.env.ASSEMBLYAI_MODEL || 'universal';
                const totalTimeoutMs = Number(process.env.ASSEMBLYAI_TIMEOUT_MS || 300000);
                const pollIntervalMs = Math.max(1500, Number(process.env.ASSEMBLYAI_POLL_MS || 3000));
                const up = await fetch(`${baseUrl}/v2/upload`, { method: 'POST', headers: { authorization: apiKey }, body: fs.createReadStream(tmpPath) });
                if (!up.ok) throw new Error(`AssemblyAI upload failed: ${up.status}`);
                const audioUrl = (await up.json())?.upload_url;
                const cr = await fetch(`${baseUrl}/v2/transcript`, { method: 'POST', headers: { authorization: apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ audio_url: audioUrl, speech_model: model }) });
                if (!cr.ok) throw new Error(`AssemblyAI create transcript failed: ${cr.status}`);
                const id = (await cr.json())?.id; const end = `${baseUrl}/v2/transcript/${id}`; const deadline = Date.now() + totalTimeoutMs;
                while (Date.now() < deadline) { const p = await fetch(end, { headers: { authorization: apiKey } }); if (!p.ok) throw new Error(`AssemblyAI poll failed: ${p.status}`); const d = await p.json(); if (d?.status === 'completed') { text = d?.text || ''; lastErr = null; break; } if (d?.status === 'error') throw new Error(`AssemblyAI error: ${d?.error || 'unknown'}`); await new Promise(r => setTimeout(r, pollIntervalMs)); }
                if (lastErr === null && !text) throw new Error('AssemblyAI transcription timeout');
              } catch (ae) { lastErr = ae; }
            } else {
              lastErr = dgErr;
            }
          }
        } else if (assemblyAvailable) {
          try {
            const apiKey = process.env.ASSEMBLYAI_API_KEY;
            const baseUrl = process.env.ASSEMBLYAI_BASE_URL || 'https://api.assemblyai.com';
            const model = process.env.ASSEMBLYAI_MODEL || 'universal';
            const totalTimeoutMs = Number(process.env.ASSEMBLYAI_TIMEOUT_MS || 300000);
            const pollIntervalMs = Math.max(1500, Number(process.env.ASSEMBLYAI_POLL_MS || 3000));
            const up = await fetch(`${baseUrl}/v2/upload`, { method: 'POST', headers: { authorization: apiKey }, body: fs.createReadStream(tmpPath) });
            if (!up.ok) throw new Error(`AssemblyAI upload failed: ${up.status}`);
            const audioUrl = (await up.json())?.upload_url;
            const cr = await fetch(`${baseUrl}/v2/transcript`, { method: 'POST', headers: { authorization: apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ audio_url: audioUrl, speech_model: model }) });
            if (!cr.ok) throw new Error(`AssemblyAI create transcript failed: ${cr.status}`);
            const id = (await cr.json())?.id; const end = `${baseUrl}/v2/transcript/${id}`; const deadline = Date.now() + totalTimeoutMs;
            while (Date.now() < deadline) { const p = await fetch(end, { headers: { authorization: apiKey } }); if (!p.ok) throw new Error(`AssemblyAI poll failed: ${p.status}`); const d = await p.json(); if (d?.status === 'completed') { text = d?.text || ''; lastErr = null; break; } if (d?.status === 'error') throw new Error(`AssemblyAI error: ${d?.error || 'unknown'}`); await new Promise(r => setTimeout(r, pollIntervalMs)); }
            if (lastErr === null && !text) throw new Error('AssemblyAI transcription timeout');
          } catch (ae) { lastErr = ae; }
        }
      }
    }

    try { fs.unlinkSync(tmpPath); } catch (_) {}

    if (lastErr) return res.status(502).json({ error: lastErr?.message || 'Transcription failed after retries' });

    const transcriptKey = `completed/${path.basename(f.originalName)}.txt`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: transcriptKey, Body: text, ContentType: 'text/plain; charset=utf-8' }));
    f.transcriptKey = transcriptKey;
    await f.save();
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: transcriptKey }), { expiresIn: 3600 });
    res.json({ message: 'Re-transcribed', transcriptKey, transcriptUrl: url });
  } catch (err) {
    console.error('Re-transcribe error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});
