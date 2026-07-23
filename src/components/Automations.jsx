import { useState } from 'react'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Automations({ clientId }) {
  const [rows, setRows] = useState(null)
  const [selectedAuto, setSelectedAuto] = useState(null)

  useEffect(() => {
    supabase
      .from('automations')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at')
      .then(({ data }) => setRows(data ?? []))
  }, [clientId])

  return (
    <div>
      <p className="eyebrow">Always-on</p>
      <h1 className="page-title">Automations</h1>
      <p className="page-sub">The flows working for your brand around the clock.</p>

      <div className="card">
        {rows === null && <p className="muted">Loading…</p>}
        {rows?.length === 0 && <div className="empty">No automations listed yet: the team will add them here.</div>}
        {rows?.map(a => (
          <div className="item-row" key={a.id} onClick={() => setSelectedAuto(a)} style={{ cursor: 'pointer' }}>
            <div>
              <h4>{a.name}</h4>
              {a.description && <p>{a.description}</p>}
            </div>
            <span className={`badge ${a.status}`}>{a.status}</span>
          </div>
        ))}
      </div>

      {selectedAuto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 999
        }} onClick={() => setSelectedAuto(null)}>
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 32, maxWidth: 900,
            maxHeight: '90vh', overflowY: 'auto'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20 }}>
              <div>
                <p style={{ color: 'var(--orange)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                  {selectedAuto.status}
                </p>
                <h2 style={{ fontSize: 28, marginBottom: 8 }}>{selectedAuto.name}</h2>
                {selectedAuto.description && <p style={{ color: 'var(--muted)' }}>{selectedAuto.description}</p>}
              </div>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 28, cursor: 'pointer' }}
                onClick={() => setSelectedAuto(null)}
              >
                ×
              </button>
            </div>

            {selectedAuto.image_urls?.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {selectedAuto.image_urls.map((url, i) => (
                  <div key={i} style={{ borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--line)' }}>
                    <img src={url} alt={`Email ${i + 1}`} style={{ width: '100%', display: 'block' }} />
                    <p style={{ padding: 12, background: 'var(--bg-soft)', fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                      Email {i + 1}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>
                No email designs uploaded yet
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
