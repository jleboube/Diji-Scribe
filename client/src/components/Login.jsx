import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate, useLocation, Link } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await axios.post('/api/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      localStorage.setItem('userEmail', data.email || email)
      const params = new URLSearchParams(location.search)
      const next = params.get('returnTo')
      navigate(next || '/upload')
    } catch (err) {
      alert(err?.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap wrap">
      <form onSubmit={onSubmit} className="form-card">
        <h2 className="section-title" style={{ marginBottom: 8 }}>Login</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 16 }}>Welcome back. Enter your credentials to continue.</p>
        <label className="label">Email
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </label>
        <label className="label">Password
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 6 }}>
          {loading ? 'Loading…' : 'Login'}
        </button>
        <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 10 }}>
          Don’t have an account? <Link to="/register">Register</Link>
        </div>
      </form>
    </div>
  )
}
