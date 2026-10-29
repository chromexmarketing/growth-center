import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Mascot from './Mascot.jsx'
import Roadmap, { useRoadmap, useRoadmapSettings } from './Roadmap.jsx'
import Dashboard from './Dashboard.jsx'
import CampaignCalendar from './CampaignCalendar.jsx'
import Automations from './Automations.jsx'
import Optimizations from './Optimizations.jsx'
import Chat from './Chat.jsx'
import GrowthTeaser from './GrowthTeaser.jsx'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', ico: '◧' },
  { id: 'roadmap', label: 'Roadmap', ico: '◇' },
  { id: 'calendar', label: 'Campaign calendar', ico: '▦' },
  { id: 'automations', label: 'Automations', ico: '⚡' },
  { id: 'optimizations', label: 'Optimizations', ico: '▲' },
  { id: 'chat', label: 'Chat', ico: '✉' },
]

export default function ClientPortal({ profile }) {
  const [tab, setTab] = useState('dashboard')
  const {items: roadmapItems} = useRoadmap(profile.id)
  const {settings: roadmapSettings} = useRoadmapSettings(profile.id)
  const roadmapVisible = !!roadmapSettings?.enabled
  useEffect(() => { if (!roadmapVisible && tab === 'roadmap') setTab('dashboard') }, [roadmapVisible, tab])

  // record a sign-in event for the admin activity feed
  useEffect(() => {
    supabase.from('login_events').insert({ client_id: profile.id }).then(() => {})
  }, [profile.id])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.webp" alt="Chromex" />
          <span>Chromex<em>.</em></span>
        </div>

        <p className="nav-section">Client portal</p>
        {TABS.filter(t => t.id !== 'roadmap' || roadmapVisible).map(t => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="ico">{t.ico}</span>{t.label}
          </button>
        ))}

        <p className="nav-section" style={{ marginTop: 18 }}>Chromex Growth</p>
        <button
          className={`nav-btn growth-nav ${tab === 'growth' ? 'active' : ''}`}
          onClick={() => setTab('growth')}
        >
          <span className="ico">✦</span>Growth
          <span className="soon-pill">Soon</span>
        </button>

        <div className="spacer" />
        <button className="nav-btn" onClick={() => supabase.auth.signOut()}>
          <span className="ico">⏻</span>Sign out
        </button>
      </aside>

      <main className={`main ${tab === 'growth' ? 'main-full' : ''}`}>
        {tab === 'dashboard' && <Dashboard profile={profile} onOpenRoadmap={() => setTab('roadmap')} />}
        {roadmapVisible && tab === 'roadmap' && <Roadmap clientId={profile.id} />}
        {tab === 'calendar' && <CampaignCalendar clientId={profile.id} />}
        {tab === 'automations' && <Automations clientId={profile.id} />}
        {tab === 'optimizations' && <Optimizations clientId={profile.id} />}
        {tab === 'chat' && <Chat profile={profile} clientId={profile.id} senderRole="client" />}
        {tab === 'growth' && <GrowthTeaser />}
      </main>

      <Mascot firstName={profile.first_name} roadmapItems={roadmapVisible ? roadmapItems : []} onOpenRoadmap={() => setTab('roadmap')} />
    </div>
  )
}
