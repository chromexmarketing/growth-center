import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const ROLES = { account_manager: 'Account manager', designer: 'Designer', strategist: 'Strategist' }
function localToday() {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
const EMPTY = { title: '', description: '', assignee_id: '', due_date: '', client_id: '' }

export default function TeamTasksManager() {
  const [form, setForm] = useState(EMPTY)
  const [staff, setStaff] = useState([])
  const [clients, setClients] = useState([])
  const [tasks, setTasks] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rowBusy, setRowBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      supabase.from('profiles').select('id,first_name,employee_role').eq('role', 'staff').order('first_name'),
      supabase.from('profiles').select('id,brand_name,first_name').eq('role', 'client').order('brand_name'),
      supabase.from('employee_tasks')
        .select('id,assignee_id,title,description,client_label,due_date,status,created_at,completed_at')
        .order('created_at', { ascending: false }).limit(500)
    ]).then(([employees, brands, assignments]) => {
      if (!alive) return
      setStaff(employees.data || [])
      setClients(brands.data || [])
      if (employees.error || brands.error || assignments.error) setError(
        assignments.error?.message || employees.error?.message || brands.error?.message)
      else setError('')
      setTasks(assignments.data || [])
      setLoading(false)
    }).catch(err => {
      if (alive) { setError(err.message); setLoading(false) }
    })
    return () => { alive = false }
  }, [refresh])

  const names = Object.fromEntries(staff.map(p => [p.id, p.first_name || 'Team member']))
  const visible = tasks.filter(t => filter === 'all' || t.assignee_id === filter)
  const missingDb = /employee_tasks|schema cache|does not exist|42p01|pgrst205/i.test(error)
  const openCount = tasks.filter(t => t.status !== 'done').length

  async function createTask(event) {
    event.preventDefault()
    if (!form.title.trim() || !form.assignee_id) {
      setError('Choose a team member and enter a task title.')
      return
    }
    const client = clients.find(c => c.id === form.client_id)
    setSaving(true)
    setError('')
    setNotice('')
    const { error: err } = await supabase.from('employee_tasks').insert({
      title: form.title.trim(),
      description: form.description.trim(),
      assignee_id: form.assignee_id,
      due_date: form.due_date || null,
      client_id: client?.id || null,
      client_label: client?.brand_name || client?.first_name || ''
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setNotice('Task assigned.')
    setForm(prev => ({ ...EMPTY, assignee_id: prev.assignee_id }))
    setRefresh(n => n + 1)
  }

  async function toggle(task) {
    if (rowBusy) return
    setRowBusy(task.id)
    setError('')
    const { error: err } = await supabase.from('employee_tasks')
      .update({ status: task.status === 'done' ? 'todo' : 'done' }).eq('id', task.id)
    if (err) setError(err.message)
    else setRefresh(n => n + 1)
    setRowBusy('')
  }

  async function deleteTask(task) {
    if (!window.confirm('Remove this assigned task?')) return
    setRowBusy(task.id)
    setError('')
    const { error: err } = await supabase.from('employee_tasks').delete().eq('id', task.id)
    if (err) setError(err.message)
    else { setNotice('Task removed.'); setRefresh(n => n + 1) }
    setRowBusy('')
  }

  return <div className="team-task-manager">
    <p className="eyebrow">Internal operations</p>
    <h1 className="page-title">Team tasks</h1>
    <p className="page-sub">Assign work to account managers, designers, and strategists. Only the assignee can see each task.</p>
    <div className="team-task-summary"><span><strong>{tasks.length}</strong> Total tasks</span><span><strong>{openCount}</strong> Open</span><span><strong>{staff.length}</strong> Team members</span></div>

    <form className="card team-task-create" onSubmit={createTask}>
      <h2>Assign a task</h2>
      <div className="team-task-form-grid">
        <label className="team-task-field">Task title
          <input className="input" type="text" maxLength={240} required placeholder="e.g. Design the November welcome email"
            value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}/>
        </label>
        <label className="team-task-field">Assign to
          <select className="input" required value={form.assignee_id} onChange={e => setForm(prev => ({ ...prev, assignee_id: e.target.value }))}>
            <option value="">Select an employee</option>
            {staff.map(p => <option key={p.id} value={p.id}>{p.first_name || 'Team member'} · {ROLES[p.employee_role] || 'Account manager'}</option>)}
          </select>
        </label>
        <label className="team-task-field">Client (optional)
          <select className="input" value={form.client_id} onChange={e => setForm(prev => ({ ...prev, client_id: e.target.value }))}>
            <option value="">Internal / no client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.brand_name || c.first_name || 'Client'}</option>)}
          </select>
        </label>
        <label className="team-task-field">Due date (optional)
          <input className="input" type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))}/>
        </label>
      </div>
      <label className="team-task-field">Instructions (optional)
        <textarea className="input" rows={3} maxLength={4000} placeholder="Anything your teammate needs to know"
          value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}/>
      </label>
      <div className="team-task-form-footer"><p className="muted">Tasks remain visible until completed or removed.</p>
        <button className="btn" type="submit" disabled={saving || !staff.length}>{saving ? 'Assigning…' : 'Assign task'}</button></div>
    </form>

    {error && <p className="employee-alert" role="alert">{missingDb
      ? 'Database setup needed: run supabase/migrations/20261031_employee_tasks.sql in Supabase SQL Editor before assigning tasks.'
      : error}</p>}
    {notice && <p className="employee-notice" role="status">{notice}</p>}

    <section className="card team-task-overview">
      <div className="team-task-overview-header">
        <div><h2>Assigned work</h2><p className="muted">Review what your team is working on.</p></div>
        <div className="team-task-overview-controls">
          <select className="input" aria-label="Filter by employee" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">Everyone</option>
            {staff.map(p => <option key={p.id} value={p.id}>{p.first_name || 'Team member'}</option>)}
          </select>
          <button className="btn-ghost small" type="button" onClick={() => setRefresh(n => n + 1)}>Refresh</button>
        </div>
      </div>
      {loading ? <p className="muted">Loading tasks…</p> : !visible.length ? <div className="employee-empty">No tasks here yet.</div>
        : <div className="team-task-rows">{visible.map(task =>
          <div className={'team-task-row' + (task.status === 'done' ? ' is-done' : '')} key={task.id}>
            <button className="employee-task-check" type="button" aria-pressed={task.status === 'done'}
              aria-label={task.status === 'done' ? 'Reopen task' : 'Mark done'} disabled={!!rowBusy} onClick={() => toggle(task)}>
              {task.status === 'done' && '✓'}
            </button>
            <div className="team-task-row-info"><strong>{task.title}</strong>
              <small>{names[task.assignee_id] || 'Team member'}
                {task.client_label ? ' · ' + task.client_label : ''}
                {task.due_date ? ' · Due ' + new Date(task.due_date + 'T12:00:00').toLocaleDateString() : ''}
              </small>
              {task.description && <p>{task.description}</p>}
            </div>
            <span className={'team-task-status' + (task.status === 'done' ? ' finished' : '')}>{task.status === 'done' ? 'Done' : task.due_date && task.due_date < localToday() ? 'Overdue' : 'To do'}</span>
            <button className="team-task-delete" type="button" aria-label={'Delete ' + task.title} disabled={!!rowBusy} onClick={() => deleteTask(task)}>Remove</button>
          </div>
        )}</div>}
    </section>
  </div>
}
