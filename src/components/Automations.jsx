import { useState } from 'react'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AutomationModal from './AutomationModal.jsx'

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

      <AutomationModal auto={selectedAuto} onClose={() => setSelectedAuto(null)} />
    </div>
  )
}
