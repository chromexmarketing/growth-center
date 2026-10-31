import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TEAM_ROLES = [['account_manager','Account manager'],['designer','Designer'],['strategist','Strategist']]
const EMPTY = {
  email: '', password: '', first_name: '', brand_name: '',
  platform: 'klaviyo', api_key: '',
}

function timeAgo(ts) {
  if (!ts) return 'never'
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export default function ClientsManager({ clients, onChanged }) {
  const [form, setForm] = useState(EMPTY)
  const [newLogo,setNewLogo] = useState(null)
  const [accountType,setAccountType] = useState('client')
  const [employeeRole,setEmployeeRole] = useState('account_manager')
  const [parentClient,setParentClient] = useState('')
  const [assignedClients,setAssignedClients] = useState([])
  const [logoBusy,setLogoBusy] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [events, setEvents] = useState([])
  const [staff,setStaff] = useState([])
  const [assigning,setAssigning] = useState(null)

  function loadEvents() {
    supabase
      .from('login_events')
      .select('client_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setEvents(data ?? []))
  }
  useEffect(loadEvents, [])
  async function loadStaff(){
    const result=await supabase.from('profiles').select('id,first_name,job_title,employee_role').eq('role','staff')
    const people=result.error ? (await supabase.from('profiles').select('id,first_name,job_title').eq('role','staff')).data : result.data
    const {data: assigned}=await supabase.from('staff_assignments').select('staff_id,client_id')
    setStaff((people||[]).map(p=>({...p,assigned:(assigned||[]).filter(a=>a.staff_id===p.id).map(a=>a.client_id)})))
  }
  useEffect(()=>{loadStaff()},[])

  const lastSeen = {}
  for (const e of events) {
    if (!lastSeen[e.client_id]) lastSeen[e.client_id] = e.created_at
  }

  async function uploadBrandLogo(clientId, file) {
    if (!file) return
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG or WebP logo.')
    if (file.size > 3 * 1024 * 1024) throw new Error('Logo must be under 3 MB.')
    const {data: auth} = await supabase.auth.getUser()
    const adminId = auth?.user?.id
    if (!adminId) throw new Error('Please sign in again.')
    const extension = file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'
    const path = `${adminId}/client-brand-${clientId}-${Date.now()}.${extension}`
    const {error: uploadError} = await supabase.storage.from('chat-avatars').upload(path,file,{contentType:file.type,upsert:false})
    if (uploadError) throw uploadError
    const {data} = supabase.storage.from('chat-avatars').getPublicUrl(path)
    const {error: updateError} = await supabase.from('profiles').update({brand_logo_url:data.publicUrl}).eq('id',clientId)
    if (updateError) throw updateError
    onChanged?.()
  }
  async function updateExistingLogo(clientId, file) {
    if (!file) return
    setLogoBusy(clientId);setError('');setOk('')
    try { await uploadBrandLogo(clientId,file);setOk('Brand logo updated.') }
    catch(e) { setError(e.message) }
    finally { setLogoBusy(null) }
  }

  async function createClient() {
    setError(''); setOk('')
    if (accountType==='client_member' && !parentClient) {setError('Select a client brand.');return}
    if (!form.email || !form.password) { setError('Email and password are required.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if(accountType==='staff') {
      const {error: schemaError}=await supabase.from('profiles').select('employee_role').limit(1)
      if(schemaError){setError('Set up employee roles in Supabase first: run the employee_tasks migration.');return}
    }
    setBusy(true)
    try {
      const body = { ...form, account_type:accountType, client_id:parentClient||undefined, assigned_client_ids:accountType==='staff'&&employeeRole!=='account_manager'?[]:assignedClients }
      if (!body.api_key) { body.platform = null; body.api_key = null }
      const { data, error: fnErr } = await supabase.functions.invoke('admin-create-user', { body })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      if(accountType==='staff' && data?.id) {
        const {error: roleError}=await supabase.from('profiles').update({employee_role:employeeRole}).eq('id',data.id)
        if(roleError) throw new Error('Account created, but employee role was not saved: '+roleError.message)
      }
      if (newLogo && data?.id) {
        try { await uploadBrandLogo(data.id,newLogo) }
        catch(logoError) { setError(`Account created, but logo upload failed: ${logoError.message}`) }
      }
      setOk(`${form.brand_name || form.email} created. Send them the URL and their login.`)
      setNewLogo(null)
      setAccountType('client');setParentClient('');setAssignedClients([]);setEmployeeRole('account_manager')
      setForm(EMPTY)
      onChanged?.();loadStaff()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const nameOf = id => {
    const c = clients.find(c => c.id === id)
    return c?.brand_name || c?.first_name || 'Unknown'
  }

  return (
    <div>
      <p className="eyebrow">Team controls</p>
      <h1 className="page-title">Clients</h1>
      <p className="page-sub">Create client logins and see who has been active.</p>

      <div className="card">
        <h3 style={{ marginBottom: 18 }}>Create portal account</h3>
        <label className="label">Account type</label>
        <select className="input" value={accountType} onChange={e=>setAccountType(e.target.value)} style={{maxWidth:360,marginBottom:14}}>
          <option value="client">New client brand</option>
          <option value="client_member">Additional login for existing brand</option>
          <option value="staff">Chromex team member</option>
        </select>
        {accountType==='client_member'&&<div style={{marginBottom:14}}><label className="label">Brand this person belongs to</label><select className="input" value={parentClient} onChange={e=>setParentClient(e.target.value)}><option value="">Select brand</option>{clients.map(c=><option key={c.id} value={c.id}>{c.brand_name}</option>)}</select></div>}
        {accountType==='staff'&&<div style={{marginBottom:14}}><label className="label">Employee role</label><select className="input" value={employeeRole} onChange={e=>{setEmployeeRole(e.target.value);if(e.target.value!=='account_manager')setAssignedClients([])}}>{TEAM_ROLES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><p className="muted" style={{fontSize:12,marginTop:6}}>{employeeRole==='account_manager'?'Account managers can open their assigned client workspaces.':'This role opens the task workspace only, without client portal access.'}</p></div>}
        {accountType==='staff'&&employeeRole==='account_manager'&&<div style={{marginBottom:14}}><label className="label">Assign clients</label>{clients.map(c=><label key={c.id} style={{display:'block',padding:5}}><input type="checkbox" checked={assignedClients.includes(c.id)} onChange={e=>setAssignedClients(prev=>e.target.checked?[...prev,c.id]:prev.filter(id=>id!==c.id))}/> {c.brand_name}</label>)}</div>}
        <div className="form-grid">
          <div>
            <label className="label">Login email</label>
            <input className="input" type="email" value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="jake@cinchgaming.com" />
          </div>
          <div>
            <label className="label">Password (share with them)</label>
            <input className="input" type="text" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="min 8 characters" />
          </div>
          <div>
            <label className="label">First name</label>
            <input className="input" value={form.first_name}
              onChange={e => setForm({ ...form, first_name: e.target.value })}
              placeholder="Jake" />
          </div>
          {accountType==='client'&&<div>
            <label className="label">Brand name</label>
            <input className="input" value={form.brand_name}
              onChange={e => setForm({ ...form, brand_name: e.target.value })}
              placeholder="Cinch Gaming" />
          </div>}
          {accountType==='client'&&<div>
            <label className="label">Revenue platform</label>
            <select className="input" value={form.platform}
              onChange={e => setForm({ ...form, platform: e.target.value })}>
              <option value="klaviyo">Klaviyo</option>
              <option value="omnisend">Omnisend</option>
            </select>
          </div>}
          {accountType==='client'&&<div>
            <label className="label">API key (optional, can add later)</label>
            <input className="input" value={form.api_key}
              onChange={e => setForm({ ...form, api_key: e.target.value })}
              placeholder="pk_… / their key" />
          </div>}
        </div>
        {accountType==='client'&&<div style={{marginTop:16}}><label className="label">Brand logo (optional)</label><input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setNewLogo(e.target.files?.[0]||null)}/><p className="muted" style={{fontSize:12,marginTop:5}}>PNG, JPG or WebP, up to 3 MB. Shown beside client names in chat.</p></div>}
        {error && <p className="error-text">{error}</p>}
        {ok && <p style={{ color: 'var(--orange)', marginTop: 10, fontSize: 14 }}>{ok}</p>}
        <button className="btn" style={{ marginTop: 18 }} onClick={createClient} disabled={busy}>
          {busy ? 'Creating' : accountType==='staff' ? 'Create employee' : accountType==='client_member' ? 'Create team login' : 'Create client'}
        </button>
      </div>

      <div className="card" style={{marginTop:18}}>
        <h3 style={{marginBottom:12}}>Chromex team assignments</h3>
        <p className="muted" style={{fontSize:13,marginBottom:12}}>Only assigned brands are accessible to each team member. You can change assignments here.</p>
        {staff.map(person=><div key={person.id} style={{padding:'12px 0',borderBottom:'1px solid var(--line)'}}>
          <strong>{person.first_name||'Team member'}</strong>
          <div style={{marginTop:9,maxWidth:290}}><label className="label" style={{margin:'0 0 5px'}}>Employee role</label><select className="input" aria-label={'Role for '+(person.first_name||'team member')} value={person.employee_role||'account_manager'} disabled={assigning===person.id} onChange={async e=>{
            const next=e.target.value
            setAssigning(person.id);setError('');setOk('')
            try{
              if(next!=='account_manager'&&person.assigned.length){
                const {data,error}=await supabase.functions.invoke('admin-create-user',{body:{account_type:'update_assignments',client_id:person.id,assigned_client_ids:[]}})
                if(error||data?.error)throw new Error(data?.error||error.message)
              }
              const {error}=await supabase.from('profiles').update({employee_role:next}).eq('id',person.id)
              if(error)throw error
              await loadStaff();setOk('Employee role updated.')
            }catch(err){setError(err.message)}finally{setAssigning(null)}
          }}>{TEAM_ROLES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
          {(person.employee_role||'account_manager')==='account_manager'&&<div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:8}}>
            {clients.map(c=><label key={c.id} style={{fontSize:13}}><input type="checkbox" checked={person.assigned.includes(c.id)} disabled={assigning===person.id} onChange={async e=>{
              const next=e.target.checked?[...person.assigned,c.id]:person.assigned.filter(id=>id!==c.id)
              setAssigning(person.id);setError('');setOk('')
              try{
                const {data,error}=await supabase.functions.invoke('admin-create-user',{body:{account_type:'update_assignments',client_id:person.id,assigned_client_ids:next}})
                if(error||data?.error)throw new Error(data?.error||error.message)
                await loadStaff();setOk('Assignments saved.')
              }catch(err){setError(err.message)}finally{setAssigning(null)}
            }}/> {c.brand_name}</label>)}
          </div>}
        </div>)}
        {!staff.length&&<p className="muted">No Chromex team members yet.</p>}
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginBottom: 14 }}>Activity</h3>
        {clients.map(c => (
          <div className="item-row" key={c.id}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:9}}>{c.brand_logo_url&&<img src={c.brand_logo_url} alt="" style={{width:28,height:28,objectFit:'contain',borderRadius:6}}/>}<h4>{c.brand_name || c.first_name || 'Unnamed client'}</h4></div>
              <p>{c.first_name}</p>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}><label style={{fontSize:12,color:'var(--orange)',cursor:'pointer'}}>{logoBusy===c.id?'Uploading…':c.brand_logo_url?'Change logo':'Add logo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!logoBusy} style={{display:'none'}} onChange={e=>{const file=e.target.files?.[0];e.target.value='';updateExistingLogo(c.id,file)}}/></label><span className="muted" style={{fontSize:13}}>last active {timeAgo(lastSeen[c.id])}</span></div>
          </div>
        ))}
        {events.length > 0 && (
          <>
            <h4 style={{ margin: '22px 0 10px', fontSize: 14, color: 'var(--muted)' }}>
              Recent sign-ins
            </h4>
            {events.slice(0, 12).map((e, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5,
              }}>
                <span>{nameOf(e.client_id)}</span>
                <span className="muted">{new Date(e.created_at).toLocaleString()}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
