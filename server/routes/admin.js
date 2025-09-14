// server/routes/admin.js
const express = require('express');
const RegistrationCode = require('../models/RegistrationCode');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Admin auth: must be a logged-in user with the admin email
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.DEFAULT_USER_EMAIL || 'joeleboube@yahoo.com';
async function requireAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).lean();
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (String(user.email).toLowerCase() !== String(ADMIN_EMAIL).toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function generateHumanCode() {
  const raw = crypto.randomBytes(8).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const s = (raw + 'XXXXXXXXXXXX').slice(0, 12);
  return `${s.slice(0,4)}-${s.slice(4,8)}-${s.slice(8,12)}`;
}

function normalize(code) { return String(code).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }

async function createRegistrationCodes(n) {
  let created = 0;
  const bulk = [];
  const seen = new Set();
  while (created < n) {
    const code = generateHumanCode();
    if (seen.has(code)) continue;
    seen.add(code);
    bulk.push({ code, normalizedCode: normalize(code), used: false });
    created++;
  }
  try {
    await RegistrationCode.insertMany(bulk, { ordered: false });
  } catch (_) {}
}

// List registration codes (available or used)
router.get('/registration-codes', requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || 'available').toLowerCase();
    const query = status === 'used' ? { used: true } : { used: false };
    const codes = await RegistrationCode.find(query).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ count: codes.length, codes: codes.map(c => ({ code: c.code, used: c.used, usedAt: c.usedAt, usedBy: c.usedBy })) });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to list codes' });
  }
});

// Generate N new codes
router.post('/registration-codes/generate', requireAdmin, async (req, res) => {
  try {
    const n = Math.max(1, Math.min(500, Number(req.body?.n || 50)));
    await createRegistrationCodes(n);
    const available = await RegistrationCode.countDocuments({ used: false });
    res.json({ message: `Generated ${n} codes`, available });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to generate codes' });
  }
});

// Top-up if below threshold
router.post('/registration-codes/topup', requireAdmin, async (req, res) => {
  try {
    const threshold = Number(process.env.CODES_THRESHOLD || 35);
    const batch = Number(process.env.CODES_BATCH || 50);
    const available = await RegistrationCode.countDocuments({ used: false });
    if (available < threshold) {
      await createRegistrationCodes(batch);
    }
    const after = await RegistrationCode.countDocuments({ used: false });
    res.json({ before: available, after, threshold, batch });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to top up codes' });
  }
});

module.exports = router;
