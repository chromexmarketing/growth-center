import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const EMPTY = { name: '', description: '', status: 'live' }

async function uploadImage(clientId, file) {
  const path = `${clientId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
  const { error } = await supabase.storage
    .from('campaign-images')
    .upload(path, file, { upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('campaign-images').getPublicUrl(path)
  return data.publicUrl
}

/* One labeled email slot: shows existing/pending image, lets you
   replace it, or remove the slot entirely. */
function EmailSlot({ index, slot, onFile, onRemove }) {
  const preview = slot.preview || slot.url
  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 12, padding: 12,
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>
        Email {index + 1}
      </span>
      <label style={{ cursor: 'pointer', width: '100%' }}>
        {preview
          ? <img src={preview} alt="" style={{
              width: '100%', height: 110, objectFit: 'cover',
              borderRadius: 8, display: 'block',
            }} />
          : <div style={{
              width: '100%', height: 110, borderRadius: 8,
              border: '1px dashed var(--line)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 12.5, color: 'var(--muted)', textAlign: 'center',
              padding: '0 8px',
            }}>Click to add image</div>}
        <input type="file" accept="image/*" hidden
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        {preview && (
          <label className="btn-ghost small" style={{ cursor: 'pointer' }}>
            Replace
            <input type="file" accept="image/*" hidden
              onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        )}
        <button className="btn-ghost small" onClick={onRemove}>Remove</button>
      </div>
    </div>
  )
}

function SlotGrid({ slots, setSlots }) {
  function setFile(i, file) {
    const next = [...slots]
    next[i] = { ...next[i], file, preview: URL.createObjectURL(file) }
    setSlots(next)
  }
  function removeSlot(i) {
    setSlots(slots.filter((_, idx) => idx !== i))
  }
  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10,
      }}>
        {slots.map((slot, i) => (
          <EmailSlot key={i} index={i} slot={slot}
            onFile={f => setFile(i, f)} onRemove={() => removeSlot(i)} />
        ))}
      </div>
      <button className="btn-ghost small" style={{ marginTop: 10 }}
        onClick={() => setSlots([...slots, { url: null, file: null, preview: null }])}>
        + Add email slot
      </button>
    </>
  )
}

/* Resolve slots -> final url array: upload new files, keep existing urls,
   drop empty slots. */
async function resolveSlots(clientId, slots) {
  const urls = []
  for (const s of slots) {
    if (s.file) urls.push(await uploadImage(clientId, s.file))
    else if (s.url) urls.push(s.url)
  }
  return urls
}

export default function AutomationManager({ client }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [emailCount, setEmailCount] = useState(4)
  const [slots, setSlots] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // inline editor state
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY)
  const [editSlots, setEditSlots] = useState([])
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')

  function load() {
    supabase.from('automations').select('*').eq('client_id', client.id)
      .order('created_at').then(({ data }) => setRows(data ?? []))
  }
  useEffect(load, [client.id])

  // keep the create grid in sync with the chosen email count
  useEffect(() => {
    setSlots(prev => {
      const n = Math.max(1, Math.min(15, emailCount || 1))
      const next = prev.slice(0, n)
      while (next.length < n) next.push({ url: null, file: null, preview: null })
      return next
    })
  }, [emailCount])

  async function save() {
    setError('')
    if (!form.name) { setError('Name is required.'); return }
    setBusy(true)
    try {
      const image_urls = await resolveSlots(client.id, slots)
      const { error: insErr } = await supabase
        .from('automations')
        .insert({ ...form, client_id: client.id, image_urls })
      if (insErr) throw insErr
      setForm(EMPTY)
      setEmailCount(4)
      setSlots(Array.from({ length: 4 }, () => ({ url: null, file: null, preview: null })))
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function startEdit(a) {
    setEditingId(a.id)
    setEditForm({ name: a.name, description: a.description ?? '', status: a.status })
    setEditSlots((a.image_urls ?? []).map(url => ({ url, file: null, preview: null })))
    setEditError('')
  }

  async function saveEdit() {
    setEditError('')
    if (!editForm.name) { setEditError('Name is required.'); return }
    setEditBusy(true)
    try {
      const image_urls = await resolveSlots(client.id, editSlots)
      const { error: upErr } = await supabase
        .from('automations')
        .update({ ...editForm, image_urls })
        .eq('id', editingId)
      if (upErr) throw upErr
      setEditingId(null)
      load()
    } catch (e) {
      setEditError(e.message)
    } finally {
      setEditBusy(false)
    }
  }

  async function setStatus(id, status) {
    await supabase.from('automations').update({ status }).eq('id', id)
    load()
  }

  async function remove(id) {
    if (!confirm('Delete this entire automation?')) return
    await supabase.from('automations').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <p className="eyebrow">{client.brand_name}</p>
      <h1 className="page-title">Automations</h1>
      <p className="page-sub">What {client.first_name} sees under their Automations tab.</p>

      {/* ---------- create ---------- */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <div>
            <label className="label">Automation name</label>
            <input className="input" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Welcome flow" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="live">Live</option>
              <option value="building">Building</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <div>
            <label className="label">Number of emails</label>
            <input className="input" type="number" min="1" max="15" value={emailCount}
              onChange={e => setEmailCount(parseInt(e.target.value) || 1)} />
          </div>
          <div className="full">
            <label className="label">Description (optional)</label>
            <textarea className="input" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="4 emails (triggers on signup)" />
          </div>
          <div className="full">
            <label className="label">Email designs</label>
            <SlotGrid slots={slots} setSlots={setSlots} />
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" style={{ marginTop: 18 }} onClick={save} disabled={busy}>
          {busy ? 'Saving' : 'Add automation'}
        </button>
      </div>

      {/* ---------- list + inline editor ---------- */}
      <div className="card">
        {rows.length === 0 && <div className="empty">No automations yet.</div>}
        {rows.map(a => (
          <div key={a.id} style={{ borderBottom: '1px solid var(--line)', padding: '14px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                {a.image_urls?.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 52px)', gap: 6 }}>
                    {a.image_urls.slice(0, 6).map((url, i) => (
                      <img key={i} src={url} alt="" style={{
                        width: 52, height: 52, objectFit: 'cover',
                        borderRadius: 8, border: '1px solid var(--line)',
                      }} />
                    ))}
                  </div>
                )}
                <div>
                  <h4>{a.name}</h4>
                  {a.description && <p>{a.description}</p>}
                  <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                    {(a.image_urls ?? []).length} emails
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <select className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
                  value={a.status} onChange={e => setStatus(a.id, e.target.value)}>
                  <option value="live">Live</option>
                  <option value="building">Building</option>
                  <option value="paused">Paused</option>
                </select>
                <button className="btn-ghost small"
                  onClick={() => editingId === a.id ? setEditingId(null) : startEdit(a)}>
                  {editingId === a.id ? 'Close' : 'Edit'}
                </button>
                <button className="btn-ghost small" onClick={() => remove(a.id)}>Delete</button>
              </div>
            </div>

            {editingId === a.id && (
              <div style={{
                marginTop: 14, padding: 16, borderRadius: 12,
                background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)',
              }}>
                <div className="form-grid">
                  <div>
                    <label className="label">Name</label>
                    <input className="input" value={editForm.name}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select className="input" value={editForm.status}
                      onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                      <option value="live">Live</option>
                      <option value="building">Building</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  <div className="full">
                    <label className="label">Description</label>
                    <textarea className="input" value={editForm.description}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                  </div>
                  <div className="full">
                    <label className="label">Emails (replace, remove, or add individual slots)</label>
                    <SlotGrid slots={editSlots} setSlots={setEditSlots} />
                  </div>
                </div>
                {editError && <p className="error-text">{editError}</p>}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button className="btn" onClick={saveEdit} disabled={editBusy}>
                    {editBusy ? 'Saving' : 'Save changes'}
                  </button>
                  <button className="btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
