// server/routes/billing.js
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Reuse auth pattern
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.userId;
    next();
  });
};

// Create a Stripe Checkout Session (subscription)
router.post('/checkout', verifyToken, async (req, res) => {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    const price = String(req.body?.priceId || '');
    const successUrl = process.env.STRIPE_SUCCESS_URL || 'https://example.com/success';
    const cancelUrl = process.env.STRIPE_CANCEL_URL || 'https://example.com/cancel';

    if (!price) return res.status(400).json({ error: 'Missing priceId' });

    // If Stripe is not configured, return a stub URL for testing navigation
    if (!secret) {
      return res.json({ url: 'https://checkout.stripe.com/pay/cs_test_stub' });
    }

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('line_items[0][price]', price);
    params.set('line_items[0][quantity]', '1');
    params.set('client_reference_id', String(req.userId || '')); // associate checkout with user

    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return res.status(502).json({ error: `Stripe error: ${resp.status} ${t}` });
    }
    const json = await resp.json();
    return res.json({ url: json?.url || null });
  } catch (e) {
    console.error('Stripe checkout error:', e);
    res.status(500).json({ error: e?.message || 'Internal Server Error' });
  }
});

module.exports = router;

