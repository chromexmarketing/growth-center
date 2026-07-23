import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function ymd(d) { return d.toISOString().slice(0, 10) }

export default function CampaignCalendar({ clientId }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-indexed
  const [campaigns, setCampaigns] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const first = new Date(Date.UTC(year, month, 1))
    const last = new Date(Date.UTC(year, month + 1, 0))
    supabase
      .from('campaigns')
      .select('*')
      .eq('client_id', clientId)
      .gte('send_date', ymd(first))
      .lte('send_date', ymd(last))
      .order('send_date')
      .then(({ data }) => setCampaigns(data ?? []))
  }, [clientId, year, month])

  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    // Monday-first offset
    const offset = (first.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysPrev = new Date(year, month, 0).getDate()
    const out = []
    for (let i = 0; i < offset; i++) {
      out.push({ day: daysPrev - offset + 1 + i, other: true })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      out.push({
        day: d,
        dateStr,
        today: dateStr === ymd(new Date()),
        items: campaigns.filter(c => c.send_date === dateStr),
      })
    }
    while (out.length % 7 !== 0) {
      out.push({ day: out.length - offset - daysInMonth + 1, other: true })
    }
    return out
  }, [year, month, campaigns])

  function shift(delta) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  return (
    <div>
      <p className="eyebrow">Schedule</p>
      <h1 className="page-title">Campaign calendar</h1>
      <p className="page-sub">Click a campaign to see the email design and details.</p>

      <div className="card">
        <div className="cal-head">
          <h3 className="display">{MONTHS[month]} {year}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost small" onClick={() => shift(-1)}>← Prev</button>
            <button className="btn-ghost small" onClick={() => shift(1)}>Next →</button>
          </div>
        </div>
        <div className="cal-grid">
          {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((c, i) => (
            <div key={i} className={`cal-cell ${c.other ? 'other' : ''} ${c.today ? 'today' : ''}`}>
              <span className="day-num">{c.day}</span>
              {c.items?.map(cmp => (
                <button key={cmp.id} className="cal-pill" onClick={() => setSelected(cmp)} title={cmp.name}>
                  {cmp.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            <p className="eyebrow">{new Date(selected.send_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            <h2 className="display" style={{ fontSize: 22 }}>{selected.name}</h2>
            <p style={{ marginTop: 6 }}><span className={`badge ${selected.status}`}>{selected.status}</span></p>
            {selected.description && <p className="muted" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{selected.description}</p>}
            {selected.image_url
              ? <img className="campaign-img" src={selected.image_url} alt={`${selected.name} email design`} />
              : <div className="empty" style={{ marginTop: 16 }}>Email design coming soon.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
