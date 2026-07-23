import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

const EMPTY = { name: '', send_date: '', description: '', status: 'scheduled' }

export default function CampaignManager({ client }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef(null)

  function load() {
    supabase
      .from('campaigns')
      .select('*')
      .eq('client_id', client.id)
      .order('send_date', { ascending: false })
      .then(({ data }) => setRows(data ?? []))
  }
  useEffect(load, [client.id])

  function pickFile(f) {
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function save() {
    setError('')
    if (!form.name || !form.send_date) { setError('Name and send date are required.'); return }
    setBusy(true)
    try {
      let image_url = ''
      if (file) {
        const path = `${client.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
        const { error: upErr } = await supabase.storage
          .from('campaign-images')
          .upload(path, file, { upsert: false })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('campaign-images').getPublicUrl(path)
        image_url = data.publicUrl
      }
      const { error: insErr } = await supabase
        .from('campaigns')
        .insert({ ...form, client_id: client.id, image_url })
      if (insErr) throw insErr
      setForm(EMPTY); setFile(null); setPreview('')
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    await supabase.from('campaigns').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <p className="eyebrow">{client.brand_name}</p>
      <h1 className="page-title">Campaigns</h1>
      <p className="page-sub">Add a campaign and it lands on {client.first_name}'s calendar instantly.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <div>
            <label className="label">Campaign name</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Back to School — 15% off" />
          </div>
          <div>
            <label className="label">Send date</label>
            <input className="input" type="date" value={form.send_date} onChange={e => setForm({ ...form, send_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="scheduled">Scheduled</option>
              <option value="sent">Sent</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <div className="full">
            <label className="label">Description (optional)</label>
            <textarea className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Angle, offer, segments…" />
          </div>
          <div className="full">
            <label className="label">Email design (image)</label>
            <div
              className={`drop-zone ${drag ? 'drag' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]) }}
            >
              {preview
                ? <><div>{file?.name}</div><img className="preview" src={preview} alt="Email design preview" /></>
                : <>Drag & drop the email export here, or click to browse</>}
              <input
                ref={fileInput} type="file" accept="image/*" hidden
                onChange={e => pickFile(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" style={{ marginTop: 18 }} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Add campaign'}
        </button>
      </div>

      <div className="card">
        {rows.length === 0 && <div className="empty">No campaigns yet for {client.brand_name}.</div>}
        {rows.map(c => (
          <div className="item-row" key={c.id}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {c.image_url && <img src={c.image_url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
              <div>
                <h4>{c.name}</h4>
                <p>{new Date(c.send_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={`badge ${c.status}`}>{c.status}</span>
              <button className="btn-ghost small" onClick={() => remove(c.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
