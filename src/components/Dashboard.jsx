import { useEffect, useMemo, useState } from 'react'
import { fetchRevenue, supabase } from '../lib/supabase'

const RANGES = [
  { id: '1d', label: 'Today', days: 1 },
  { id: '7d', label: '7 days', days: 7 },
  { id: '15d', label: '15 days', days: 15 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '1y', label: '1 year', days: 365 },
  { id: 'custom', label: 'Custom' },
]

function iso(d) { return d.toISOString().slice(0, 10) }
function money(n) {
  if (n == null) return ':'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Dashboard({ profile, clientId }) {
  const [range, setRange] = useState('30d')
  const [customStart, setCustomStart] = useState(iso(new Date(Date.now() - 30 * 864e5)))
  const [customEnd, setCustomEnd] = useState(iso(new Date()))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState({ loading: true, campaigns: [], flows: [], optimizations: [] })
  useEffect(() => {
    if (!clientId) return
    let active = true
    const load = async () => {
      const [campaigns, flows, optimizations] = await Promise.all([
        supabase.from('campaigns').select('id,name,status,send_date').eq('client_id',clientId),
        supabase.from('automations').select('id,name,status').eq('client_id',clientId),
        supabase.from('optimization_notes').select('id,title,created_at').eq('client_id',clientId).order('created_at',{ascending:false})
      ])
      if (active) setActivity({ loading:false, campaigns:campaigns.data??[], flows:flows.data??[], optimizations:optimizations.data??[] })
    }
    load()
    const channel = supabase.channel('dashboard-activity-'+clientId)
      .on('postgres_changes',{event:'*',schema:'public',table:'campaigns',filter:'client_id=eq.'+clientId},load)
      .on('postgres_changes',{event:'*',schema:'public',table:'automations',filter:'client_id=eq.'+clientId},load)
      .on('postgres_changes',{event:'*',schema:'public',table:'optimization_notes',filter:'client_id=eq.'+clientId},load)
      .subscribe()
    return () => { active=false; supabase.removeChannel(channel) }
  }, [clientId])
  const now = new Date()
  const monthPrefix = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')
  const monthlyCampaigns = activity.campaigns.filter(c=>c.send_date?.startsWith(monthPrefix))
  const monthlyOptimizations = activity.optimizations.filter(o=>o.created_at?.startsWith(monthPrefix))
  const activeFlows = activity.flows.filter(f=>['active','live','enabled'].includes((f.status||'').toLowerCase()))
  const sentCampaigns = monthlyCampaigns.filter(c=>(c.status||'').toLowerCase()==='sent')
  const scheduledCampaigns = monthlyCampaigns.filter(c=>['scheduled','planned'].includes((c.status||'').toLowerCase()))


  const { start, end } = useMemo(() => {
    if (range === 'custom') return { start: customStart, end: customEnd }
    const r = RANGES.find(r => r.id === range)
    const end = new Date()
    // Mirror Klaviyo's window convention: "30 days" = (today - 30) through today
    const start = new Date(Date.now() - r.days * 864e5)
    return { start: iso(start), end: iso(end) }
  }, [range, customStart, customEnd])

  useEffect(() => {
    let alive = true
    setBusy(true)
    setError('')
    fetchRevenue(start, end, clientId)
      .then(d => alive && setData(d))
      .catch(e => alive && setError(e.message))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [start, end, clientId])

  const emailShare = data && data.emailRevenue != null && data.totalRevenue > 0
    ? Math.round((data.emailRevenue / data.totalRevenue) * 100)
    : null

  return (
    <div>
      <p className="eyebrow">Overview</p>
      <h1 className="page-title">
        Welcome back, {profile.first_name || 'there'} <span aria-hidden>📧</span>
      </h1>
      <p className="page-sub">
        {profile.brand_name} · live numbers from {profile.platform === 'klaviyo' ? 'Klaviyo' : 'Omnisend'}
      </p>

      <section className="mobile-v2-activity" aria-label="Latest activity">
        <div className="mobile-v2-section-title"><h2>Latest activity</h2><span>This month</span></div>
        <div className="card mobile-v2-activity-card">
          {activity.loading ? <p className="muted">Loading activity…</p> : monthlyOptimizations.length ? monthlyOptimizations.slice(0,2).map(o=><div className="mobile-v2-activity-item" key={o.id}><span className="mobile-v2-activity-glyph">✦</span><div><strong>{o.title}</strong><small>{new Date(o.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})} · Optimization</small></div></div>) : <p className="muted">Your latest team improvements will appear here.</p>}
        </div>
      </section>
      <div className="range-row">
        {RANGES.map(r => (
          <button
            key={r.id}
            className={`range-btn ${range === r.id ? 'active' : ''}`}
            onClick={() => setRange(r.id)}
          >{r.label}</button>
        ))}
        {range === 'custom' && (
          <>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span className="muted">to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="stat-row">
        <div className="card stat-card highlight">
          <div className="stat-label">Total store revenue</div>
          <div className="stat-value">{busy ? '…' : money(data?.totalRevenue)}</div>
          <div className="stat-meta">{data?.totalOrders ?? ':'} orders</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Email &amp; SMS attributed revenue</div>
          <div className="stat-value">{busy ? '…' : money(data?.emailRevenue)}</div>
          <div className="stat-meta">
            {data?.emailRevenue == null
              ? 'Attribution not available for this account'
              : `${data?.emailOrders ?? 0} attributed orders`}
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Email &amp; SMS share of revenue</div>
          <div className="stat-value">{busy ? '…' : (emailShare == null ? ':' : emailShare + '%')}</div>
          <div className="stat-meta">of total store revenue</div>
        </div>
      </div>

      <section className="mobile-v2-metrics" aria-label="Marketing activity this month">
        <div className="mobile-v2-section-title"><h2>Marketing activity</h2><span>This month</span></div>
        <div className="mobile-v2-metrics-grid">
          {[[sentCampaigns.length,'Campaigns sent'],[scheduledCampaigns.length,'Scheduled'],[activeFlows.length,'Active flows'],[monthlyOptimizations.length,'Optimizations']].map(([count,label])=><div className="card mobile-v2-metric" key={label}><strong>{activity.loading?'…':count}</strong><span>{label}</span></div>)}
        </div>
      </section>
      <div className="card">
        <div className="chart-legend">
          <span><span className="dot" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} />Total revenue</span>
          {data?.emailRevenue != null && (
            <span><span className="dot" style={{ background: 'var(--orange)' }} />Email &amp; SMS revenue</span>
          )}
        </div>
        <RevenueChart series={data?.series ?? []} busy={busy} />
      </div>
    </div>
  )
}

// Hand-rolled SVG bar chart: total as base bars, email overlaid in orange.
function RevenueChart({ series, busy }) {
  if (busy) return <div className="empty" style={{ border: 'none' }}>Loading chart…</div>
  if (!series.length) return <div className="empty" style={{ border: 'none' }}>No revenue data for this period yet.</div>

  const W = Math.max(640, series.length * 34)
  const H = 260
  const pad = { top: 14, bottom: 34, left: 8, right: 8 }
  const max = Math.max(...series.map(s => s.total || 0), 1)
  const innerH = H - pad.top - pad.bottom
  const bw = (W - pad.left - pad.right) / series.length
  const labelEvery = Math.ceil(series.length / 10)

  return (
    <div className="chart-wrap">
      <svg width={W} height={H} role="img" aria-label="Revenue chart">
        {series.map((s, i) => {
          const x = pad.left + i * bw
          const th = (s.total / max) * innerH
          const eh = s.email != null ? (s.email / max) * innerH : 0
          return (
            <g key={s.date}>
              <title>{s.date}: total ${Number(s.total).toLocaleString()}{s.email != null ? `, email $${Number(s.email).toLocaleString()}` : ''}</title>
              <rect
                x={x + 3} y={pad.top + innerH - th}
                width={bw - 6} height={Math.max(th, 1)}
                rx="4" fill="var(--surface-2)" stroke="var(--line)"
              />
              {s.email != null && eh > 0 && (
                <rect
                  x={x + 3} y={pad.top + innerH - eh}
                  width={bw - 6} height={Math.max(eh, 1)}
                  rx="4" fill="var(--orange)"
                />
              )}
              {i % labelEvery === 0 && (
                <text
                  x={x + bw / 2} y={H - 12}
                  textAnchor="middle" fontSize="10.5"
                  fill="var(--muted)" fontFamily="Inter"
                >{s.date.slice(5)}</text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
