import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Chat from './Chat.jsx'

// Conversations are explicitly scoped to two participants. Group chat remains
// the original Chat component; DMs use separate RLS-protected tables.
export default function PrivateChats({profile,clientId,senderRole,title}) {
 const [view,setView]=useState('team')
 const [members,setMembers]=useState([])
 const [conversations,setConversations]=useState([])
 const [active,setActive]=useState(null)
 const [messages,setMessages]=useState([])
 const [draft,setDraft]=useState('')
 const [error,setError]=useState('')
 const [search,setSearch]=useState('')
 const [editing,setEditing]=useState(null)
 const [editText,setEditText]=useState('')
 const [reply,setReply]=useState(null)
 const [uploading,setUploading]=useState(false)
 const [busy,setBusy]=useState(false)
 const [unread,setUnread]=useState({})
 const fileRef=useRef(null),bottomRef=useRef(null)
 const isStaff=senderRole!=='client'
 const selected=conversations.find(c=>c.id===active)
 const partnerId=selected?(selected.person_a===profile.id?selected.person_b:selected.person_a):null
 const partner=members.find(m=>m.id===partnerId)
 const displayName=m=>m?.first_name||m?.brand_name||'Member'
 async function loadMembers() {
  const [clients,staff,admins]=await Promise.all([
   supabase.from('client_memberships').select('user_id').eq('client_id',clientId),
   supabase.from('staff_assignments').select('staff_id').eq('client_id',clientId),
   supabase.from('profiles').select('id').eq('role','admin')
  ])
  const ids=isStaff
   ?[clientId,...(clients.data||[]).map(m=>m.user_id)]
   :[...(staff.data||[]).map(m=>m.staff_id),...(admins.data||[]).map(m=>m.id)]
  const unique=[...new Set(ids.filter(id=>id&&id!==profile.id))]
  if(!unique.length){setMembers([]);return}
  const {data,error:e}=await supabase.from('profiles').select('id,first_name,brand_name,avatar_url,job_title,role').in('id',unique)
  if(e)setError(e.message)
  setMembers(data||[])
 }
 async function loadConversations() {
  const {data,error:e}=await supabase.from('direct_conversations').select('*').eq('client_id',clientId).order('updated_at',{ascending:false})
  if(e){setError(e.message);return}
  setConversations(data||[])
 }
 async function loadMessages(id) {
  if(!id)return
  const {data,error:e}=await supabase.from('direct_messages').select('*').eq('conversation_id',id).order('created_at')
  if(e)setError(e.message);else setMessages(data||[])
 }
 useEffect(()=>{setView('team');setActive(null);setMessages([]);setError('');loadMembers();loadConversations()},[clientId,profile.id])
 useEffect(()=>{
  if(!active)return
  setMessages([]);loadMessages(active)
  const channel=supabase.channel('dm-'+active)
   .on('postgres_changes',{event:'*',schema:'public',table:'direct_messages',filter:'conversation_id=eq.'+active},()=>loadMessages(active))
   .subscribe()
  const interval=setInterval(()=>loadMessages(active),12000)
  return()=>{clearInterval(interval);supabase.removeChannel(channel)}
 },[active])
 useEffect(()=>{bottomRef.current?.scrollIntoView({block:'end'})},[messages.length,active])
 useEffect(()=>{if(view==='direct')loadConversations()},[view])
 async function startConversation(member) {
  setError('')
  const a=[profile.id,member.id].sort()
  const existing=conversations.find(c=>c.person_a===a[0]&&c.person_b===a[1])
  if(existing){setActive(existing.id);return}
  setBusy(true)
  const {data,error:e}=await supabase.from('direct_conversations')
   .upsert({client_id:clientId,person_a:a[0],person_b:a[1]},{onConflict:'client_id,person_a,person_b'})
   .select().single()
  setBusy(false)
  if(e){setError(e.message);return}
  setConversations(prev=>[data,...prev.filter(c=>c.id!==data.id)]);setActive(data.id)
 }
 async function send() {
  if(!active||!draft.trim()||busy)return
  setBusy(true);setError('')
  const body=draft.trim()
  const {data,error:e}=await supabase.from('direct_messages').insert({conversation_id:active,sender_id:profile.id,body,parent_id:reply?.id||null}).select().single()
  setBusy(false)
  if(e){setError(e.message);return}
  setDraft('');setReply(null);setMessages(prev=>[...prev,data])
  loadConversations()
 }
 async function upload(file) {
  if(!active||!file||uploading)return
  if(file.size>10*1024*1024){setError('Maximum attachment size is 10 MB.');return}
  setUploading(true);setError('')
  const path=active+'/'+profile.id+'/'+crypto.randomUUID()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)
  const {error:e}=await supabase.storage.from('direct-attachments').upload(path,file,{contentType:file.type||'application/octet-stream'})
  if(e){setError(e.message);setUploading(false);return}
  const result=await supabase.from('direct_messages').insert({conversation_id:active,sender_id:profile.id,body:'Attachment: '+file.name,attachment_path:path,attachment_name:file.name,attachment_type:file.type}).select().single()
  if(result.error)setError(result.error.message)
  else setMessages(prev=>[...prev,result.data])
  setUploading(false)
  if(fileRef.current)fileRef.current.value=''
 }
 async function openFile(m) {
  const {data,error:e}=await supabase.storage.from('direct-attachments').createSignedUrl(m.attachment_path,300)
  if(e)setError(e.message);else window.open(data.signedUrl,'_blank','noopener,noreferrer')
 }
 async function saveEdit(m) {
  if(!editText.trim())return
  const {error:e}=await supabase.from('direct_messages').update({body:editText.trim(),edited_at:new Date().toISOString()}).eq('id',m.id)
  if(e)setError(e.message);else {setEditing(null);loadMessages(active)}
 }
 async function remove(m) {
  if(!window.confirm('Delete this message?'))return
  const {error:e}=await supabase.from('direct_messages').update({body:'Message deleted',deleted_at:new Date().toISOString()}).eq('id',m.id)
  if(e)setError(e.message);else loadMessages(active)
 }
 const other=c=>members.find(m=>m.id===(c.person_a===profile.id?c.person_b:c.person_a))
 return <div className="dm-shell">
  <aside className={'dm-sidebar'+(active&&view==='direct'?' dm-mobile-hidden':'')}>
   <header className="dm-sidebar-heading"><h2>Messages</h2></header>
   <button className={'dm-list-item'+(view==='team'?' selected':'')} onClick={()=>{setView('team');setActive(null)}}><span className="dm-avatar dm-group-icon">#</span><span><strong>Team Chat</strong><small>{title||'Company channel'}</small></span></button>
   <div className="dm-sidebar-label">DIRECT MESSAGES</div>
   {conversations.map(c=><button key={c.id} className={'dm-list-item'+(active===c.id&&view==='direct'?' selected':'')} onClick={()=>{setView('direct');setActive(c.id)}}><span className="dm-avatar">{other(c)?.avatar_url?<img src={other(c).avatar_url} alt=""/>:displayName(other(c)).slice(0,1)}</span><span><strong>{displayName(other(c))}</strong><small>Private conversation</small></span></button>)}
   <div className="dm-sidebar-label">START A CONVERSATION</div>
   {members.filter(m=>!conversations.some(c=>c.person_a===m.id||c.person_b===m.id)).map(m=><button key={m.id} className="dm-list-item" disabled={busy} onClick={()=>{setView('direct');startConversation(m)}}><span className="dm-avatar">{m.avatar_url?<img src={m.avatar_url} alt=""/>:displayName(m).slice(0,1)}</span><span><strong>{displayName(m)}</strong><small>Start private chat</small></span><span className="dm-add">＋</span></button>)}
   {!members.length&&<p className="dm-muted">No eligible people to message.</p>}
  </aside>
  <div className={'dm-content'+(view==='direct'&&!active?' dm-content-empty':'')}>
   {view==='team'?<Chat key={clientId} profile={profile} clientId={clientId} senderRole={senderRole} title={title}/>:!active?<div className="dm-placeholder">Select someone to start a private conversation.</div>:<>
    <header className="dm-header"><button className="dm-back" onClick={()=>setActive(null)} aria-label="Back to conversations">‹</button><span className="dm-avatar">{partner?.avatar_url?<img src={partner.avatar_url} alt=""/>:displayName(partner).slice(0,1)}</span><div><h2>{displayName(partner)}</h2><p>Private conversation · Only you and {displayName(partner)} can see these messages</p></div></header>
    <div className="dm-message-list">
     {messages.length===0&&<p className="dm-placeholder">This is the beginning of your private conversation.</p>}
     {messages.filter(m=>m.body.toLowerCase().includes(search.toLowerCase())).map(m=><article className={'dm-message'+(m.sender_id===profile.id?' mine':'')} key={m.id}>
      <div className="dm-message-meta"><strong>{m.sender_id===profile.id?(profile.first_name||'You'):displayName(partner)}</strong><time>{new Date(m.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time>{m.edited_at&&!m.deleted_at&&<small>edited</small>}</div>
      {m.parent_id&&<div className="dm-reply-reference">↳ {messages.find(x=>x.id===m.parent_id)?.body||'Earlier message'}</div>}
      {editing===m.id?<div className="dm-editor"><textarea value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setEditing(null);if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();saveEdit(m)}}}/><div><button onClick={()=>setEditing(null)}>Cancel</button><button onClick={()=>saveEdit(m)}>Save</button></div></div>:<div className={'dm-message-text'+(m.deleted_at?' deleted':'')}>{m.attachment_path&&!m.deleted_at?<button onClick={()=>openFile(m)}>📎 {m.attachment_name}</button>:m.body}</div>}
      {!m.deleted_at&&editing!==m.id&&<div className="dm-message-actions"><button onClick={()=>setReply(m)}>Reply</button>{m.sender_id===profile.id&&<><button onClick={()=>{setEditing(m.id);setEditText(m.body)}} disabled={!!m.attachment_path}>Edit</button><button onClick={()=>remove(m)}>Delete</button></>}</div>}
     </article>)}
     <div ref={bottomRef}/>
    </div>
    <div className="dm-compose">{error&&<p className="dm-error" role="alert">{error}</p>}{reply&&<div className="dm-reply-bar">Replying to: {reply.body.slice(0,100)} <button onClick={()=>setReply(null)}>×</button></div>}
     <div className="dm-compose-row"><input ref={fileRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.txt,.csv" onChange={e=>upload(e.target.files?.[0])}/><button className="dm-attach" disabled={uploading} onClick={()=>fileRef.current?.click()} title="Attach a file">{uploading?'…':'+'}</button><textarea value={draft} rows={1} placeholder={'Message '+displayName(partner)} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send()}}}/><button className="dm-send" disabled={!draft.trim()||busy} onClick={send}>Send</button></div>
    </div>
   </>}
   {view==='direct'&&error&&<p className="dm-error" role="alert">{error}</p>}
  </div>
 </div>
}
