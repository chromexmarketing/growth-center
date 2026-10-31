import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Dashboard from './Dashboard.jsx'
import CampaignCalendar from './CampaignCalendar.jsx'
import Automations from './Automations.jsx'
import Optimizations from './Optimizations.jsx'
import Chat from './Chat.jsx'
import MyProfile from './MyProfile.jsx'
import InstallApp from './InstallApp.jsx'
import GrowthTeaser from './GrowthTeaser.jsx'
import ChatPushPrompt from './ChatPushPrompt.jsx'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', ico: '◧' },
  { id: 'calendar', label: 'Campaign calendar', ico: '▦' },
  { id: 'automations', label: 'Automations', ico: '⚡' },
  { id: 'optimizations', label: 'Optimizations', ico: '▲' },
  { id: 'chat', label: 'Chat', ico: '✉' },
]

export default function ClientPortal({ profile }) {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') === 'chat' ? 'chat' : 'dashboard')
  const [company,setCompany] = useState(profile.role==='client_member'?null:profile)
  useEffect(()=>{supabase.from('client_memberships').select('client_id').eq('user_id',profile.id).maybeSingle().then(async ({data})=>{if(data?.client_id){const result=await supabase.from('profiles').select('*').eq('id',data.client_id).single();if(result.data)setCompany(result.data)}})},[profile.id])

  // record a sign-in event for the admin activity feed
  useEffect(() => {
    if(company?.id) supabase.from('login_events').insert({ client_id: company.id }).then(() => {})
  }, [profile.id,company?.id])

  if (!company) return <div className="login-wrap"><div className="muted">Loading your brand workspace…</div></div>

  return (
    <div className="shell chromex-mobile-v2 client-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.webp" alt="Chromex" />
          <span>Chromex<em>.</em></span>
        </div>

        <p className="nav-section">Client portal</p>
        {TABS.map(t => (
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
        <InstallApp />
        <button className={`nav-btn ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}><span className="ico">◉</span> My Profile</button>
        <button className="nav-btn" onClick={() => supabase.auth.signOut()}>
          <span className="ico">⏻</span>Sign out
        </button>
      </aside>

      <main className={`main ${tab === 'growth' ? 'main-full' : tab === 'chat' ? 'main-chat' : ''}`}>
        {tab === 'dashboard' && <Dashboard profile={{...company,first_name:profile.first_name}} clientId={company.id} />}
        {tab === 'calendar' && <CampaignCalendar clientId={company.id} />}
        {tab === 'automations' && <Automations clientId={company.id} />}
        {tab === 'optimizations' && <Optimizations clientId={company.id} />}
        {tab === 'chat' && <ChatPushPrompt userId={profile.id} />}
        {tab === 'chat' && <Chat profile={profile} clientId={company.id} senderRole="client" title={`Chromex × ${company.brand_name || "Your Brand"}`} />}
        {tab === 'growth' && <GrowthTeaser />}
        {tab === 'profile' && <MyProfile profile={profile} />}
      </main>
      <nav className="mobile-v2-dock" aria-label="Client navigation">{TABS.map(t => <button key={t.id} type="button" aria-label={t.label} aria-current={tab===t.id?"page":undefined} className={tab===t.id?"selected":""} onClick={()=>setTab(t.id)}><span className="mobile-v2-icon">{t.ico}</span><span className="mobile-v2-tab-label">{t.id==="calendar"?"Calendar":t.id==="automations"?"Flows":t.label}</span></button>)}</nav>
    </div>
  )
}
