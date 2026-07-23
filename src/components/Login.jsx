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
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Left side: giant mascot */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0e0d0b 0%, #14120f 100%)'
      }}>
        <img src="/mascot.svg" alt="Chromex mascot" style={{ width: '280px', height: '280px' }} />
      </div>

      {/* Right side: form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px'
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <h1 className="display" style={{ fontSize: '32px', marginBottom: '8px' }}>
            Welcome to <span style={{ color: 'var(--orange)' }}>Chromex</span>
          </h1>
          <p style={{ color: 'var(--muted)', marginBottom: '32px', lineHeight: 1.6 }}>
            Your campaigns, automations and results in one place
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
