import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Email designs: local tiles cut from our real campaigns, plus a few
// from chromexmarketing.com for variety
const CDN = 'https://framerusercontent.com/images/'
const EMAILS = [
  '/emails/katana-1.jpg',
  '/emails/wall-3.jpg',
  '/emails/pulga-1.jpg',
  '/emails/wall-5.jpg',
  '/emails/cleanhits-1.jpg',
  '/emails/wall-1.jpg',
  '/emails/science-1.jpg',
  '/emails/wall-6.jpg',
  '/emails/pouches-1.jpg',
  '/emails/wall-2.jpg',
  '/emails/katana-2.jpg',
  '/emails/wall-4b.jpg',
  '/emails/pulga-2.jpg',
  '/emails/wall-2b.jpg',
  '/emails/science-2.jpg',
  '/emails/wall-1b.jpg',
  '/emails/cleanhits-2.jpg',
  '/emails/wall-4.jpg',
  '/emails/wall-5b.jpg',
  '/emails/wall-3b.jpg',
  '/emails/wall-6b.jpg',
  `${CDN}qcyiVwkA6JIH5hrGCckOWomDzw.jpg?scale-down-to=512`,
  `${CDN}0RXgSeUATtAYujjAfas25KgmJuo.jpg?scale-down-to=512`,
  `${CDN}gW5hTauYyyYKzo8t0jsSVtILrU.jpg?scale-down-to=512`,
  `${CDN}sm9RgPrGbGud75Uw1FMu3I1ZPPI.jpg?scale-down-to=512`,
  `${CDN}62G13kTov641fWCJWxSxF8MRgxc.jpg?scale-down-to=512`,
]

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
