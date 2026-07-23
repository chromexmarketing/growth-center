import { useEffect, useMemo, useState } from 'react'
import { fetchRevenue } from '../lib/supabase'

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
