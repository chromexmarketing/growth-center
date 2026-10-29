import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Shared by both sides:
//  - client:  clientId = their own id, senderRole = 'client'
//  - admin:   clientId = selected client's id, senderRole = 'admin'
export default function Chat({ profile, clientId, senderRole, title }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [people, setPeople] = useState({})
  const [search, setSearch] = useState('')
  const [membersOpen,setMembersOpen] = useState(false)
  const [selectedPerson,setSelectedPerson] = useState(null)
  const [members,setMembers] = useState([])
  const [sendingError,setSendingError] = useState('')
  const [thread,setThread] = useState(null)
  const [threadDraft,setThreadDraft] = useState('')
  const [editing,setEditing] = useState(null)
  const [editText,setEditText] = useState('')
  const [reactions,setReactions] = useState([])
  const scrollRef = useRef(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('messages')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at')
      .then(({ data }) => alive && setMessages(data ?? []))
    supabase.from('message_reactions').select('*').then(({data})=>{if(alive&&data)setReactions(data)})

    const channel = supabase
      .channel(`chat-${clientId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `client_id=eq.${clientId}`,
      }, payload => {
        if(payload.eventType==='INSERT')setMessages(prev=>prev.some(m=>m.id===payload.new.id)?prev:[...prev,payload.new])
        if(payload.eventType==='UPDATE')setMessages(prev=>prev.map(m=>m.id===payload.new.id?payload.new:m))
      })
      .subscribe()

    return () => { alive = false; supabase.removeChannel(channel) }
  }, [clientId])

  useEffect(() => {
    const ids = [...new Set([...messages.map(m => m.sender_id),...members.map(m=>m.user_id),profile.id,clientId])]
    if (ids.length) supabase.from('profiles').select('id,first_name,brand_name,role').in('id',ids)
      .then(({data}) => { if(data) setPeople(prev=>({...prev,...Object.fromEntries(data.map(p=>[p.id,p])),[profile.id]:{...prev[profile.id],...profile}})) })
  }, [messages,members,profile.id,clientId])

  useEffect(() => {
    supabase.from('chat_members').select('user_id').eq('client_id',clientId)
      .then(({data})=>setMembers(data||[]))
  },[clientId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send() {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    const { data, error } = await supabase
      .from('messages')
      .insert({ client_id: clientId, sender_id: profile.id, sender_role: senderRole, body })
      .select()
      .single()
    if (!error && data) {
      setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data])
    }
    if (error) { setDraft(body);setSendingError(error.message) }
  }

  async function sendThread(){
    if(!threadDraft.trim()||!thread)return
    const body=threadDraft.trim()
    const {data,error}=await supabase.from('messages').insert({client_id:clientId,sender_id:profile.id,sender_role:senderRole,body,parent_id:thread.id}).select().single()
    if(error)setSendingError(error.message)
    else {setMessages(prev=>[...prev,data]);setThreadDraft('')}
  }
  async function editMessage(m){
    if(!editText.trim())return
    const {data,error}=await supabase.from('messages').update({body:editText.trim(),edited_at:new Date().toISOString()}).eq('id',m.id).eq('sender_id',profile.id).select().single()
    if(error)setSendingError(error.message)
    else {setMessages(prev=>prev.map(x=>x.id===m.id?data:x));setEditing(null)}
  }
  async function deleteMessage(m){
    if(!window.confirm('Delete this message?'))return
    const {data,error}=await supabase.from('messages').update({body:'Message deleted',deleted_at:new Date().toISOString()}).eq('id',m.id).eq('sender_id',profile.id).select().single()
    if(error)setSendingError(error.message)
    else setMessages(prev=>prev.map(x=>x.id===m.id?data:x))
  }
  async function react(m,emoji){
    const existing=reactions.find(r=>r.message_id===m.id&&r.user_id===profile.id&&r.emoji===emoji)
    const query=supabase.from('message_reactions')
    const {error}=existing?await query.delete().eq('message_id',m.id).eq('user_id',profile.id).eq('emoji',emoji):await query.insert({message_id:m.id,user_id:profile.id,emoji})
    if(error){setSendingError(error.message);return}
    setReactions(prev=>existing?prev.filter(r=>r!==existing):[...prev,{message_id:m.id,user_id:profile.id,emoji}])
  }
  const shown=messages.filter(m=>!m.parent_id&&m.body.toLowerCase().includes(search.toLowerCase()))
  const avatar=(id,name)=>people[id]?.avatar_url?<img src={people[id].avatar_url} alt={name} className="workspace-chat-avatar-image"/>:name.slice(0,1).toUpperCase()
  const showPerson=id=>{setMembersOpen(false);setSelectedPerson(id)}
  const label=m=>(m.sender_id===profile.id?profile.first_name:null) || people[m.sender_id]?.first_name || (m.sender_role==='admin'?'Chromex team':'Client')
  return <div className="workspace-chat">
    <header className="workspace-chat-head">
      <div className="workspace-chat-symbol">#</div>
      <button type="button" className="workspace-chat-heading workspace-chat-members-trigger" onClick={()=>setMembersOpen(true)}><h1>{title||'Chromex × Your Team'} ⌄</h1><p>Private company channel · Click to view members</p></button>
      <input className="input workspace-chat-search" aria-label="Search messages" placeholder="⌕ Search in conversation" value={search} onChange={e=>setSearch(e.target.value)}/>
    </header>
    {membersOpen&&<div className="workspace-chat-overlay" onClick={()=>setMembersOpen(false)}><section className="workspace-chat-dialog" onClick={e=>e.stopPropagation()}><div className="workspace-chat-dialog-head"><h2>Channel members</h2><button onClick={()=>setMembersOpen(false)}>Close</button></div>{[...new Set([profile.id,clientId,...members.map(m=>m.user_id),...messages.map(m=>m.sender_id)])].map(id=><div className="workspace-chat-member" key={id}><div className="workspace-chat-avatar">{avatar(id,people[id]?.first_name||'Member')}</div><button className="workspace-chat-name-button" onClick={()=>showPerson(id)}>{people[id]?.first_name||'Team member'}{id===profile.id?' (you)':''}</button></div>)}</section></div>}
    {selectedPerson&&<div className="workspace-chat-overlay" onClick={()=>setSelectedPerson(null)}><section className="workspace-chat-dialog workspace-chat-person-card" onClick={e=>e.stopPropagation()}><div className="workspace-chat-dialog-head"><h2>Member profile</h2><button onClick={()=>setSelectedPerson(null)}>Close</button></div><div className="workspace-chat-person-large">{avatar(selectedPerson,people[selectedPerson]?.first_name||'Member')}</div><h2>{people[selectedPerson]?.first_name||'Team member'}</h2><p className="muted">{people[selectedPerson]?.job_title || people[selectedPerson]?.brand_name || (people[selectedPerson]?.role==='admin'?'Chromex Marketing':'Client team')}</p><div className="workspace-chat-person-field"><strong>Email</strong><span>{people[selectedPerson]?.contact_email || (selectedPerson===profile.id?profile.email:'') || 'Not shared'}</span></div></section></div>}
    <div className="workspace-chat-body" ref={scrollRef}>
      {!shown.length&&<div className="workspace-chat-empty">{search?'No messages match your search.':'This is the beginning of your conversation.'}</div>}
      {shown.map((m,i)=>{
        const name=label(m)
        const grouped=i>0&&shown[i-1].sender_id===m.sender_id&&new Date(m.created_at)-new Date(shown[i-1].created_at)<900000
        return <div className={'workspace-chat-row'+(grouped?' compact':'')} key={m.id}>
          {grouped?<div className="workspace-chat-time-short">{new Date(m.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>:<div className={'workspace-chat-avatar'+(m.sender_role==='admin'?' staff':'')}>{avatar(m.sender_id,name)}</div>}
          <div className="workspace-chat-message">
            {!grouped&&<div className="workspace-chat-author"><button className="workspace-chat-name-button" onClick={()=>showPerson(m.sender_id)}>{name}</button><time>{new Date(m.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>}
            {editing===m.id?<div className="workspace-chat-edit"><textarea className="input" value={editText} onChange={e=>setEditText(e.target.value)}/><button className="btn" onClick={()=>editMessage(m)}>Save</button><button onClick={()=>setEditing(null)}>Cancel</button></div>:<p className={m.deleted_at?'workspace-chat-deleted':''}>{m.body}</p>}
            {!m.deleted_at&&<div className="workspace-chat-actions">
              <button onClick={()=>setThread(m)}>Reply in thread {messages.filter(x=>x.parent_id===m.id).length||''}</button>
              {['👍','❤️','😂','🎉'].map(emoji=><button key={emoji} title={'React '+emoji} onClick={()=>react(m,emoji)}>{emoji}</button>)}
              {m.sender_id===profile.id&&<><button onClick={()=>{setEditing(m.id);setEditText(m.body)}}>Edit</button><button onClick={()=>deleteMessage(m)}>Delete</button></>}
            </div>}
            <div className="workspace-chat-reactions">{['👍','❤️','😂','🎉'].map(emoji=>{const count=reactions.filter(r=>r.message_id===m.id&&r.emoji===emoji).length;return count?<button key={emoji} onClick={()=>react(m,emoji)}>{emoji} {count}</button>:null})}</div>
          </div>
        </div>
      })}
    </div>
    {thread&&<aside className="workspace-chat-thread"><div className="workspace-chat-dialog-head"><h2>Thread</h2><button onClick={()=>setThread(null)}>Close</button></div><div className="workspace-chat-thread-list"><p><strong>{label(thread)}</strong>: {thread.body}</p>{messages.filter(m=>m.parent_id===thread.id).map(m=><p key={m.id}><strong>{label(m)}</strong>: {m.body}</p>)}</div><textarea className="input" placeholder="Reply in thread…" value={threadDraft} onChange={e=>setThreadDraft(e.target.value)} /><button className="btn" onClick={sendThread} disabled={!threadDraft.trim()}>Reply</button></aside>}
    <div className="workspace-chat-compose-wrap">
      {sendingError&&<p className="error-text">{sendingError}</p>}
      <div className="workspace-chat-compose">
        <textarea className="workspace-chat-textarea" aria-label="Write a message" rows="3" placeholder="Message your team…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/>
        <div className="workspace-chat-compose-bottom"><span>Enter to send · Shift + Enter for a new line</span><button className="btn" disabled={!draft.trim()} onClick={send}>Send ↗</button></div>
      </div>
    </div>
  </div>
}
