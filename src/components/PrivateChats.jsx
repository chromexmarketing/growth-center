import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Chat from './Chat.jsx'

// The same Chat component renders both channels and DMs, keeping every
// composer, reaction, attachment, editing, mobile, and formatting interaction identical.
export default function PrivateChats({profile,clientId,senderRole,title}) {
 const [view,setView]=useState('team')
 const [members,setMembers]=useState([])
 const [conversations,setConversations]=useState([])
 const [active,setActive]=useState(null)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const isStaff=senderRole!=='client'
 const selected=conversations.find(c=>c.id===active)
 const partnerId=selected?(selected.person_a===profile.id?selected.person_b:selected.person_a):null
 const partner=members.find(m=>m.id===partnerId)
 const name=m=>m?.first_name||m?.brand_name||'Member'
 async function loadMembers(){
  const [clients,staff,admins]=await Promise.all([
   supabase.from('client_memberships').select('user_id').eq('client_id',clientId),
   supabase.from('staff_assignments').select('staff_id').eq('client_id',clientId),
   supabase.from('profiles').select('id').eq('role','admin')
  ])
  const ids=isStaff?[clientId,...(clients.data||[]).map(m=>m.user_id)]:[...(staff.data||[]).map(m=>m.staff_id),...(admins.data||[]).map(m=>m.id)]
  const unique=[...new Set(ids.filter(id=>id&&id!==profile.id))]
  if(!unique.length){setMembers([]);return}
  const {data,error:e}=await supabase.from('profiles').select('id,first_name,brand_name,avatar_url,job_title,role').in('id',unique)
  if(e)setError(e.message)
  setMembers(data||[])
 }
 async function loadConversations(){
  const {data,error:e}=await supabase.from('direct_conversations').select('*').eq('client_id',clientId).order('created_at',{ascending:false})
  if(e)setError(e.message);else setConversations(data||[])
 }
 useEffect(()=>{setView('team');setActive(null);setError('');loadMembers();loadConversations()},[clientId,profile.id])
 useEffect(()=>{if(view!=='direct')return;loadConversations();const interval=setInterval(loadConversations,15000);return()=>clearInterval(interval)},[view,clientId])
 async function startConversation(member){
  setError('')
  const a=[profile.id,member.id].sort()
  const existing=conversations.find(c=>c.person_a===a[0]&&c.person_b===a[1])
  if(existing){setActive(existing.id);setView('direct');return}
  setBusy(true)
  let {data,error:e}=await supabase.from('direct_conversations').insert({client_id:clientId,person_a:a[0],person_b:a[1]}).select().single()
  if(e?.code==='23505'){
   const found=await supabase.from('direct_conversations').select('*').eq('client_id',clientId).eq('person_a',a[0]).eq('person_b',a[1]).maybeSingle()
   data=found.data;e=found.error
  }
  setBusy(false)
  if(e||!data){setError(e?.message||'Unable to open conversation');return}
  setConversations(prev=>[data,...prev.filter(c=>c.id!==data.id)])
  setActive(data.id);setView('direct')
 }
 const other=c=>members.find(m=>m.id===(c.person_a===profile.id?c.person_b:c.person_a))
 return <div className={'dm-shell'+(view==='direct'&&active?' dm-active':'')}>
  <aside className="dm-sidebar">
   <header className="dm-sidebar-heading"><h2>Messages</h2></header>
   <button className={'dm-list-item'+(view==='team'?' selected':'')} onClick={()=>{setView('team');setActive(null)}}><span className="dm-avatar dm-group-icon">#</span><span><strong>Team Chat</strong><small>{title||'Company channel'}</small></span></button>
   <div className="dm-sidebar-label">DIRECT MESSAGES</div>
   {conversations.map(c=><button key={c.id} className={'dm-list-item'+(active===c.id&&view==='direct'?' selected':'')} onClick={()=>{setView('direct');setActive(c.id)}}><span className="dm-avatar">{other(c)?.avatar_url?<img src={other(c).avatar_url} alt=""/>:name(other(c)).slice(0,1)}</span><span><strong>{name(other(c))}</strong><small>Private conversation</small></span></button>)}
   <div className="dm-sidebar-label">START A CONVERSATION</div>
   {members.filter(m=>!conversations.some(c=>c.person_a===m.id||c.person_b===m.id)).map(m=><button key={m.id} className="dm-list-item" disabled={busy} onClick={()=>startConversation(m)}><span className="dm-avatar">{m.avatar_url?<img src={m.avatar_url} alt=""/>:name(m).slice(0,1)}</span><span><strong>{name(m)}</strong><small>Start private chat</small></span><span className="dm-add">＋</span></button>)}
   {error&&<p className="dm-error" role="alert">{error}</p>}
  </aside>
  <div className="dm-content">
   {view==='team'?<Chat key={'team-'+clientId} profile={profile} clientId={clientId} senderRole={senderRole} title={title}/>:active?<><button className="dm-back-mobile" onClick={()=>setActive(null)}>‹ Conversations</button><Chat key={'direct-'+active} profile={profile} clientId={clientId} senderRole={senderRole} title={name(partner)} conversationId={active} partnerId={partnerId} partnerName={name(partner)}/></>:<div className="dm-placeholder">Select someone to start a private conversation.</div>}
  </div>
 </div>
}
