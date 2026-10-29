import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_PHASES = [
  ['Discovery & Strategy', ['Account access and integrations', 'Email & SMS audit', 'Customer and competitor research', 'Deliverability review', 'Implementation strategy']],
  ['Popup Implementation', ['Popup strategy and offer', 'Desktop and mobile designs', 'Email and SMS capture setup', 'Targeting rules and QA', 'Launch popup']],
  ['Automation Build', ['Welcome Flow', 'Browse Abandonment Flow', 'Checkout Abandonment Flow', 'Site Abandonment Flow', 'Post-Purchase Flow', 'Winback Flow', 'SMS automations']],
  ['Campaign Planning & Launch', ['Campaign strategy', 'Campaign calendar', 'Copy and creative', 'Client review', 'Schedule campaigns']],
  ['Testing & Optimization', ['Popup tests', 'Flow analysis', 'Campaign testing', 'Ongoing improvements']]
]
const GROWTH_PHASES = [
  ['Campaign Calendar', ['Plan monthly email & SMS campaign calendar', 'Share campaign schedule for review', 'Finalize campaign themes and offers']],
  ['Campaign Production', ['Write and design scheduled campaigns', 'Review and approve campaign creatives', 'Schedule and launch campaigns']],
  ['Automation Updates', ['Review performance of active flows', 'Refresh priority automation content and offers', 'QA and publish automation updates']],
  ['Popup & List Growth', ['Review signup popup performance', 'Test capture offers and targeting']],
  ['Optimization & Reporting', ['Run an A/B test', 'Review revenue and engagement performance', 'Share monthly results and next priorities']]
]
export function monthKey(date=new Date()) { return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-01' }
export function monthLabel(key) { return new Date(key+'T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'}) }
export { DEFAULT_PHASES, GROWTH_PHASES }

export function useRoadmapSettings(clientId) {
  const [settings,setSettings]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!clientId) {setSettings(null);setLoading(false);return}
    let alive=true
    setLoading(true);setSettings(null);setError('')
    supabase.from('roadmap_settings').select('*').eq('client_id',clientId).maybeSingle()
      .then(({data,error})=>{if(alive){setSettings(data||{client_id:clientId,enabled:false,title:'Roadmap',template_type:'growth'});setError(error?.message||'');setLoading(false)}})
    return ()=>{alive=false}
  },[clientId])
  return {settings,setSettings,loading,error}
}

export function useRoadmap(clientId) {
  const [items, setItems] = useState([])
  const [refresh,setRefresh] = useState(0)
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
  }, [clientId,refresh])
  return {items, setItems, loading, error, reload:()=>setRefresh(n=>n+1)}
}

export function RoadmapSummary({clientId, onOpen}) {
  const {settings} = useRoadmapSettings(clientId)
  const {items,loading,error} = useRoadmap(clientId)
  if (!settings?.enabled || loading || error || !items.length) return null
  const currentItems=items.filter(i=>settings?.template_type==='onboarding' ? !i.roadmap_month : i.roadmap_month===monthKey())
  if (!currentItems.length) return null
  const completed = currentItems.filter(i => i.status === 'completed').length
  const percent = Math.round(completed / currentItems.length * 100)
  const attention = currentItems.filter(i => i.status === 'awaiting_client')
  const current = currentItems.find(i => i.status === 'in_progress') || currentItems.find(i => i.status === 'not_started')
  return <section className="card roadmap-summary">
    <div className="roadmap-heading"><h3>{settings.template_type==='onboarding'?'Onboarding Roadmap':monthLabel(monthKey())+' Roadmap'}</h3><strong>{percent}% complete</strong></div>
    <div className="roadmap-track"><div style={{width:percent+'%'}} /></div>
    <p className="muted">{completed} of {currentItems.length} deliverables completed</p>
    {attention.length > 0 ? <p>⚠ {attention.length} item{attention.length>1?'s':''} awaiting your input</p> : current ? <p>Up next: {current.title}</p> : <p>All deliverables complete!</p>}
    {onOpen && <button className="btn" onClick={onOpen}>View roadmap →</button>}
  </section>
}

export default function Roadmap({clientId, editable=false}) {
  const {items,setItems,loading,error,reload} = useRoadmap(clientId)
  const {settings,setSettings,loading:settingsLoading,error:settingsError} = useRoadmapSettings(clientId)
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState('')
  const [newPhase,setNewPhase] = useState('')
  const [newTitle,setNewTitle] = useState('')
  const [selectedPhase,setSelectedPhase] = useState('')
  const [collapsed,setCollapsed] = useState([])
  const [selectedMonth,setSelectedMonth] = useState(monthKey())
  const [clientPreview,setClientPreview] = useState(false)
  const isOnboarding=settings?.template_type==='onboarding'
  const visibleItems=items.filter(i=>isOnboarding ? !i.roadmap_month : i.roadmap_month===selectedMonth)
  const phases=[...new Map(visibleItems.map(i=>[i.phase_name,i.phase_order])).entries()].sort((a,b)=>a[1]-b[1])
  const completed=visibleItems.filter(i=>i.status==='completed').length
  const percent=visibleItems.length ? Math.round(completed/visibleItems.length*100) : 0
  const readOnly=!editable||clientPreview
  const availableMonths=[...new Set([monthKey(),...items.map(i=>i.roadmap_month).filter(Boolean)])].sort().reverse()
  
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
    const {data,error}=await supabase.from('roadmap_items').insert({client_id:clientId,phase_name:phase.trim(),title:title.trim(),phase_order:phaseOrder,item_order:itemOrder,roadmap_month:isOnboarding?null:selectedMonth}).select().single()
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
  async function updateSettings(changes) {
    setBusy(true);setNotice('')
    const next={client_id:clientId,enabled:settings?.enabled||false,title:settings?.title||'Roadmap',template_type:settings?.template_type||'growth',...changes}
    const {data,error}=await supabase.from('roadmap_settings').upsert(next,{onConflict:'client_id'}).select().single()
    if(error) setNotice(error.message)
    else setSettings(data)
    setBusy(false)
  }
  async function initialize(template) {
    setBusy(true);setNotice('')
    const rows=(template==='growth'?GROWTH_PHASES:DEFAULT_PHASES).flatMap(([phase,names],p)=>names.map((title,i)=>({client_id:clientId,phase_name:phase,title,phase_order:p,item_order:i,roadmap_month:template==='growth'?selectedMonth:null})))
    const {data,error}=await supabase.from('roadmap_items').insert(rows).select()
    if(error) setNotice(error.message)
    else {reload();setNotice('Roadmap created. It remains private until you enable client visibility.')}
    setBusy(false)
  }
  return <div className="roadmap-page">
    <p className="eyebrow">{isOnboarding?'Client onboarding':'Monthly growth delivery'}</p><h1 className="page-title">{isOnboarding?'Onboarding Roadmap':monthLabel(selectedMonth)+' Roadmap'}</h1>
    <p className="page-sub">{isOnboarding?'Your implementation milestones.':'Campaigns, automation updates, and ongoing optimization.'}</p>
    {settingsError && <p className="error-text">Roadmap settings unavailable: {settingsError}</p>}
    {editable && !settingsLoading && !settingsError && <section className="card roadmap-control">
      <div className="roadmap-heading"><div><h3>Manage roadmap</h3><p className="muted">Changes are saved for this client only.</p></div><label className="roadmap-switch"><input type="checkbox" checked={!!settings?.enabled} disabled={busy} onChange={e=>updateSettings({enabled:e.target.checked})}/> Visible to client</label></div>
      <div className="roadmap-control-grid">
        <label>Roadmap type<select disabled={busy} value={settings?.template_type||'growth'} onChange={e=>updateSettings({template_type:e.target.value})}><option value="growth">Monthly updates (existing client)</option><option value="onboarding">Onboarding (new client)</option></select></label>
        {!isOnboarding && <label>Month<input type="month" value={selectedMonth.slice(0,7)} onChange={e=>setSelectedMonth(e.target.value+'-01')} /></label>}
        <label>Client view<button type="button" className="btn" onClick={()=>setClientPreview(v=>!v)}>{clientPreview?'Back to editing':'Preview as client'}</button></label>
      </div>
      <p className="muted">Build privately, preview it, then turn on client visibility when ready.</p>
    </section>}
    {!isOnboarding && !editable && <p className="muted">{monthLabel(selectedMonth)} deliverables</p>}
    {!isOnboarding && !editable && availableMonths.length>1 && <label>View month <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>{availableMonths.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>}
    {clientPreview && <p className="roadmap-preview-banner">Client preview — editing controls hidden</p>}
    {loading && <p>Loading roadmap…</p>}
    {error && <p className="error-text">Roadmap unavailable: {error}</p>}
    {notice && <p role="alert" className="error-text">{notice}</p>}
    {!loading && !error && <>
      <section className="card"><div className="roadmap-heading"><strong>Overall progress</strong><strong>{percent}%</strong></div>
      <div className="roadmap-track"><div style={{width:percent+'%'}} /></div><p className="muted">{completed} of {visibleItems.length} deliverables completed</p></section>
      {!visibleItems.length && <div className="card"><p>{isOnboarding?'No onboarding milestones yet.':'No deliverables for '+monthLabel(selectedMonth)+' yet.'}</p>{editable && !clientPreview && <button className="btn" disabled={busy} onClick={()=>initialize(isOnboarding?'onboarding':'growth')}>{isOnboarding?'Create onboarding milestones':'Generate '+monthLabel(selectedMonth)+' deliverables'}</button>}</div>}
      {phases.map(([phase])=>{
        const phaseItems=visibleItems.filter(i=>i.phase_name===phase)
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
            {!readOnly && <div className="roadmap-editor">
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
      {!readOnly && <section className="card roadmap-add">
        <h3>Add deliverable</h3>
        <select value={selectedPhase} onChange={e=>setSelectedPhase(e.target.value)}><option value="">New phase</option>{phases.map(([p])=><option key={p}>{p}</option>)}</select>
        {!selectedPhase && <input className="input" placeholder="New phase name" value={newPhase} onChange={e=>setNewPhase(e.target.value)} />}
        <input className="input" placeholder="Deliverable name" value={newTitle} onChange={e=>setNewTitle(e.target.value)} />
        <button className="btn" disabled={busy||!newTitle.trim()||!(selectedPhase||newPhase.trim())} onClick={async()=>{
          const phase=selectedPhase||newPhase
          const order=selectedPhase?phases.find(([p])=>p===phase)?.[1]:Math.max(-1,...visibleItems.map(i=>i.phase_order))+1
          await add(phase,newTitle,order,visibleItems.filter(i=>i.phase_name===phase).length)
          setNewTitle('');setNewPhase('')
        }}>Add item</button>
      </section>}
    </>}
  </div>
}
