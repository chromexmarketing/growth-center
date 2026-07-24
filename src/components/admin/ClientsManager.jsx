import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const EMPTY = {
  email: '', password: '', first_name: '', brand_name: '',
  platform: 'klaviyo', api_key: '',
}

function timeAgo(ts) {
  if (!ts) return 'never'
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export default function ClientsManager({ clients, onChanged }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [events, setEvents] = useState([])

  function loadEvents() {
    supabase
      .from('login_events')
      .select('client_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setEvents(data ?? []))
  }
  useEffect(loadEvents, [])

  const lastSeen = {}
  for (const e of events) {
    if (!lastSeen[e.client_id]) lastSeen[e.client_id] = e.created_at
  }

  async function createClient() {
    setError(''); setOk('')
    if (!form.email || !form.password) { setError('Email and password are required.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setBusy(true)
    try {
      const body = { ...form }
      if (!body.api_key) { body.platform = null; body.api_key = null }
      const { data, error: fnErr } = await supabase.functions.invoke('admin-create-user', { body })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      setOk(`${form.brand_name || form.email} created. Send them the URL and their login.`)
      setForm(EMPTY)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const nameOf = id => {
    const c = clients.find(c => c.id === id)
    return c?.brand_name || c?.first_name || 'Unknown'
  }

  return (
    <div>
      <p className="eyebrow">Team controls</p>
      <h1 className="page-title">Clients</h1>
      <p className="page-sub">Create client logins and see who has been active.</p>

      <div className="card">
        <h3 style={{ marginBottom: 18 }}>New client</h3>
        <div className="form-grid">
          <div>
            <label className="label">Login email</label>
            <input className="input" type="email" value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="jake@cinchgaming.com" />
          </div>
          <div>
            <label className="label">Password (share with them)</label>
            <input className="input" type="text" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="min 8 characters" />
          </div>
          <div>
            <label className="label">First name</label>
            <input className="input" value={form.first_name}
              onChange={e => setForm({ ...form, first_name: e.target.value })}
              placeholder="Jake" />
          </div>
          <div>
            <label className="label">Brand name</label>
            <input className="input" value={form.brand_name}
              onChange={e => setForm({ ...form, brand_name: e.target.value })}
              placeholder="Cinch Gaming" />
          </div>
          <div>
            <label className="label">Revenue platform</label>
            <select className="input" value={form.platform}
              onChange={e => setForm({ ...form, platform: e.target.value })}>
              <option value="klaviyo">Klaviyo</option>
              <option value="omnisend">Omnisend</option>
            </select>
          </div>
          <div>
            <label className="label">API key (optional, can add later)</label>
            <input className="input" value={form.api_key}
              onChange={e => setForm({ ...form, api_key: e.target.value })}
              placeholder="pk_… / their key" />
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        {ok && <p style={{ color: 'var(--orange)', marginTop: 10, fontSize: 14 }}>{ok}</p>}
        <button className="btn" style={{ marginTop: 18 }} onClick={createClient} disabled={busy}>
          {busy ? 'Creating' : 'Create client'}
        </button>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginBottom: 14 }}>Activity</h3>
        {clients.map(c => (
          <div className="item-row" key={c.id}>
            <div>
              <h4>{c.brand_name || c.first_name || 'Unnamed client'}</h4>
              <p>{c.first_name}</p>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>
              last active {timeAgo(lastSeen[c.id])}
            </span>
          </div>
        ))}
        {events.length > 0 && (
          <>
            <h4 style={{ margin: '22px 0 10px', fontSize: 14, color: 'var(--muted)' }}>
              Recent sign-ins
            </h4>
            {events.slice(0, 12).map((e, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5,
              }}>
                <span>{nameOf(e.client_id)}</span>
                <span className="muted">{new Date(e.created_at).toLocaleString()}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
