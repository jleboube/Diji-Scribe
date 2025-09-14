require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const fs = require('fs');
// Ensure uploads temp folder exists (for multer)
try { fs.mkdirSync('uploads', { recursive: true }); } catch (e) {}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Routes
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const filesRoutes = require('./routes/files');
const diagRoutes = require('./routes/diag');
const adminRoutes = require('./routes/admin');
const billingRoutes = require('./routes/billing');
const RegistrationCode = require('./models/RegistrationCode');
const crypto = require('crypto');
const User = require('./models/User');

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/diag', diagRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/billing', billingRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// DB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autotranscribe';
mongoose
  .connect(MONGODB_URI, { autoIndex: true })
  .then(() => {
    // Initialize registration codes and start top-up task
    (async () => {
      try {
        await ensureInitialRegistrationCodes();
        startRegistrationCodeTopUpTask();
        await ensureDefaultUser();
      } catch (e) {
        console.error('Registration code init/top-up error:', e);
      }
    })();

    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });

// --- Registration Code Utilities ---
function generateHumanCode() {
  // 12 chars base32-like, grouped AAAA-BBBB-CCCC
  const raw = crypto.randomBytes(8).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const s = (raw + 'XXXXXXXXXXXX').slice(0, 12);
  return `${s.slice(0,4)}-${s.slice(4,8)}-${s.slice(8,12)}`;
}

async function ensureInitialRegistrationCodes() {
  const MIN_INIT = 50;
  const available = await RegistrationCode.countDocuments({ used: false });
  if (available >= MIN_INIT) return;
  const toCreate = MIN_INIT - available;
  await createRegistrationCodes(toCreate);
}

async function createRegistrationCodes(n) {
  let created = 0;
  const bulk = [];
  const seen = new Set();
  while (created < n) {
    const code = generateHumanCode();
    if (seen.has(code)) continue;
    seen.add(code);
    bulk.push({ code, normalizedCode: code.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), used: false });
    created++;
  }
  try {
    await RegistrationCode.insertMany(bulk, { ordered: false });
  } catch (e) {
    // Ignore duplicate key errors; top-up task will fill gaps later if needed
  }
}

function startRegistrationCodeTopUpTask() {
  const THRESHOLD = 35;
  const BATCH = 50;
  const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  setInterval(async () => {
    try {
      const available = await RegistrationCode.countDocuments({ used: false });
      if (available < THRESHOLD) {
        await createRegistrationCodes(BATCH);
        console.log(`[codes] Topped up ${BATCH} codes; available was ${available}`);
      }
    } catch (e) {
      console.error('[codes] Top-up task error:', e?.message || e);
    }
  }, INTERVAL_MS);
}

// Backfill normalizedCode for older documents (one-time best effort)
(async function backfillNormalizedCodes() {
  try {
    const cursor = RegistrationCode.find({ normalizedCode: { $exists: false } }).cursor();
    for await (const doc of cursor) {
      const norm = String(doc.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (norm) {
        try { await RegistrationCode.updateOne({ _id: doc._id }, { $set: { normalizedCode: norm } }); } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[codes] backfill normalizedCode failed:', e?.message || e);
  }
})();

async function ensureDefaultUser() {
  try {
    const email = process.env.DEFAULT_USER_EMAIL || 'joeleboube@yahoo.com';
    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`[init] Default user exists: ${email}`);
      return;
    }
    // Generate a strong random password and create the user
    const rand = crypto.randomBytes(12).toString('base64url');
    const user = new User({ email, password: rand });
    await user.save();
    console.log(`\n[init] Default user created: ${email}\n[init] Temporary password: ${rand}\n`);
  } catch (e) {
    console.error('[init] Failed to ensure default user:', e?.message || e);
  }
}
