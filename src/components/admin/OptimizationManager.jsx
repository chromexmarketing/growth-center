import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const EMPTY = { title: '', testing: '', method: '', kpi: '', winner: '', notes: '' }
const PREFIX = 'CHROMEX_TEST_V1:'
function unpack(row) {
  if (row.body?.startsWith(PREFIX)) {
    try { return { ...EMPTY, ...JSON.parse(row.body.slice(PREFIX.length)), title: row.title } } catch {}
  }
  return { ...EMPTY, title: row.title || '', notes: row.body || '' }
}

export default function OptimizationManager({ client }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function load() {
    supabase.from('optimization_notes').select('*').eq('client_id', client.id)
      .order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []))
  }
  useEffect(() => { load(); setForm(EMPTY); setEditingId(null) }, [client.id])

  async function save() {
    setError('')
    if (!form.title.trim() || !form.testing.trim()) {
      setError('Test title and what is being tested are required.')
      return
    }
    setBusy(true)
    const payload = { title: form.title.trim(), body: PREFIX + JSON.stringify({ testing: form.testing, method: form.method, kpi: form.kpi, winner: form.winner, notes: form.notes }) }
    const { error: err } = editingId
      ? await supabase.from('optimization_notes').update(payload).eq('id', editingId).eq('client_id', client.id)
      : await supabase.from('optimization_notes').insert({ ...payload, client_id: client.id })
    setBusy(false)
    if (err) { setError(err.message); return }
    setForm(EMPTY); setEditingId(null); load()
  }

  async function remove(id) {
    if (!window.confirm('Delete this optimization update?')) return
    const { error: err } = await supabase.from('optimization_notes').delete().eq('id', id).eq('client_id', client.id)
    if (err) { setError(err.message); return }
    load()
  }

  const field = (key, label, placeholder, multiline = false) => (
    <div>
      <label className="label">{label}</label>
      {multiline
        ? <textarea className="input" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
        : <input className="input" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />}
    </div>
  )

  return (
    <div>
      <p className="eyebrow">{client.brand_name}</p>
      <h1 className="page-title">Optimizations</h1>
      <p className="page-sub">Track what we're testing, how we're testing it, KPIs and winning variations. Clients see the same details.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          {field('title', 'Test title', 'Welcome flow subject line A/B')}
          {field('testing', "What's being tested?", 'Urgency versus curiosity')}
          {field('method', "How is it being tested?", '50/50 split across new subscribers', true)}
          {field('kpi', 'KPI / success metric', 'Placed order rate, revenue per recipient')}
          {field('winner', 'Winner / result', 'Pending, or Variant B +12% RPR')}
          {field('notes', 'Additional notes', 'Next steps and findings', true)}
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" style={{ marginTop: 18 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add optimization'}</button>
        {editingId && <button className="btn-ghost small" style={{ marginLeft: 10 }} onClick={() => { setEditingId(null); setForm(EMPTY) }}>Cancel</button>}
      </div>

      <div className="card">
        {rows.length === 0 && <div className="empty">No optimization tests yet.</div>}
        {rows.map(n => {
          const d = unpack(n)
          return <div className="item-row" key={n.id}>
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <h4>{n.title}</h4>
              {d.testing && <p><strong>Testing:</strong> {d.testing}</p>}
              {d.method && <p><strong>Method:</strong> {d.method}</p>}
              {d.kpi && <p><strong>KPI:</strong> {d.kpi}</p>}
              {d.winner && <p><strong>Winner:</strong> {d.winner}</p>}
              {d.notes && <p style={{ whiteSpace: 'pre-wrap' }}>{d.notes}</p>}
              <div className="when">{new Date(n.created_at).toLocaleDateString()}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost small" onClick={() => { setForm(d); setEditingId(n.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
              <button className="btn-ghost small" onClick={() => remove(n.id)}>Delete</button>
            </div>
          </div>
        })}
      </div>
    </div>
  )
}
