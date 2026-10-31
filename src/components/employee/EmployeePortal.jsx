import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import EmployeeTasks from './EmployeeTasks.jsx'
import MyProfile from '../MyProfile.jsx'
import AdminPortal from '../admin/AdminPortal.jsx'

const ROLE_LABELS = { account_manager: 'Account Manager', designer: 'Designer', strategist: 'Strategist' }

export default function EmployeePortal({ profile }) {
  const [tab, setTab] = useState('tasks')
  const canAccessClients = profile.employee_role === 'account_manager'
  if (tab === 'clients' && canAccessClients) {
    return <AdminPortal profile={profile} onBackToTasks={() => setTab('tasks')}/>
  }

  return <div className="employee-shell">
    <aside className="employee-sidebar">
      <div className="employee-brand"><img src="/logo.webp" alt="" /><span>Chromex<em>.</em></span></div>
      <div className="employee-sidebar-caption">MY WORKSPACE</div>
      <button type="button" className={'employee-nav-item' + (tab === 'tasks' ? ' active' : '')}
        onClick={() => setTab('tasks')}><span aria-hidden="true">☑</span> My tasks</button>
      {canAccessClients && <button type="button" className="employee-nav-item" onClick={() => setTab('clients')}>
        <span aria-hidden="true">◧</span> Client workspace</button>}
      <div className="employee-sidebar-spacer"/>
      <button type="button" className={'employee-nav-item' + (tab === 'profile' ? ' active' : '')}
        onClick={() => setTab('profile')}><span aria-hidden="true">◉</span> My profile</button>
      <button type="button" className="employee-nav-item" onClick={() => supabase.auth.signOut()}>
        <span aria-hidden="true">⏻</span> Sign out</button>
      <div className="employee-sidebar-identity">
        {profile.avatar_url ? <img src={profile.avatar_url} alt=""/> : <div className="employee-avatar">{(profile.first_name || 'T').slice(0, 1).toUpperCase()}</div>}
        <div><strong>{profile.first_name || 'Chromex teammate'}</strong><small>{ROLE_LABELS[profile.employee_role] || 'Team member'}</small></div>
      </div>
    </aside>

    <header className="employee-mobile-header">
      <div className="employee-brand"><img src="/logo.webp" alt=""/><span>Chromex<em>.</em></span></div>
      <button type="button" className="employee-mobile-profile" onClick={() => setTab(tab === 'profile' ? 'tasks' : 'profile')}>
        {profile.avatar_url ? <img src={profile.avatar_url} alt="Profile"/> : (profile.first_name || 'T').slice(0, 1).toUpperCase()}
      </button>
    </header>
    <main className="employee-main">
      {tab === 'tasks' && <EmployeeTasks profile={profile}/>}
      {tab === 'profile' && <MyProfile profile={profile}/>}
    </main>
    <nav className="employee-mobile-nav" aria-label="Employee navigation">
      <button type="button" className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}><span aria-hidden="true">☑</span>Tasks</button>
      {canAccessClients && <button type="button" onClick={() => setTab('clients')}><span aria-hidden="true">◧</span>Clients</button>}
      <button type="button" className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}><span aria-hidden="true">◉</span>Profile</button>
    </nav>
  </div>
}
