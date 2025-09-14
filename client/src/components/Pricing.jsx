import React, { useMemo, useState, useEffect } from 'react'
import axios from 'axios'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function Pricing() {
  const [params] = useSearchParams()
  const [annual, setAnnual] = useState(true)
  const navigate = useNavigate()
  const plans = useMemo(() => ([
    {
      key: 'hobby',
      name: 'Hobbyist',
      price: annual ? 20 : 16,
      tagline: 'Elevate your projects, watermark-free',
      features: [
        '10 transcription hours / month',
        'Export 1080p, watermark-free',
        '20 uses / month of Basic AI Actions suite',
        '30 minutes / month of AI speech',
        '5 minutes / month of avatars'
      ],
      priceId: annual ? (import.meta.env.VITE_STRIPE_PRICE_HOBBY_MONTHLY || '') : (import.meta.env.VITE_STRIPE_PRICE_HOBBY_ANNUAL || '')
    },
    {
      key: 'creator',
      name: 'Creator',
      price: annual ? 30 : 24,
      popular: true,
      tagline: 'Unlock advanced AI-powered creativity',
      features: [
        '30 transcription hours / month',
        'Export 4k, watermark-free',
        'Unlimited Basic + Advanced AI Actions',
        '2 hours / month of AI speech',
        '30 minutes / month of dubbing in 20+ languages',
        '10 minutes / month of avatars',
        'Royalty-free stock library'
      ],
      priceId: annual ? (import.meta.env.VITE_STRIPE_PRICE_CREATOR_MONTHLY || '') : (import.meta.env.VITE_STRIPE_PRICE_CREATOR_ANNUAL || '')
    },
    {
      key: 'business',
      name: 'Business',
      price: annual ? 60 : 50,
      tagline: 'Empower collaboration on your team',
      features: [
        '40 transcription hours / month',
        'Team-wide access to Brand Studio',
        'Full Professional AI Actions suite',
        '5 hours / month of AI speech',
        '2 hours / month of dubbing in 20+ languages',
        '30 minutes / month of avatars',
        'Priority support (with SLA)'
      ],
      priceId: annual ? (import.meta.env.VITE_STRIPE_PRICE_BUSINESS_MONTHLY || '') : (import.meta.env.VITE_STRIPE_PRICE_BUSINESS_ANNUAL || '')
    }
  ]), [annual])

  useEffect(() => {
    const a = params.get('annual')
    if (a === '0') setAnnual(false)
    if (a === '1') setAnnual(true)
  }, [params])

  const startCheckout = async (priceId) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        navigate(`/register?returnTo=${encodeURIComponent('/pricing')}`)
        return
      }
      const { data } = await axios.post('/api/billing/checkout', { priceId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const url = data?.url || 'https://checkout.stripe.com/pay/cs_test_stub'
      window.location.href = url
    } catch (e) {
      const status = e?.response?.status
      if (status === 401) {
        navigate(`/login?returnTo=${encodeURIComponent('/pricing')}`)
        return
      }
      alert(e?.response?.data?.error || 'Failed to start checkout')
    }
  }

  return (
    <div className="wrap" style={{ padding: '24px 20px' }}>
      <div className="form-card" style={{ maxWidth: 980, margin: '0 auto 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="section-title" style={{ margin: 0 }}>Pricing</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)' }}>Annual</span>
            <label className="toggle">
              <input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} />
              <span className="slider" />
            </label>
            <span style={{ color: 'var(--muted)' }}>Monthly</span>
          </div>
        </div>
        <div style={{ color: 'var(--muted)', marginTop: 8 }}>Saving up to 35% over monthly plan</div>
      </div>

      <div className="pricing-grid">
        {plans.map((p) => (
          <div key={p.key} className={`card pricing-card ${p.popular ? 'popular' : ''}`}>
            {p.popular && <div className="badge-popular">Most Popular</div>}
            <div className="pricing-head">
              <div className="pricing-name">{p.name}</div>
              <div className="pricing-price">
                <span className="currency">$</span>
                <span className="amount">{p.price}</span>
              </div>
              <div className="pricing-meta">per person / month</div>
            </div>
            <div className="pricing-tagline">{p.tagline}</div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={() => startCheckout(p.priceId)}>Get started →</button>
            <ul className="pricing-list">
              {p.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
