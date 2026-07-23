import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Mascot from './Mascot.jsx'
import Dashboard from './Dashboard.jsx'
import CampaignCalendar from './CampaignCalendar.jsx'
import Automations from './Automations.jsx'
import Optimizations from './Optimizations.jsx'
import Chat from './Chat.jsx'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', ico: '◧' },
  { id: 'calendar', label: 'Campaign calendar', ico: '▦' },
  { id: 'automations', label: 'Automations', ico: '⚡' },
  { id: 'optimizations', label: 'Optimizations', ico: '▲' },
  { id: 'chat', label: 'Chat', ico: '✉' },
]

export default function ClientPortal({ profile }) {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.webp" alt="Chromex" />
          <span>Chromex<em>.</em></span>
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
        {tab === 'dashboard' && <Dashboard profile={profile} />}
        {tab === 'calendar' && <CampaignCalendar clientId={profile.id} />}
        {tab === 'automations' && <Automations clientId={profile.id} />}
        {tab === 'optimizations' && <Optimizations clientId={profile.id} />}
        {tab === 'chat' && <Chat profile={profile} clientId={profile.id} senderRole="client" />}
      </main>

      <Mascot firstName={profile.first_name} />
    </div>
  )
}
