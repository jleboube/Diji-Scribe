import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate, useLocation, Link } from 'react-router-dom'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await axios.post('/api/auth/register', { email, password, code })
      alert('Registered! Please log in.')
      const params = new URLSearchParams(location.search)
      const next = params.get('returnTo')
      navigate(`/login${next ? `?returnTo=${encodeURIComponent(next)}` : ''}`)
    } catch (err) {
      alert(err?.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap wrap">
      <form onSubmit={onSubmit} className="form-card">
        <h2 className="section-title" style={{ marginBottom: 8 }}>Register</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 16 }}>Create your account to start uploading and transcribing securely.</p>
        <label className="label">Email
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </label>
        <label className="label">Password
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} />
        </label>
        <label className="label">Registration code
          <input className="input" type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH-IJKL" required />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 6 }}>
          {loading ? 'Loading…' : 'Register'}
        </button>
        <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 10 }}>
          Already have an account? <Link to="/login">Login</Link>
        </div>
      </form>
    </div>
  )
}
