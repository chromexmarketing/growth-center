import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

const EMPTY = { name: '', description: '', status: 'live', image_urls: [] }

export default function AutomationManager({ client }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef(null)

  function load() {
    supabase.from('automations').select('*').eq('client_id', client.id)
      .order('created_at').then(({ data }) => setRows(data ?? []))
  }
  useEffect(load, [client.id])

  function pickFiles(newFiles) {
    if (!newFiles) return
    const updated = [...files, ...Array.from(newFiles)]
    setFiles(updated)
    const newPreviews = Array.from(newFiles).map(f => URL.createObjectURL(f))
    setPreviews([...previews, ...newPreviews])
  }

  function removePreview(idx) {
    setFiles(files.filter((_, i) => i !== idx))
    setPreviews(previews.filter((_, i) => i !== idx))
  }

  async function save() {
    setError('')
    if (!form.name) { setError('Name is required.'); return }
    setBusy(true)
    try {
      let imageUrls = []
      for (const file of files) {
        const path = `${client.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
        const { error: upErr } = await supabase.storage
          .from('campaign-images')
          .upload(path, file, { upsert: false })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('campaign-images').getPublicUrl(path)
        imageUrls.push(data.publicUrl)
      }
      const { error: insErr } = await supabase
        .from('automations')
        .insert({ ...form, client_id: client.id, image_urls: imageUrls })
      if (insErr) throw insErr
      setForm(EMPTY)
      setFiles([])
      setPreviews([])
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(id, status) {
    await supabase.from('automations').update({ status }).eq('id', id)
    load()
  }

  async function remove(id) {
    await supabase.from('automations').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <p className="eyebrow">{client.brand_name}</p>
      <h1 className="page-title">Automations</h1>
      <p className="page-sub">What {client.first_name} sees under their Automations tab.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <div>
            <label className="label">Automation name</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Welcome flow" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="live">Live</option>
              <option value="building">Building</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <div className="full">
            <label className="label">Description (optional)</label>
            <textarea className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="4 emails (triggers on signup)" />
          </div>
          <div className="full">
            <label className="label">Email designs (images)</label>
            <div
              className={`drop-zone ${drag ? 'drag' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pickFiles(e.dataTransfer.files) }}
            >
              {previews.length > 0
                ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 60px)', gap: 8, alignItems: 'center' }}>
                    {previews.map((prev, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={prev} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />
                        <button
                          className="btn-ghost small"
                          style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, padding: 0 }}
                          onClick={e => { e.stopPropagation(); removePreview(i) }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                : <>Drag & drop email exports here, or click to browse</>}
              <input
                ref={fileInput} type="file" accept="image/*" multiple hidden
                onChange={e => pickFiles(e.target.files)}
              />
            </div>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" style={{ marginTop: 18 }} onClick={save} disabled={busy}>{busy ? 'Saving' : 'Add automation'}</button>
      </div>

      <div className="card">
        {rows.length === 0 && <div className="empty">No automations yet.</div>}
        {rows.map(a => (
          <div className="item-row" key={a.id}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {a.image_urls?.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 52px)', gap: 6 }}>
                  {a.image_urls.map((url, i) => (
                    <img key={i} src={url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  ))}
                </div>
              )}
              <div>
                <h4>{a.name}</h4>
                {a.description && <p>{a.description}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }} value={a.status} onChange={e => setStatus(a.id, e.target.value)}>
                <option value="live">Live</option>
                <option value="building">Building</option>
                <option value="paused">Paused</option>
              </select>
              <button className="btn-ghost small" onClick={() => remove(a.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
