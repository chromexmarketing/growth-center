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
  const scrollRef = useRef(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('messages')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at')
      .then(({ data }) => alive && setMessages(data ?? []))

    const channel = supabase
      .channel(`chat-${clientId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `client_id=eq.${clientId}`,
      }, payload => {
        setMessages(prev =>
          prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]
        )
      })
      .subscribe()

    return () => { alive = false; supabase.removeChannel(channel) }
  }, [clientId])

  useEffect(() => {
    const ids = [...new Set([...messages.map(m => m.sender_id),...members.map(m=>m.user_id),profile.id,clientId])]
    if (ids.length) supabase.from('profiles').select('id,first_name,avatar_url,role').in('id',ids)
      .then(({data}) => { if(data) setPeople(Object.fromEntries(data.map(p=>[p.id,p]))) })
  }, [messages,members])

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

  const shown=messages.filter(m=>m.body.toLowerCase().includes(search.toLowerCase()))
  const avatar=(id,name)=>people[id]?.avatar_url?<img src={people[id].avatar_url} alt={name} className="workspace-chat-avatar-image"/>:name.slice(0,1).toUpperCase()
  const showPerson=id=>{setMembersOpen(false);setSelectedPerson(id)}
  const label=m=>m.sender_id===profile.id?'You':people[m.sender_id]?.first_name || (m.sender_role==='admin'?'Chromex team':'Client')
  return <div className="workspace-chat">
    <header className="workspace-chat-head">
      <div className="workspace-chat-symbol">#</div>
      <button type="button" className="workspace-chat-heading workspace-chat-members-trigger" onClick={()=>setMembersOpen(true)}><h1>{title||'Chromex × Your Team'} ⌄</h1><p>Private company channel · Click to view members</p></button>
      <input className="input workspace-chat-search" aria-label="Search messages" placeholder="⌕ Search in conversation" value={search} onChange={e=>setSearch(e.target.value)}/>
    </header>
    {membersOpen&&<div className="workspace-chat-overlay" onClick={()=>setMembersOpen(false)}><section className="workspace-chat-dialog" onClick={e=>e.stopPropagation()}><div className="workspace-chat-dialog-head"><h2>Channel members</h2><button onClick={()=>setMembersOpen(false)}>Close</button></div>{[...new Set([profile.id,clientId,...members.map(m=>m.user_id),...messages.map(m=>m.sender_id)])].map(id=><div className="workspace-chat-member" key={id}><div className="workspace-chat-avatar">{avatar(id,people[id]?.first_name||'Member')}</div><button className="workspace-chat-name-button" onClick={()=>showPerson(id)}>{people[id]?.first_name||'Team member'}{id===profile.id?' (you)':''}</button></div>)}</section></div>}
    {selectedPerson&&<div className="workspace-chat-overlay" onClick={()=>setSelectedPerson(null)}><section className="workspace-chat-dialog workspace-chat-person-card" onClick={e=>e.stopPropagation()}><div className="workspace-chat-dialog-head"><h2>Member profile</h2><button onClick={()=>setSelectedPerson(null)}>Close</button></div><div className="workspace-chat-person-large">{avatar(selectedPerson,people[selectedPerson]?.first_name||'Member')}</div><h2>{people[selectedPerson]?.first_name||'Team member'}</h2><p className="muted">{people[selectedPerson]?.role==='admin'?'Chromex Admin':'Client representative'}</p><div className="workspace-chat-person-field"><strong>Email</strong><span>{selectedPerson===profile.id&&profile.email?profile.email:'Not available yet'}</span></div></section></div>}
    <div className="workspace-chat-body" ref={scrollRef}>
      {!shown.length&&<div className="workspace-chat-empty">{search?'No messages match your search.':'This is the beginning of your conversation.'}</div>}
      {shown.map((m,i)=>{
        const name=label(m)
        const grouped=i>0&&shown[i-1].sender_id===m.sender_id&&new Date(m.created_at)-new Date(shown[i-1].created_at)<300000
        return <div className={'workspace-chat-row'+(grouped?' compact':'')} key={m.id}>
          {grouped?<div className="workspace-chat-time-short">{new Date(m.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>:<div className={'workspace-chat-avatar'+(m.sender_role==='admin'?' staff':'')}>{avatar(m.sender_id,name)}</div>}
          <div className="workspace-chat-message">
            {!grouped&&<div className="workspace-chat-author"><button className="workspace-chat-name-button" onClick={()=>showPerson(m.sender_id)}>{name}</button><time>{new Date(m.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>}
            <p>{m.body}</p>
          </div>
        </div>
      })}
    </div>
    <div className="workspace-chat-compose-wrap">
      {sendingError&&<p className="error-text">{sendingError}</p>}
      <div className="workspace-chat-compose">
        <textarea className="workspace-chat-textarea" aria-label="Write a message" rows="3" placeholder="Message your team…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/>
        <div className="workspace-chat-compose-bottom"><span>Enter to send · Shift + Enter for a new line</span><button className="btn" disabled={!draft.trim()} onClick={send}>Send ↗</button></div>
      </div>
    </div>
  </div>
}
