import React, { useState } from 'react'
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import Register from './components/Register.jsx'
import Login from './components/Login.jsx'
import Upload from './components/Upload.jsx'
import Dashboard from './components/Dashboard.jsx'
import Landing from './components/Landing.jsx'
import Admin from './components/Admin.jsx'
import Pricing from './components/Pricing.jsx'

const isAuthed = () => !!localStorage.getItem('token')
const isAdminUser = () => (localStorage.getItem('userEmail') || '').toLowerCase() === 'joeleboube@yahoo.com'

const PrivateRoute = ({ children }) => {
  return isAuthed() ? children : <Navigate to="/login" />
}

const PrivateAdminRoute = ({ children }) => {
  if (!isAuthed()) return <Navigate to="/login" />
  if (!isAdminUser()) return <Navigate to="/" />
  return children
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const adminVisible = isAdminUser()
  const logout = () => {
    localStorage.removeItem('token')
    navigate('/login')
    setMenuOpen(false)
  }

  React.useEffect(() => {
    // Close mobile menu on route change
    setMenuOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  React.useEffect(() => {
    // Prevent body scroll when menu is open
    if (menuOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [menuOpen])

  return (
    <div>
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            <div className="brand-mark" />
            <Link to="/">AutoTranscribe</Link>
          </div>
          <button className="hamburger" aria-label="Menu" onClick={() => setMenuOpen(v => !v)}>
            <span />
            <span />
            <span />
          </button>
          <nav className="nav">
            <Link to="/upload">Upload</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/pricing">Pricing</Link>
            {adminVisible && <Link to="/admin">Admin</Link>}
            {isAuthed() ? (
              <button className="btn btn-secondary" onClick={logout}>Logout</button>
            ) : (
              <>
                <Link to="/login">Login</Link>
                <Link className="btn btn-primary" to="/register">Register</Link>
              </>
            )}
          </nav>
        </header>
      </div>
      {menuOpen && (
        <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
          <div className="mobile-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-links">
              <Link to="/" onClick={() => setMenuOpen(false)}>Home</Link>
              <Link to="/upload" onClick={() => setMenuOpen(false)}>Upload</Link>
              <Link to="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</Link>
              <Link to="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
              {adminVisible && <Link to="/admin" onClick={() => setMenuOpen(false)}>Admin</Link>}
            </div>
            <div className="mobile-actions">
              {isAuthed() ? (
                <button className="btn btn-secondary" onClick={logout}>Logout</button>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMenuOpen(false)}>Login</Link>
                  <Link className="btn btn-primary" to="/register" onClick={() => setMenuOpen(false)}>Register</Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/upload" element={<PrivateRoute><Upload /></PrivateRoute>} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/admin" element={<PrivateAdminRoute><Admin /></PrivateAdminRoute>} />
        </Routes>
      </main>
    </div>
  )
}
