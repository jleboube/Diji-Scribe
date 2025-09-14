// server/routes/diag.js
const express = require('express');
const OpenAI = require('openai');

const router = express.Router();

router.get('/openai', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ ok: false, error: 'OPENAI_API_KEY not set' });
    const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined, organization: process.env.OPENAI_ORG || undefined });
    // Make a lightweight request to verify connectivity/auth
    await client.models.list();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err?.message || 'Connectivity/auth failed' });
  }
});

router.get('/deepgram', async (req, res) => {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) return res.status(400).json({ ok: false, error: 'DEEPGRAM_API_KEY not set' });
    // Lightweight validation: don't call network; just confirm configured
    return res.json({ ok: true, configured: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

module.exports = router;
