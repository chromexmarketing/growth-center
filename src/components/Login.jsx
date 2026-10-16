import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Cropped campaign artwork for the login collage.
// The existing six-column layout and dark overlay remain unchanged.
const EMAILS = [
  '/emails/new/rawrev-1.jpg',
  '/emails/new/rawrev-2.jpg',
  '/emails/new/sorme-1.jpg',
  '/emails/new/sorme-2.jpg',
  '/emails/new/weiss-1.jpg',
  '/emails/new/weiss-2.jpg',
  '/emails/new/safari-1.jpg',
  '/emails/new/safari-2.jpg',
  '/emails/new/magicjohn-1.jpg',
  '/emails/new/magicjohn-2.jpg',
  '/emails/new/cinch-1.jpg',
  '/emails/new/cinch-2.jpg',
  '/emails/new/riderevolt-1.jpg',
  '/emails/new/riderevolt-2.jpg',
  '/emails/new/isotunes-1.jpg',
  '/emails/new/isotunes-2.jpg',
  '/emails/new/evolv-1.jpg',
  '/emails/new/evolv-2.jpg',
  '/emails/new/vidrate-1.jpg',
  '/emails/new/vidrate-2.jpg',
  '/emails/new/hotbox-1.jpg',
  '/emails/new/hotbox-2.jpg'
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
        <h1>Chromex Marketing</h1>
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
