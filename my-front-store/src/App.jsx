import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom'
import './App.css'

// Simple in-memory/localStorage backed product store for the demo
const PRODUCTS_KEY = 'chowdesk:products'
function loadProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function saveProducts(products) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products))
}

function useAuth() {
  const [user, setUser] = useState(() => localStorage.getItem('chowdesk:token') || null)
  const login = (username) => {
    // For the demo, accept any username and store a token
    const token = `token:${username}:${Date.now()}`
    localStorage.setItem('chowdesk:token', token)
    setUser(token)
  }
  const logout = () => {
    localStorage.removeItem('chowdesk:token')
    setUser(null)
  }
  return { user, login, logout }
}

function RequireAuth({ children }) {
  const token = localStorage.getItem('chowdesk:token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

function LoginPage() {
  const [username, setUsername] = useState('')
  const navigate = useNavigate()
  const auth = useAuth()

  function submit(e) {
    e.preventDefault()
    if (!username.trim()) return
    auth.login(username.trim())
    navigate('/admin')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Admin login</h2>
        <form onSubmit={submit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" placeholder="(any for demo)" />
          </label>
          <div className="login-actions">
            <button type="submit" className="primary-button">Sign in</button>
            <Link to="/">Back to store</Link>
          </div>
        </form>
      </div>
    </div>
  )
}

function AdminShell({ children }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const handleLogout = () => {
    auth.logout()
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
          <h1>Welcome back, Operator</h1>
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

    // gradient fill
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
  const [products, setProducts] = useState(loadProducts)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', price: '', sku: '' })

  useEffect(() => saveProducts(products), [products])

  function startAdd() {
    setEditing(null)
    setForm({ name: '', price: '', sku: '' })
  }
  function startEdit(p) {
    setEditing(p.sku)
    setForm({ name: p.name, price: p.price, sku: p.sku })
  }
  function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editing) {
      setProducts((prev) => prev.map((p) => p.sku === editing ? { ...p, ...form } : p))
    } else {
      setProducts((prev) => [{ ...form, id: Date.now() }, ...prev])
    }
    setEditing(null)
    setForm({ name: '', price: '', sku: '' })
  }
  function remove(sku) {
    if (!confirm('Remove product?')) return
    setProducts((prev) => prev.filter((p) => p.sku !== sku))
  }

  return (
    <div>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Products</p>
          <h3>Product management</h3>
        </div>
        <div>
          <button type="button" className="panel-button" onClick={startAdd}>New product</button>
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
          {products.length ? products.map((p) => (
            <div key={p.sku} className="stock-item">
              <div>
                <strong>{p.name}</strong>
                <small>{p.sku}</small>
              </div>
              <div className="stock-meta">
                <span>{p.price || '—'}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="panel-button muted" onClick={() => startEdit(p)}>Edit</button>
                  <button type="button" className="panel-button muted" onClick={() => remove(p.sku)}>Remove</button>
                </div>
              </div>
            </div>
          )) : <p>No products yet</p>}
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
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
  )
}

