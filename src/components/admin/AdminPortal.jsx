import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Dashboard from '../Dashboard.jsx'
import Chat from '../Chat.jsx'
import CampaignManager from './CampaignManager.jsx'
import AutomationManager from './AutomationManager.jsx'
import OptimizationManager from './OptimizationManager.jsx'

const TABS = [
  { id: 'campaigns', label: 'Campaigns', ico: '▦' },
  { id: 'automations', label: 'Automations', ico: '⚡' },
  { id: 'optimizations', label: 'Optimizations', ico: '▲' },
  { id: 'revenue', label: 'Revenue view', ico: '◧' },
  { id: 'chat', label: 'Chat', ico: '✉' },
]

export default function AdminPortal({ profile }) {
  const [tab, setTab] = useState('campaigns')
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .order('brand_name')
      .then(({ data }) => {
        setClients(data ?? [])
        if (data?.length && !clientId) setClientId(data[0].id)
      })
  }, [])

  const client = clients.find(c => c.id === clientId)

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.webp" alt="Chromex" />
          <span>Chromex <em>Admin</em></span>
        </div>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="ico">{t.ico}</span>{t.label}
          </button>
        ))}
        <div className="spacer" />
        <button className="nav-btn" onClick={() => supabase.auth.signOut()}>
          <span className="ico">⏻</span>Sign out
        </button>
      </aside>

      <main className="main">
        <div className="admin-client-picker">
          {clients.map(c => (
            <button
              key={c.id}
              className={`client-chip ${c.id === clientId ? 'active' : ''}`}
              onClick={() => setClientId(c.id)}
            >
              {c.brand_name || c.first_name || 'Unnamed client'}
            </button>
          ))}
          {clients.length === 0 && (
            <p className="muted">No clients yet — create their logins in Supabase, then run the seed SQL.</p>
          )}
        </div>

        {client && tab === 'campaigns' && <CampaignManager client={client} />}
        {client && tab === 'automations' && <AutomationManager client={client} />}
        {client && tab === 'optimizations' && <OptimizationManager client={client} />}
        {client && tab === 'revenue' && <Dashboard profile={client} clientId={client.id} />}
        {client && tab === 'chat' && (
          <Chat profile={profile} clientId={client.id} senderRole="admin" title={`Chat — ${client.brand_name}`} />
        )}
      </main>
    </div>
  )
}
