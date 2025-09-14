import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Dashboard() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [tLoading, setTLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reProvider, setReProvider] = useState('auto')

  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await axios.get('/api/files', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
        setFiles(data.files || [])
      } catch (e) {
        setError(e?.response?.data?.error || 'Failed to load files')
      } finally {
        setLoading(false)
      }
    }
    fetchFiles()
  }, [])

  return (
    <div className="wrap" style={{ padding: '24px 20px' }}>
      <div className="form-card" style={{ maxWidth: 900, margin: '0 auto 16px' }}>
        <h2 className="section-title" style={{ marginBottom: 8 }}>Dashboard</h2>
        <div style={{ color: 'var(--muted)' }}>Manage your processed files and transcripts. Choose a provider to re-transcribe if needed.</div>
        <div style={{ marginTop: 12 }}>
          Re-transcribe provider:{' '}
          <select className="input select" value={reProvider} onChange={(e) => setReProvider(e.target.value)} style={{ maxWidth: 260 }}>
            <option value="auto">Auto (OpenAI → Deepgram → AssemblyAI)</option>
            <option value="openai">OpenAI only</option>
            <option value="deepgram">Deepgram only</option>
            <option value="assemblyai">AssemblyAI only</option>
          </select>
        </div>
      </div>

      {loading && <div className="form-card" style={{ maxWidth: 900, margin: '0 auto' }}>Loading…</div>}
      {!!error && <div className="form-card" style={{ maxWidth: 900, margin: '0 auto', color: 'crimson' }}>{error}</div>}

      {!loading && !error && (
        files.length === 0 ? (
          <div className="form-card" style={{ maxWidth: 900, margin: '0 auto' }}>No files yet.</div>
        ) : (
          <div className="file-list">
            {files.map(f => (
              <div key={f.id} className="card file-card">
                <div className="file-head">
                  <div className="file-name">{f.originalName}</div>
                  <div className="file-meta">Status: {f.status} • {new Date(f.createdAt).toLocaleString()} • {f.encrypted ? 'Encrypted' : 'Not encrypted'}</div>
                </div>
                <div className="file-actions">
                  {f.processedUrl && <a className="btn btn-secondary" href={f.processedUrl} target="_blank" rel="noreferrer">Download original</a>}
                  {f.transcriptUrl && <a className="btn btn-secondary" href={f.transcriptUrl} target="_blank" rel="noreferrer">Download transcript</a>}
                  <button className="btn btn-primary" onClick={async () => {
                    try {
                      const { data } = await axios.post(`/api/files/${f.id}/retranscribe`, { provider: reProvider }, {
                        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                      })
                      alert('Re-transcription complete')
                      const resp = await axios.get('/api/files', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
                      setFiles(resp.data.files || [])
                      if (data?.transcriptUrl) window.open(data.transcriptUrl, '_blank')
                    } catch (e) {
                      alert(e?.response?.data?.error || 'Re-transcription failed')
                    }
                  }}>Re-transcribe</button>
                  <button className="btn btn-secondary"
                    onClick={async () => {
                      if (activeId === f.id) {
                        setActiveId(null)
                        setTranscript('')
                        return
                      }
                      setActiveId(f.id)
                      setTLoading(true)
                      try {
                        const { data } = await axios.get(`/api/files/${f.id}/transcript`, {
                          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                          responseType: 'text'
                        })
                        setTranscript(typeof data === 'string' ? data : String(data))
                      } catch (e) {
                        alert(e?.response?.data?.error || 'Failed to load transcript')
                        setActiveId(null)
                        setTranscript('')
                      } finally {
                        setTLoading(false)
                      }
                    }}
                  >{activeId === f.id ? 'Hide transcript' : 'View/Edit transcript'}</button>
                </div>
                {activeId === f.id && (
                  <div className="file-editor">
                    {tLoading ? (
                      <p>Loading transcript…</p>
                    ) : (
                      <>
                        <textarea className="textarea" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
                        <div className="file-actions">
                          <button className="btn btn-primary" disabled={saving} onClick={async () => {
                            setSaving(true)
                            try {
                              const { data } = await axios.post(`/api/files/${f.id}/revise`, { text: transcript }, {
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }
                              })
                              alert('Saved revised transcript')
                              if (data?.revisedTranscriptUrl) window.open(data.revisedTranscriptUrl, '_blank')
                            } catch (e) {
                              alert(e?.response?.data?.error || 'Failed to save revised transcript')
                            } finally {
                              setSaving(false)
                            }
                          }}>{saving ? 'Saving…' : 'Save as revised'}</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
