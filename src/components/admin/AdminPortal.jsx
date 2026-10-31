import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Dashboard from '../Dashboard.jsx'
import Chat from '../Chat.jsx'
import MyProfile from '../MyProfile.jsx'
import InstallApp from '../InstallApp.jsx'
import CampaignManager from './CampaignManager.jsx'
import AutomationManager from './AutomationManager.jsx'
import OptimizationManager from './OptimizationManager.jsx'
import ClientsManager from './ClientsManager.jsx'

const TABS = [
  { id: 'campaigns', label: 'Campaigns', ico: '▦' },
  { id: 'automations', label: 'Automations', ico: '⚡' },
  { id: 'optimizations', label: 'Optimizations', ico: '▲' },
  { id: 'revenue', label: 'Revenue view', ico: '◧' },
  { id: 'chat', label: 'Chat', ico: '✉' },
  { id: 'clients', label: 'Clients', ico: '◎' },
]

export default function AdminPortal({ profile }) {
  const [tab, setTab] = useState('campaigns')
  const isOwner = profile.role === 'admin'
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState(null)

  async function loadClients() {
    let data = []
    if (isOwner) {
      const result = await supabase.from('profiles').select('*').eq('role','client').order('brand_name')
      data = result.data || []
    } else {
      const assignments = await supabase.from('staff_assignments').select('client_id').eq('staff_id',profile.id)
      const ids = (assignments.data || []).map(x=>x.client_id)
      if (ids.length) {
        const result = await supabase.from('profiles').select('*').in('id',ids)
        data = result.data || []
      }
    }
    setClients(data)
    setClientId(previous=>data.some(c=>c.id===previous)?previous:(data[0]?.id||null))
  }
  useEffect(loadClients, [])

  const client = clients.find(c => c.id === clientId)

  return (
    <div className="shell chromex-mobile-v2 staff-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.webp" alt="Chromex" />
          <span>Chromex <em>Admin</em></span>
        </div>
        {TABS.filter(t=>isOwner||t.id!=='clients').map(t => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="ico">{t.ico}</span>{t.label}
          </button>
        ))}
        <div className="spacer" />
        <InstallApp />
        <button className={`nav-btn ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}><span className="ico">◉</span> My Profile</button>
        <button className="nav-btn" onClick={() => supabase.auth.signOut()}>
          <span className="ico">⏻</span>Sign out
        </button>
      </aside>

      <main className={`main ${tab === "chat" ? "main-chat" : ""}`}>
        {tab !== 'clients' && <div className="admin-client-picker">
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
            <p className="muted">No clients yet: create one in the Clients tab.</p>
          )}
        </div>}

        {client && tab === 'campaigns' && <CampaignManager client={client} />}
        {client && tab === 'automations' && <AutomationManager client={client} />}
        {client && tab === 'optimizations' && <OptimizationManager client={client} />}
        {client && tab === 'revenue' && <Dashboard profile={client} clientId={client.id} />}
        {client && tab === 'chat' && (
          <Chat profile={profile} clientId={client.id} senderRole="admin" title={`Chromex × ${client.brand_name || "Your Brand"}`} />
        )}
        {tab === "profile" && <MyProfile profile={profile} />}
        {isOwner && tab === 'clients' && <ClientsManager clients={clients} onChanged={loadClients} />}
      </main>
      <div className="mobile-v2-account"><button type="button" onClick={()=>setTab('profile')} aria-label="My profile">◉</button><button type="button" onClick={()=>supabase.auth.signOut()} aria-label="Sign out">⏻</button></div>
      <nav className="mobile-v2-dock" aria-label="Team navigation">{TABS.filter(t=>isOwner||t.id!=="clients").map(t=><button key={t.id} type="button" aria-label={t.label} aria-current={tab===t.id?"page":undefined} className={tab===t.id?"selected":""} onClick={()=>setTab(t.id)}><span className="mobile-v2-icon">{t.ico}</span><span className="mobile-v2-tab-label">{t.id==="revenue"?"Revenue":t.label}</span></button>)}</nav>
    </div>
  )
}
