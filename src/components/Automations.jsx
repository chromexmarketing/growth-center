import { useState } from 'react'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AutomationModal from './AutomationModal.jsx'

const STAGES = [{label:'Discover',terms:['welcome','signup','subscriber','lead']},{label:'Consider',terms:['browse','viewed','site abandon','wishlist']},{label:'Convert',terms:['checkout','cart','abandon','payment']},{label:'Retain',terms:['post purchase','review','winback','loyalty','birthday']}]
function stageFor(name){const text=(name||'').toLowerCase();return STAGES.find(stage=>stage.terms.some(term=>text.includes(term)))?.label||'Consider'}
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

      <div className="mobile-v2-journey">{STAGES.map(stage=><section key={stage.label} className="mobile-v2-stage"><h2>{stage.label}</h2>{(rows||[]).filter(a=>stageFor(a.name)===stage.label).map(a=><button key={a.id} className="mobile-v2-flow" onClick={()=>setSelectedAuto(a)}><span>{a.name}</span><span className={`badge ${a.status}`}>{a.status}</span></button>)}{rows!==null&&!rows.some(a=>stageFor(a.name)===stage.label)&&<p className="muted">No flows yet</p>}</section>)}</div>
      <div className="card mobile-v2-original-list">
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
