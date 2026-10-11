import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://e-backend-rust.vercel.app'

// ---------- Auth context and helpers ----------
const AuthContext = createContext(null)

function useAuthContext() {
  return useContext(AuthContext)
}

function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('chowdesk:token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!token)

  useEffect(() => {
    async function fetchMe() {
      if (!token) return setLoading(false)
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error('Invalid token')
        const data = await res.json()
        setUser(data.user || null)
      } catch (err) {
        console.warn('Auth verify failed', err)
        localStorage.removeItem('chowdesk:token')
        setToken(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    fetchMe()
  }, [token])

  const loginWithToken = (t) => {
    localStorage.setItem('chowdesk:token', t)
    setToken(t)
  }
  const logout = () => {
    localStorage.removeItem('chowdesk:token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

function fetchWithAuth(path, opts = {}) {
  if (!API_BASE_URL) throw new Error('API_BASE_URL is not configured')
  const token = localStorage.getItem('chowdesk:token')
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${API_BASE_URL}${path}`, { ...opts, headers })
}

function RequireAuth({ children }) {
  const { token, loading } = useAuthContext()
  const location = useLocation()
  if (loading) return <div style={{ padding: 24 }}>Checking authentication…</div>
  if (!token) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  return children
}

// ---------- Login and OAuth callback ----------
function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const next = new URLSearchParams(location.search).get('next') || '/admin'

  async function submitForm(e) {
    e.preventDefault()
    setError('')
    if (!API_BASE_URL) return setError('API base URL not configured (set VITE_API_BASE_URL)')
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Login failed')
      }
      const data = await res.json()
      if (data.token) {
        localStorage.setItem('chowdesk:token', data.token)
        navigate(next)
      } else {
        throw new Error('No token returned')
      }
    } catch (err) {
      setError(err.message)
    }
  }

  function startOAuth() {
    if (!API_BASE_URL) return setError('API base URL not configured')
    // Redirect to backend OAuth authorize endpoint. Backend should handle client_id, state, redirect_uri.
    const redirectUri = `${window.location.origin}/auth/callback`
    window.location.href = `${API_BASE_URL}/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Admin sign in</h2>

        <div className="oauth-actions">
          <button type="button" className="primary-button" onClick={startOAuth}>Sign in with OAuth</button>
        </div>

        <div className="divider">or</div>

        <form onSubmit={submitForm} className="local-login">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="login-actions">
            <button type="submit" className="primary-button">Sign in</button>
            <Link to="/">Back to store</Link>
          </div>
        </form>

        <p className="login-help">If you prefer OAuth, use the button above. Backend must expose /oauth/authorize and /api/auth/oauth/token endpoints.</p>
      </div>
    </div>
  )
}

function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      if (!code) return setError('Authorization code not found in callback URL')
      try {
        const redirectUri = `${window.location.origin}/auth/callback`
        const res = await fetch(`${API_BASE_URL}/api/auth/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirect_uri: redirectUri }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.message || 'Token exchange failed')
        }
        const data = await res.json()
        if (!data.token) throw new Error('No token returned')
        localStorage.setItem('chowdesk:token', data.token)
        navigate('/admin')
      } catch (err) {
        setError(err.message)
      }
    }
    handleCallback()
  }, [navigate])

  if (error) return <div style={{ padding: 24 }}>OAuth error: {error}</div>
  return <div style={{ padding: 24 }}>Finishing sign in…</div>
}

// ---------- Admin UI (shell and pages) ----------
function AdminShell({ children }) {
  const navigate = useNavigate()
  const { logout } = useAuthContext()
  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="admin-page">
      <aside className="admin-sidebar">
        <div className="brand-block">
          <div className="brand-mark">C</div>
          <div>
            <strong>ChowDesk</strong>
            <span>Admin</span>
          </div>
        </div>

        <nav className="nav-menu" aria-label="Admin navigation">
          <Link className="nav-item" to="/admin">Overview</Link>
          <Link className="nav-item" to="/admin/products">Products</Link>
          <Link className="nav-item" to="/admin/inventory">Inventory</Link>
          <Link className="nav-item" to="/admin/customers">Customers</Link>
          <Link className="nav-item" to="/admin/analytics">Analytics</Link>
          <button type="button" className="nav-item" onClick={handleLogout}>Sign out</button>
        </nav>

        <div className="sidebar-card">
          <p>Monthly target</p>
          <strong>₦8.4M</strong>
          <div className="progress-track">
            <span style={{ width: '74%' }} />
          </div>
          <small>74% of goal reached</small>
        </div>
      </aside>

      <main className="admin-main">
        {children}
      </main>
    </div>
  )
}

function Overview() {
  return (
    <>
      <header className="admin-header">
        <div>
          <p className="eyebrow">Operations dashboard</p>
          <h1>Welcome back</h1>
        </div>
      </header>

      <section>
        <h2>Live revenue (demo)</h2>
        <LiveChart />
      </section>
    </>
  )
}

function LiveChart() {
  const canvasRef = useRef(null)
  const [data, setData] = useState(() => Array.from({ length: 24 }, () => Math.round(30 + Math.random() * 120)))

  useEffect(() => {
    const id = setInterval(() => {
      setData((prev) => {
        const next = prev.slice(1)
        next.push(Math.round(30 + Math.random() * 140))
        return next
      })
    }, 2000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width = canvas.clientWidth * devicePixelRatio
    const h = canvas.height = 140 * devicePixelRatio
    ctx.clearRect(0, 0, w, h)
    ctx.scale(devicePixelRatio, devicePixelRatio)

    const max = Math.max(...data) * 1.1
    const min = Math.min(...data) * 0.9
    const pad = 12
    const width = canvas.clientWidth - pad * 2
    const height = 140 - pad * 2

    ctx.beginPath()
    data.forEach((v, i) => {
      const x = pad + (i / (data.length - 1)) * width
      const y = pad + height - ((v - min) / (max - min || 1)) * height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.lineTo(pad + width, pad + height)
    ctx.lineTo(pad, pad + height)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(245,158,11,0.18)')
    grad.addColorStop(1, 'rgba(245,158,11,0.02)')
    ctx.fillStyle = grad
    ctx.fill()
  }, [data])

  return (
    <div className="chart-card">
      <canvas ref={canvasRef} style={{ width: '100%', height: 140 }} />
    </div>
  )
}

function ProductsPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', price: '', sku: '' })
  const { token } = useAuthContext()

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetchWithAuth('/api/admin/products')
        if (!res.ok) throw new Error('Failed to load products')
        const data = await res.json()
        setProducts(data.products || data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      let res
      if (editing) {
        res = await fetchWithAuth(`/api/admin/products/${encodeURIComponent(editing)}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        })
      } else {
        res = await fetchWithAuth('/api/admin/products', { method: 'POST', body: JSON.stringify(form) })
      }
      if (!res.ok) throw new Error('Save failed')
      const saved = await res.json()
      // reload list
      const listRes = await fetchWithAuth('/api/admin/products')
      const list = await listRes.json()
      setProducts(list.products || list)
      setEditing(null)
      setForm({ name: '', price: '', sku: '' })
    } catch (err) {
      alert(err.message)
    }
  }

  async function startEdit(p) {
    setEditing(p.id || p.sku)
    setForm({ name: p.name, price: p.price, sku: p.sku || '' })
  }

  async function remove(id) {
    if (!confirm('Remove product?')) return
    try {
      const res = await fetchWithAuth(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setProducts((prev) => prev.filter((x) => (x.id || x.sku) !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Products</p>
          <h3>Product management</h3>
        </div>
        <div>
          <button type="button" className="panel-button" onClick={() => { setEditing(null); setForm({ name: '', price: '', sku: '' }) }}>New product</button>
        </div>
      </div>

      <div className="panel">
        <form onSubmit={submit} className="product-form">
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            SKU
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </label>
          <label>
            Price
            <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="primary-button">{editing ? 'Save' : 'Add'}</button>
          </div>
        </form>

        <div style={{ marginTop: 18 }}>
          {loading ? <p>Loading products…</p> : (
            products.length ? products.map((p) => (
              <div key={(p.id || p.sku)} className="stock-item">
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.sku || p.id}</small>
                </div>
                <div className="stock-meta">
                  <span>{p.price || '—'}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="panel-button muted" onClick={() => startEdit(p)}>Edit</button>
                    <button type="button" className="panel-button muted" onClick={() => remove(p.id || p.sku)}>Remove</button>
                  </div>
                </div>
              </div>
            )) : <p>No products yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Analytics() {
  return (
    <div>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h3>Real-time overview</h3>
        </div>
      </div>
      <div className="panel">
        <p>Charts and live metrics live here (demo chart below).</p>
        <LiveChart />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route path="/admin/*" element={
            <RequireAuth>
              <AdminShell>
                <Routes>
                  <Route index element={<Overview />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="*" element={<Overview />} />
                </Routes>
              </AdminShell>
            </RequireAuth>
          } />

          <Route path="/" element={<div style={{padding:30}}><h2>Storefront placeholder</h2><p><Link to="/admin">Go to admin</Link> — or <Link to="/login">Sign in</Link></p></div>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
