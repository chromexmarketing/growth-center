import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="login-split">
      {/* Mascot panel */}
      <div className="login-mascot-panel">
        <img src="/mascot.svg" alt="Chromex mascot" />
      </div>

      {/* Form panel */}
      <div className="login-form-panel">
        <div className="login-form-inner">
          <h1 className="display" style={{ fontSize: '32px', marginBottom: '8px' }}>
            Welcome to <span style={{ color: 'var(--orange)' }}>Chromex</span>
          </h1>
          <p style={{ color: 'var(--muted)', marginBottom: '32px', lineHeight: 1.6 }}>
            Log in to your marketing hub
          </p>

          <label className="label">Email</label>
          <input
            className="input" type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="you@yourbrand.com" autoComplete="email"
          />
          <label className="label" style={{ marginTop: '20px' }}>Password</label>
          <input
            className="input" type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="••••••••" autoComplete="current-password"
          />
          {error && <p className="error-text">{error}</p>}
          <button className="btn" style={{ width: '100%', marginTop: '24px' }} onClick={handleSubmit} disabled={busy}>
            {busy ? 'Signing in' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
