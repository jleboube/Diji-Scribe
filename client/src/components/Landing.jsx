import React from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()
  const authed = !!localStorage.getItem('token')
  const [annual, setAnnual] = React.useState(true)

  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">Scale Your Transcription Workflow Without Scaling Your Team</h1>
          <p className="hero-sub">AutoTranscribe streamlines your entire workflow—secure uploads, automated virus scanning, optional encryption for PII/PCI, and accurate transcription powered by OpenAI, Deepgram, and AssemblyAI. Faster turnarounds. Fewer bottlenecks.</p>
          <div className="hero-ctas">
            <Link className="btn btn-primary" to="/register">Create Your Account</Link>
            {authed ? (
              <button className="btn btn-secondary" onClick={() => navigate('/upload')}>Go to Uploads</button>
            ) : (
              <Link className="btn btn-secondary" to="/login">Login</Link>
            )}
          </div>
        </div>
        <div className="hero-visual">
          <div className="demo-card">
            <div className="demo-row">
              <div className="demo-badge">Upload</div>
              <div className="demo-pulse" />
            </div>
            <div className="demo-row">
              <div className="demo-badge">Virus Scan</div>
              <div className="demo-pulse" />
            </div>
            <div className="demo-row">
              <div className="demo-badge">Encrypt (PII/PCI)</div>
              <div className="demo-pulse" />
            </div>
            <div className="demo-row">
              <div className="demo-badge">Transcribe: Auto</div>
              <div className="demo-pulse" />
            </div>
            <div className="pill-row">
              <span className="pill-openai">OpenAI</span>
              <span className="pill-deepgram">Deepgram</span>
              <span className="pill-assembly">AssemblyAI</span>
            </div>
            <WaveToText />
          </div>
        </div>
      </section>

      {/* Problem - Solution (card layout like features) */}
      <section className="wrap section">
        <h2 className="section-title center">What We Fix</h2>
        <div className="info-grid">
          <div className="card info-card">
            <div className="info-title">The Problem</div>
            <ul className="list" style={{ margin: 0 }}>
              <li>High volume requests overwhelm small teams.</li>
              <li>Security steps (scanning, encryption) add friction and risk.</li>
              <li>Accuracy fluctuates; tough audio slows delivery.</li>
              <li>Hiring to keep up is costly and slow.</li>
            </ul>
          </div>
          <div className="card info-card">
            <div className="info-title">Our Solution</div>
            <p style={{ margin: 0, color: 'var(--muted)' }}>AutoTranscribe centralizes the entire pipeline. Upload once—then the platform handles virus scanning, optional AES-256 encryption for PII/PCI, and transcription through OpenAI, Deepgram, and AssemblyAI.</p>
            <div style={{ marginTop: 8, fontWeight: 700 }}>Reliability up, overhead down.</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div className="wrap">
          <h2 className="section-title center">Built to Move Work Forward</h2>
          <div className="grid">
            <FeatureCard icon="⚙️" title="Automated Pipeline" desc="One upload triggers scanning, optional encryption, and transcription—no juggling tools." benefit="Save hours weekly by removing manual steps." />
            <FeatureCard icon="🎯" title="Multi-Engine Accuracy" desc="OpenAI + Deepgram + AssemblyAI built in—choose your provider or let Auto handle it." benefit="Consistent results on challenging audio." />
            <FeatureCard icon="🛡️" title="Security First" desc="ClamAV virus scanning and AES-256 encryption for PII/PCI." benefit="Peace of mind and simpler compliance posture." />
            <FeatureCard icon="📊" title="Unified Dashboard" desc="Track status, download originals, and edit transcripts in one place." benefit="Visibility and control across every request." />
          </div>
        </div>
      </section>

      {/* Providers (card layout) */}
      <section className="wrap section">
        <h2 className="section-title center">Powered by Leading AI Engines</h2>
        <div className="providers-grid">
          <div className="card provider">
            <div className="provider-head">
              <div className="provider-icon oi" aria-hidden>O</div>
              <div className="provider-title">OpenAI Whisper</div>
            </div>
            <div className="provider-desc">High-quality transcription with strong general accuracy. Used first when files are within configured size limits.</div>
          </div>
          <div className="card provider">
            <div className="provider-head">
              <div className="provider-icon dg" aria-hidden>D</div>
              <div className="provider-title">Deepgram Nova-2</div>
            </div>
            <div className="provider-desc">Fast and reliable with smart formatting and punctuation. Fallback or primary depending on your selection.</div>
          </div>
          <div className="card provider">
            <div className="provider-head">
              <div className="provider-icon aa" aria-hidden>A</div>
              <div className="provider-title">AssemblyAI Universal</div>
            </div>
            <div className="provider-desc">Robust transcription API with upload + async processing. Available as a selectable provider or auto fallback.</div>
          </div>
        </div>
      </section>

      {/* Mini Pricing Teasers */}
      <section className="wrap section">
          <h2 className="section-title center">Simple Plans for Any Workflow</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: 'var(--muted)' }}>Annual</span>
            <label className="toggle">
              <input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} />
              <span className="slider" />
            </label>
            <span style={{ color: 'var(--muted)' }}>Monthly</span>
          </div>
          <MiniPricing annual={annual} />
      </section>

      {/* Final CTA */}
      <section className="cta-band">
        <div className="wrap cta-inner">
          <div className="cta-surface">
            <h3 className="cta-title">Stop wrestling with backlogs. Deliver secure, accurate transcripts on time—every time.</h3>
            <div className="hero-ctas" style={{ justifyContent: 'center', marginTop: 12 }}>
              <Link className="btn btn-primary" to="/register">Create Your Account</Link>
              {authed ? (
                <button className="btn btn-secondary" onClick={() => navigate('/upload')}>Upload a File</button>
              ) : (
                <Link className="btn btn-secondary" to="/login">Login</Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function WaveToText() {
  const sentences = [
    'Machine learning is employed in a range of computing tasks where designing and programming explicit algorithms with good performance is difficult or infeasible.',
    'Example applications include email filtering, detection of network intruders, and computer vision. Machine learning is closely related to computational statistics, which also focuses on predictions making through the use of computer.'
  ]

  const [phase, setPhase] = React.useState('wave') // 'wave' | 'type'
  const [shown, setShown] = React.useState(0)
  const [idx, setIdx] = React.useState(0)
  const text = sentences[idx]

  React.useEffect(() => {
    let t1, t2, t3
    if (phase === 'wave') {
      // Show wave ~2.2s then type next sentence
      t1 = setTimeout(() => {
        setShown(0)
        setPhase('type')
      }, 2200)
    } else if (phase === 'type') {
      // Typewriter effect
      const step = Math.max(1, Math.floor(text.length / 48))
      t2 = setInterval(() => {
        setShown((n) => {
          if (n + step >= text.length) {
            clearInterval(t2)
            t3 = setTimeout(() => {
              setIdx((i) => (i + 1) % sentences.length)
              setPhase('wave')
            }, 2000)
            return text.length
          }
          return n + step
        })
      }, 35)
    }
    return () => { if (t1) clearTimeout(t1); if (t2) clearInterval(t2); if (t3) clearTimeout(t3) }
  }, [phase, text])

  if (phase === 'wave') {
    const bars = Array.from({ length: 56 }, (_, i) => i)
    return (
      <div className="demo-transcript">
        <div className="wave">
          {bars.map((i) => (
            <span key={i} className="eq-bar" style={{ animationDelay: `${(i % 8) * 0.1}s` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="demo-transcript">
      <div className="typed-text">{text.slice(0, shown)}</div>
    </div>
  )
}

function FeatureCard({ icon, title, desc, benefit }) {
  return (
    <div className="card feature">
      <div className="feature-icon" aria-hidden>{icon}</div>
      <div className="feature-title">{title}</div>
      <div className="feature-desc">{desc}</div>
      <div className="feature-benefit">{benefit}</div>
    </div>
  )
}

function Testimonial({ quote, name, role }) {
  return (
    <div className="card testimonial">
      <div className="avatar" aria-hidden>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="12" r="8" fill="#E6E8F2" />
          <rect x="6" y="24" width="28" height="12" rx="6" fill="#E6E8F2" />
        </svg>
      </div>
      <blockquote className="quote">“{quote}”</blockquote>
      <div className="author">{name} • {role}</div>
    </div>
  )
}

function MiniPricing({ annual }) {
  const items = [
    { key: 'hobby', name: 'Hobbyist', price: annual ? '$20' : '$16', caption: 'per person / month' },
    { key: 'creator', name: 'Creator', price: annual ? '$30' : '$24', caption: 'per person / month', popular: true },
    { key: 'business', name: 'Business', price: annual ? '$60' : '$50', caption: 'per person / month' }
  ]
  return (
    <div className="mini-pricing-grid">
      {items.map(i => (
        <div key={i.key} className={`card mini-pricing ${i.popular ? 'popular' : ''}`}>
          {i.popular && <div className="mini-badge-popular">Most Popular</div>}
          <div className="mini-head">
            <div className="mini-name">{i.name}</div>
            <div className="mini-price">{i.price}<span className="mini-caption"> {i.caption}</span></div>
          </div>
          <a className="btn btn-secondary" href={`/pricing?annual=${annual ? '1' : '0'}`} style={{ width: '100%' }}>See pricing</a>
        </div>
      ))}
    </div>
  )
}
