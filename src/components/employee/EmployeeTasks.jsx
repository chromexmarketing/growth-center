import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const FILTERS = [
  ['all', 'All tasks'], ['today', 'Today & overdue'],
  ['upcoming', 'Upcoming'], ['done', 'Completed']
]
const ROLE_NAMES = { account_manager: 'Account Manager', designer: 'Designer', strategist: 'Strategist' }
function localToday() {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function dateLabel(date) {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EmployeeTasks({ profile }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState([])
  const [refresh, setRefresh] = useState(0)
  const today = localToday()

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    supabase.from('employee_tasks')
      .select('id,title,description,assignee_id,client_label,due_date,status,completed_at,created_at')
      .eq('assignee_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) setError(err.message)
        else setTasks(data || [])
        setLoading(false)
      })
    return () => { alive = false }
  }, [profile.id, refresh])

  const sorted = useMemo(() => [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'done' ? 1 : -1
    if (!a.due_date && b.due_date) return 1
    if (a.due_date && !b.due_date) return -1
    return (a.due_date || '').localeCompare(b.due_date || '') ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  }), [tasks])
  const sections = [
    { id: 'today', title: 'Today & overdue', sub: 'Keep these moving', list: sorted.filter(t => t.status !== 'done' && t.due_date && t.due_date <= today) },
    { id: 'upcoming', title: 'Coming up', sub: 'Plan ahead', list: sorted.filter(t => t.status !== 'done' && t.due_date && t.due_date > today) },
    { id: 'anytime', title: 'No due date', sub: 'Work through when ready', list: sorted.filter(t => t.status !== 'done' && !t.due_date) },
    { id: 'done', title: 'Completed', sub: 'Your finished work', list: sorted.filter(t => t.status === 'done') },
  ].filter(group => filter === 'all' || group.id === filter || (filter === 'upcoming' && group.id === 'anytime'))
  const completed = tasks.filter(t => t.status === 'done').length
  const pending = tasks.length - completed
  const dueNow = tasks.filter(t => t.status !== 'done' && t.due_date && t.due_date <= today).length
  const missingDb = /employee_tasks|schema cache|does not exist|42p01|pgrst205/i.test(error)

  async function toggle(task) {
    if (saving.includes(task.id)) return
    const next = task.status === 'done' ? 'todo' : 'done'
    setSaving(prev => [...prev, task.id])
    setError('')
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    try {
      const { data, error: err } = await supabase.from('employee_tasks')
        .update({ status: next }).eq('id', task.id).eq('assignee_id', profile.id)
        .select('id,status,completed_at').single()
      if (err) throw err
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: data.status, completed_at: data.completed_at } : t))
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
      setError(err.message || 'Could not update the task.')
    } finally {
      setSaving(prev => prev.filter(id => id !== task.id))
    }
  }

  return <div className="employee-task-page">
    <header className="employee-page-header">
      <div><p className="eyebrow">Chromex workspace</p><h1>My tasks</h1>
        <p className="employee-page-sub">{ROLE_NAMES[profile.employee_role] || 'Team member'} · Your work, in one place.</p>
      </div>
      <button className="employee-refresh" type="button" disabled={loading} onClick={() => setRefresh(n => n + 1)}>↻ Refresh</button>
    </header>
    <div className="employee-stats">
      <div className="employee-stat"><span>To do</span><strong>{loading ? '—' : pending}</strong><small>Open assignments</small></div>
      <div className="employee-stat employee-stat-accent"><span>Needs attention</span><strong>{loading ? '—' : dueNow}</strong><small>Today or overdue</small></div>
      <div className="employee-stat"><span>Completed</span><strong>{loading ? '—' : completed}</strong><small>Tasks checked off</small></div>
    </div>
    <div className="employee-filter-row" role="group" aria-label="Task filter">
      {FILTERS.map(([value, label]) =>
        <button key={value} className={'employee-filter' + (filter === value ? ' active' : '')}
          type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {error && <div className="employee-alert" role="alert">{missingDb
      ? 'The owner needs to finish setting up the employee task database. Your tasks will appear here after setup.'
      : error}</div>}
    {loading ? <div className="employee-empty">Loading your tasks…</div> : !error && !tasks.length
      ? <div className="employee-empty"><div className="employee-empty-icon">✓</div><h2>All clear for now.</h2><p>No tasks have been assigned to you yet.</p></div>
      : !error && !sections.some(s => s.list.length)
      ? <div className="employee-empty"><h2>Nothing in this view.</h2><p>Try another filter.</p></div>
      : null}
    {!loading && !error && sections.filter(s => s.list.length).map(section =>
      <section className="employee-task-section" key={section.id}>
        <div className="employee-section-heading"><h2>{section.title} <span>{section.list.length}</span></h2><p>{section.sub}</p></div>
        <div className="employee-task-list">{section.list.map(task =>
          <div className={'employee-task-item' + (task.status === 'done' ? ' completed' : '')} key={task.id}>
            <button type="button" className="employee-task-check" disabled={saving.includes(task.id)}
              aria-label={(task.status === 'done' ? 'Mark incomplete: ' : 'Mark complete: ') + task.title}
              aria-pressed={task.status === 'done'} onClick={() => toggle(task)}>
              {task.status === 'done' && <span aria-hidden="true">✓</span>}
            </button>
            <div className="employee-task-details">
              <h3>{task.title}</h3>
              {task.description && <p className="employee-task-description">{task.description}</p>}
              <div className="employee-task-meta">
                {task.client_label && <span className="employee-task-brand">{task.client_label}</span>}
                {task.due_date && <span className={task.status !== 'done' && task.due_date < today ? 'employee-task-overdue' : ''}>
                  {task.status !== 'done' && task.due_date < today ? 'Overdue · ' : 'Due '}{dateLabel(task.due_date)}
                </span>}
                {task.status === 'done' && <span className="employee-task-done">Completed</span>}
              </div>
            </div>
          </div>
        )}</div>
      </section>
    )}
  </div>
}
