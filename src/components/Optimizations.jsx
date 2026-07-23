import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

      <div className="card">
        {rows === null && <p className="muted">Loading…</p>}
        {rows?.length === 0 && <div className="empty">No optimization updates yet — check back soon.</div>}
        {rows?.map(n => (
          <div className="item-row" key={n.id}>
            <div>
              <h4>{n.title}</h4>
              <p>{n.body}</p>
              <div className="when">{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
