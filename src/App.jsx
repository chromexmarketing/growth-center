import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login.jsx'
import ClientPortal from './components/ClientPortal.jsx'
import AdminPortal from './components/admin/AdminPortal.jsx'
import EmployeePortal from './components/employee/EmployeePortal.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (!session) setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (!session) { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => { setProfile(data); setLoading(false) })
  }, [session])

  if (loading) {
    return (
      <div className="login-wrap">
        <div className="muted">Loading…</div>
      </div>
    )
  }

  if (!session || !profile) return <Login />
  if (profile.role === 'admin') return <AdminPortal profile={profile} />
  // Before the employee-task migration is applied, existing staff retain their
  // original client-workspace experience instead of seeing a broken task board.
  if (profile.role === 'staff') return profile.employee_role
    ? <EmployeePortal profile={profile} />
    : <AdminPortal profile={profile} />
  return <ClientPortal profile={profile} />
}
