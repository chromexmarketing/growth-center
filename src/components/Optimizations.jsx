import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const PREFIX = 'CHROMEX_TEST_V1:'
function details(row) {
  if (row.body?.startsWith(PREFIX)) {
    try { return JSON.parse(row.body.slice(PREFIX.length)) } catch {}
  }
  return { notes: row.body }
}

export default function Optimizations({ clientId }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase
      .from('optimization_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows(data ?? []))
  }, [clientId])

  return (
    <div>
      <p className="eyebrow">Testing log</p>
      <h1 className="page-title">Optimizations</h1>
      <p className="page-sub">What we're testing, what we learned, and what shipped.</p>

      <div className="card mobile-v2-optimization-feed">
        {rows === null && <p className="muted">Loading…</p>}
        {rows?.length === 0 && <div className="empty">No optimization updates yet — check back soon.</div>}
        {rows?.map(n => {
          const d = details(n)
          return <div className="item-row mobile-v2-optimization-entry" key={n.id}>
            <div>
              <h4>{n.title}</h4>
              {d.testing && <p><strong>What's being tested:</strong> {d.testing}</p>}
              {d.method && <p><strong>How it's being tested:</strong> {d.method}</p>}
              {d.kpi && <p><strong>KPI:</strong> {d.kpi}</p>}
              {d.winner && <p><strong>Winner / result:</strong> {d.winner}</p>}
              {d.notes && <p style={{ whiteSpace: 'pre-wrap' }}>{d.notes}</p>}
              <div className="when">{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
          </div>
        })}
      </div>
    </div>
  )
}
