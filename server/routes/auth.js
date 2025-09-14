// server/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const RegistrationCode = require('../models/RegistrationCode');
const mongoose = require('mongoose');

router.post('/register', async (req, res) => {
  try {
    const { email, password, code } = req.body || {};
    if (!email || !password || !code) {
      return res.status(400).json({ error: 'Email, password, and registration code are required' });
    }

    // Normalize code formatting (strip spaces and hyphens, uppercase)
    const norm = String(code).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (norm.length < 8) {
      return res.status(400).json({ error: 'Invalid registration code' });
    }
    const display = norm.length >= 12 ? `${norm.slice(0,4)}-${norm.slice(4,8)}-${norm.slice(8,12)}` : norm;

    // Create the user first, then atomically claim a code. If code claim fails, delete the user.
    const user = new User({ email, password });
    await user.save();

    const claimed = await RegistrationCode.findOneAndUpdate(
      { $or: [ { normalizedCode: norm }, { code: display } ], used: false },
      { $set: { used: true, usedBy: user._id, usedAt: new Date() } },
      { new: true }
    );

    if (!claimed) {
      // Roll back user creation since we failed to claim a valid code
      try { await User.deleteOne({ _id: user._id }); } catch (_) {}
      return res.status(400).json({ error: 'Registration code is invalid or already used' });
    }

    // Save code reference on user
    user.registrationCode = claimed.code;
    user.registrationCodeId = claimed._id;
    await user.save();

    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    // Handle duplicate email, validation errors, etc.
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
