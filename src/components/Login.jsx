import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Email designs from chromexmarketing.com (Framer CDN, scaled down for speed)
const CDN = 'https://framerusercontent.com/images/'
const EMAILS = [
  'qcyiVwkA6JIH5hrGCckOWomDzw.jpg',
  '8d2LTmbmcst1x8Rbe6kyNuAtE.jpg',
  '0RXgSeUATtAYujjAfas25KgmJuo.jpg',
  'gW5hTauYyyYKzo8t0jsSVtILrU.jpg',
  'wIsSIhnRM3RYakB9VVitADkd0.jpg',
  'OF9v4xBIJQ54jbYta2dz2rwv1g.jpg',
  'VRTdudFqK0PXTxESM3YWyuBQQo.jpg',
  'GrSwG2A4YGlv1lEYOd0aQqIwik.jpg',
  'LDWYRkl8yKOj801BGnxo1r9d8qo.jpg',
  'sm9RgPrGbGud75Uw1FMu3I1ZPPI.jpg',
  'Sheskzhl3ayO2XFZa827yjQlEh0.jpg',
  'kYf8KB47GcgcV6d5NbyVtyODIq4.jpg',
  '62G13kTov641fWCJWxSxF8MRgxc.jpg',
  '8zLeXnNUmSi11rHWjMmrX7bX1M.jpg',
  'gBfNbKK0Zco9k569ZAQ5HeO39s.jpg',
  'nrzK6UdBHxv4TwytQ7Oh2zK7k.jpg',
  'AcA2bAqadT93HVJKTfyNBlLTUCU.png',
  'O3rWbIzzWKBmRu2ZRpu6uDsz9Y.jpg',
].map(f => `${CDN}${f}?scale-down-to=512`)

const COLS = 6
const columns = Array.from({ length: COLS }, (_, c) =>
  // triple the pool so every column has plenty to fill tall screens
  [...EMAILS, ...EMAILS, ...EMAILS].filter((_, i) => i % COLS === c)
)

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    setError('')
    if (!email || !password) { setError('Enter your email and password.'); return }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <div className="nf-wrap">
      {/* Tilted email poster wall */}
      <div className="nf-wall" aria-hidden>
        {columns.map((col, c) => (
          <div className={`nf-col ${c % 2 ? 'nf-col-offset' : ''}`} key={c}>
            {col.map((src, i) => (
              <img src={src} alt="" key={i} loading="lazy" draggable={false} />
            ))}
          </div>
        ))}
      </div>

      {/* Dark overlay */}
      <div className="nf-overlay" aria-hidden />

      {/* Brand, top-left like the reference */}
      <div className="nf-brand">
        <img src="/logo.webp" alt="" />
        <span>Chromex<em>.</em></span>
      </div>

      {/* Centered sign-in card */}
      <div className="nf-card">
        <h1>Sign in</h1>
        <p className="nf-sub">Log in to your marketing hub</p>

        <label className="label">Email</label>
        <input
          className="input" type="email" value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="you@yourbrand.com" autoComplete="email"
        />
        <label className="label">Password</label>
        <input
          className="input" type="password" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="••••••••" autoComplete="current-password"
        />
        {error && <p className="error-text">{error}</p>}
        <button className="btn nf-btn" onClick={handleSubmit} disabled={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}
