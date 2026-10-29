import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_PHASES = [
  ['Discovery & Strategy', ['Account access and integrations', 'Email & SMS audit', 'Customer and competitor research', 'Deliverability review', 'Implementation strategy']],
  ['Popup Implementation', ['Popup strategy and offer', 'Desktop and mobile designs', 'Email and SMS capture setup', 'Targeting rules and QA', 'Launch popup']],
  ['Automation Build', ['Welcome Flow', 'Browse Abandonment Flow', 'Checkout Abandonment Flow', 'Site Abandonment Flow', 'Post-Purchase Flow', 'Winback Flow', 'SMS automations']],
  ['Campaign Planning & Launch', ['Campaign strategy', 'Campaign calendar', 'Copy and creative', 'Client review', 'Schedule campaigns']],
  ['Testing & Optimization', ['Popup tests', 'Flow analysis', 'Campaign testing', 'Ongoing improvements']]
]
export { DEFAULT_PHASES }

export function useRoadmap(clientId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!clientId) return
    let active = true
    setLoading(true)
    supabase.from('roadmap_items').select('*').eq('client_id', clientId)
      .order('phase_order').order('item_order')
      .then(({data,error}) => {
        if (!active) return
        setItems(data || [])
        setError(error?.message || '')
        setLoading(false)
      })
    return () => { active = false }
  }, [clientId])
  return {items, setItems, loading, error}
}

export function RoadmapSummary({clientId, onOpen}) {
  const {items,loading,error} = useRoadmap(clientId)
  if (loading || error || !items.length) return null
  const completed = items.filter(i => i.status === 'completed').length
  const percent = Math.round(completed / items.length * 100)
  const attention = items.filter(i => i.status === 'awaiting_client')
  const current = items.find(i => i.status === 'in_progress') || items.find(i => i.status === 'not_started')
  return <section className="card roadmap-summary">
    <div className="roadmap-heading"><h3>Implementation Roadmap</h3><strong>{percent}% complete</strong></div>
    <div className="roadmap-track"><div style={{width:percent+'%'}} /></div>
    <p className="muted">{completed} of {items.length} deliverables completed</p>
    {attention.length > 0 ? <p>⚠ {attention.length} item{attention.length>1?'s':''} awaiting your input</p> : current ? <p>Up next: {current.title}</p> : <p>All deliverables complete!</p>}
    {onOpen && <button className="btn" onClick={onOpen}>View roadmap →</button>}
  </section>
}

export default function Roadmap({clientId, editable=false}) {
  const {items,setItems,loading,error} = useRoadmap(clientId)
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState('')
  const [newPhase,setNewPhase] = useState('')
  const [newTitle,setNewTitle] = useState('')
  const [selectedPhase,setSelectedPhase] = useState('')
  const [collapsed,setCollapsed] = useState([])
  const phases = [...new Map(items.map(i=>[i.phase_name,i.phase_order])).entries()].sort((a,b)=>a[1]-b[1])
  const completed = items.filter(i=>i.status==='completed').length
  const percent = items.length ? Math.round(completed/items.length*100) : 0
  async function save(id, changes) {
    setBusy(true); setNotice('')
    const {data,error} = await supabase.from('roadmap_items').update(changes).eq('id',id).select().single()
    if (error) setNotice(error.message)
    else setItems(old=>old.map(i=>i.id===id?data:i))
    setBusy(false)
  }
  async function add(phase,title,phaseOrder,itemOrder) {
    if (!phase.trim() || !title.trim()) return
    setBusy(true);setNotice('')
    const {data,error}=await supabase.from('roadmap_items').insert({client_id:clientId,phase_name:phase.trim(),title:title.trim(),phase_order:phaseOrder,item_order:itemOrder}).select().single()
    if(error) setNotice(error.message)
    else setItems(old=>[...old,data].sort((a,b)=>a.phase_order-b.phase_order||a.item_order-b.item_order))
    setBusy(false)
  }
  async function remove(id) {
    if(!window.confirm('Delete this roadmap item?')) return
    setBusy(true)
    const {error}=await supabase.from('roadmap_items').delete().eq('id',id)
    if(error) setNotice(error.message)
    else setItems(old=>old.filter(i=>i.id!==id))
    setBusy(false)
  }
  async function initialize() {
    setBusy(true);setNotice('')
    const rows=DEFAULT_PHASES.flatMap(([phase,names],p)=>names.map((title,i)=>({client_id:clientId,phase_name:phase,title,phase_order:p,item_order:i})))
    const {data,error}=await supabase.from('roadmap_items').insert(rows).select()
    if(error) setNotice(error.message)
    else setItems(data)
    setBusy(false)
  }
  return <div className="roadmap-page">
    <p className="eyebrow">Client implementation</p><h1 className="page-title">Roadmap</h1>
    <p className="page-sub">Your onboarding, deliverables, and ongoing initiatives.</p>
    {loading && <p>Loading roadmap…</p>}
    {error && <p className="error-text">Roadmap unavailable: {error}</p>}
    {notice && <p role="alert" className="error-text">{notice}</p>}
    {!loading && !error && <>
      <section className="card"><div className="roadmap-heading"><strong>Overall progress</strong><strong>{percent}%</strong></div>
      <div className="roadmap-track"><div style={{width:percent+'%'}} /></div><p className="muted">{completed} of {items.length} deliverables completed</p></section>
      {!items.length && <div className="card"><p>No roadmap has been published yet.</p>{editable && <button className="btn" disabled={busy} onClick={initialize}>Create standard onboarding roadmap</button>}</div>}
      {phases.map(([phase])=>{
        const phaseItems=items.filter(i=>i.phase_name===phase)
        const closed=collapsed.includes(phase)
        return <section className="card roadmap-phase" key={phase}>
          <button className="roadmap-phase-toggle" onClick={()=>setCollapsed(old=>closed?old.filter(x=>x!==phase):[...old,phase])}>
            <strong>{phase}</strong><span>{phaseItems.filter(i=>i.status==='completed').length}/{phaseItems.length} completed {closed?'▾':'▴'}</span>
          </button>
          {!closed && <div className="roadmap-items">{phaseItems.map(item=><div className="roadmap-item" key={item.id}>
            <div className="roadmap-item-main"><strong>{item.title}</strong><span className={'roadmap-status status-'+item.status}>{item.status.replaceAll('_',' ')}</span></div>
            {item.description && <p>{item.description}</p>}
            {item.client_instruction && item.status==='awaiting_client' && <p className="roadmap-action">Action needed: {item.client_instruction}</p>}
            {item.target_date && <small>Target: {item.target_date}</small>}
            {item.completed_at && <small>Completed: {new Date(item.completed_at).toLocaleDateString()}</small>}
            {editable && <div className="roadmap-editor">
              <select disabled={busy} aria-label={'Status for '+item.title} value={item.status} onChange={e=>save(item.id,{status:e.target.value,completed_at:e.target.value==='completed'?new Date().toISOString():null})}>
                <option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="awaiting_client">Awaiting client</option><option value="completed">Completed</option>
              </select>
              <button disabled={busy} onClick={()=>{const title=window.prompt('Deliverable name',item.title);if(title?.trim())save(item.id,{title:title.trim()})}}>Rename</button>
              <button disabled={busy} onClick={()=>{const text=window.prompt('Client instructions',item.client_instruction||'');if(text!==null)save(item.id,{client_instruction:text})}}>Instructions</button>
              <button disabled={busy} onClick={()=>remove(item.id)}>Delete</button>
            </div>}
          </div>)}</div>}
        </section>
      })}
      {editable && <section className="card roadmap-add">
        <h3>Add deliverable</h3>
        <select value={selectedPhase} onChange={e=>setSelectedPhase(e.target.value)}><option value="">New phase</option>{phases.map(([p])=><option key={p}>{p}</option>)}</select>
        {!selectedPhase && <input className="input" placeholder="New phase name" value={newPhase} onChange={e=>setNewPhase(e.target.value)} />}
        <input className="input" placeholder="Deliverable name" value={newTitle} onChange={e=>setNewTitle(e.target.value)} />
        <button className="btn" disabled={busy||!newTitle.trim()||!(selectedPhase||newPhase.trim())} onClick={async()=>{
          const phase=selectedPhase||newPhase
          const order=selectedPhase?phases.find(([p])=>p===phase)?.[1]:Math.max(-1,...items.map(i=>i.phase_order))+1
          await add(phase,newTitle,order,items.filter(i=>i.phase_name===phase).length)
          setNewTitle('');setNewPhase('')
        }}>Add item</button>
      </section>}
    </>}
  </div>
}
