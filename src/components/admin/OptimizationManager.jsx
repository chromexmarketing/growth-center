import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function OptimizationManager({ client }) {
  const [rows, setRows] = useState([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function load() {
    supabase.from('optimization_notes').select('*').eq('client_id', client.id)
      .order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  }
  useEffect(load, [client.id])

  async function save() {
    setError('')
    if (!title) { setError('Title is required.'); return }
    setBusy(true)
    const { error } = await supabase.from('optimization_notes')
      .insert({ client_id: client.id, title, body })
    setBusy(false)
    if (error) { setError(error.message); return }
    setTitle(''); setBody(''); load()
  }

  async function remove(id) {
    await supabase.from('optimization_notes').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <p className="eyebrow">{client.brand_name}</p>
      <h1 className="page-title">Optimization updates</h1>
      <p className="page-sub">Tests you're running and results — posts straight to {client.first_name}'s portal.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <label className="label">Title</label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Subject line A/B — urgency vs curiosity" />
        <label className="label">Update</label>
        <textarea className="input" value={body} onChange={e => setBody(e.target.value)} placeholder={"Ran a 50/50 split on the July 12 send.\nVariant B lifted open rate 42% → 51%.\nRolling the winner into the welcome flow."} style={{ minHeight: 120 }} />
        {error && <p className="error-text">{error}</p>}
        <button className="btn" style={{ marginTop: 18 }} onClick={save} disabled={busy}>{busy ? 'Posting…' : 'Post update'}</button>
      </div>

      <div className="card">
        {rows.length === 0 && <div className="empty">No updates yet.</div>}
        {rows.map(n => (
          <div className="item-row" key={n.id}>
            <div>
              <h4>{n.title}</h4>
              <p>{n.body}</p>
              <div className="when">{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
            <button className="btn-ghost small" onClick={() => remove(n.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
