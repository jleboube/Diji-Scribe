import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Admin() {
  const [status, setStatus] = useState('available')
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [count, setCount] = useState(0)
  const [n, setN] = useState(50)
  const [error, setError] = useState('')

  useEffect(() => { fetchCodes() }, [status])

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

  const fetchCodes = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get(`/api/admin/registration-codes?status=${status}`, { headers: authHeaders() })
      setCodes(data.codes || [])
      setCount(data.count || 0)
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to fetch codes')
      setCodes([])
      setCount(0)
    } finally {
      setLoading(false)
    }
  }

  const generate = async () => {
    setLoading(true)
    try {
      await axios.post('/api/admin/registration-codes/generate', { n: Number(n) || 50 }, { headers: authHeaders() })
      await fetchCodes()
      alert('Generated codes')
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to generate codes')
    } finally { setLoading(false) }
  }

  const topup = async () => {
    setLoading(true)
    try {
      const { data } = await axios.post('/api/admin/registration-codes/topup', {}, { headers: authHeaders() })
      await fetchCodes()
      alert(`Top-up done. Available: ${data.after}`)
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to top up')
    } finally { setLoading(false) }
  }

  const copyAll = async () => {
    const text = codes.map(c => c.code).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard')
    } catch (_) {
      alert('Copy failed')
    }
  }

  return (
    <div className="wrap" style={{ padding: '24px 20px' }}>
      <div className="form-card" style={{ maxWidth: 900, margin: '0 auto 16px' }}>
        <h2 className="section-title" style={{ marginBottom: 8 }}>Admin: Registration Codes</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="available">Available</option>
            <option value="used">Used</option>
          </select>
          <button className="btn btn-secondary" onClick={fetchCodes} disabled={loading}>Refresh</button>
          <button className="btn btn-secondary" onClick={copyAll} disabled={!codes.length}>Copy All</button>
        </div>
      </div>

      <div className="form-card" style={{ maxWidth: 900, margin: '0 auto 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="label" style={{ margin: 0 }}>Generate N</label>
          <input className="input" type="number" min="1" max="500" value={n} onChange={(e) => setN(e.target.value)} style={{ width: 120 }} />
          <button className="btn btn-primary" onClick={generate} disabled={loading}>Generate</button>
          <button className="btn btn-secondary" onClick={topup} disabled={loading}>Top up</button>
        </div>
      </div>

      <div className="form-card" style={{ maxWidth: 900, margin: '0 auto' }}>
        {loading ? (
          <div>Loading…</div>
        ) : error ? (
          <div style={{ color: 'crimson' }}>{error}</div>
        ) : (
          <div>
            <div style={{ color: 'var(--muted)', marginBottom: 8 }}>Total: {count}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {codes.map((c) => (
                <div key={c.code} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
                  <div>{c.code}</div>
                  {c.used && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Used</div>}
                </div>
              ))}
              {!codes.length && <div>No codes.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
