import React, { useState } from 'react'
import axios from 'axios'

export default function Upload() {
  const [file, setFile] = useState(null)
  const [hasPII, setHasPII] = useState(false)
  const [hasPCI, setHasPCI] = useState(false)
  const [provider, setProvider] = useState('auto') // auto | openai | deepgram
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!file) return alert('Please select a file')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('hasPII', String(hasPII))
    formData.append('hasPCI', String(hasPCI))
    formData.append('provider', provider)
    setLoading(true)
    try {
      await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      })
      alert('Uploaded and processing!')
    } catch (err) {
      alert(err?.response?.data?.error || 'Upload failed')
    } finally {
      setLoading(false)
      setFile(null)
      setHasPII(false)
      setHasPCI(false)
      setProvider('auto')
    }
  }

  return (
    <div className="auth-wrap wrap">
      <form onSubmit={onSubmit} className="form-card" style={{ maxWidth: 540 }}>
        <h2 className="section-title" style={{ marginBottom: 8 }}>Upload File</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 16 }}>Scan, optionally encrypt, and transcribe with your preferred provider.</p>

        <label className="label">Select audio/video file
          <input className="input" type="file" accept="audio/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>

        <div style={{ display: 'grid', gap: 8 }}>
          <label className="label" style={{ fontWeight: 500 }}>
            <input className="checkbox" type="checkbox" checked={hasPII} onChange={(e) => setHasPII(e.target.checked)} />
            <span style={{ marginLeft: 8 }}>Contains PII?</span>
          </label>
          <label className="label" style={{ fontWeight: 500 }}>
            <input className="checkbox" type="checkbox" checked={hasPCI} onChange={(e) => setHasPCI(e.target.checked)} />
            <span style={{ marginLeft: 8 }}>Contains PCI?</span>
          </label>
        </div>

        <label className="label">Provider
          <select className="input select" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="auto">Auto (OpenAI → Deepgram → AssemblyAI)</option>
            <option value="openai">OpenAI only</option>
            <option value="deepgram">Deepgram only</option>
            <option value="assemblyai">AssemblyAI only</option>
          </select>
        </label>

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 6 }}>
          {loading ? 'Uploading…' : 'Upload'}
        </button>
      </form>
    </div>
  )
}
