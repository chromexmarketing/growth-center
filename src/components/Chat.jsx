import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const ATTACHMENT_PREFIX = '__chromex_attachment_v1__:'
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
function parseAttachment(body) {
  if (!body?.startsWith(ATTACHMENT_PREFIX)) return null
  try {
    const value = JSON.parse(body.slice(ATTACHMENT_PREFIX.length))
    return typeof value.path === 'string' && typeof value.name === 'string' ? value : null
  } catch { return null }
}
function Attachment({ attachment }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    supabase.storage.from('chat-attachments').createSignedUrl(attachment.path, 3600)
      .then(({ data, error: failure }) => {
        if (!alive) return
        if (failure) setError('File unavailable')
        else setUrl(data.signedUrl)
      })
    return () => { alive = false }
  }, [attachment.path])
  const isImage = attachment.type?.startsWith('image/')
  const size = attachment.size ? attachment.size < 1048576 ? `${Math.round(attachment.size/1024)} KB` : `${(attachment.size/1048576).toFixed(1)} MB` : ''
  const extension = attachment.name.split('.').pop()?.toUpperCase() || 'FILE'
  const linkStyle = {color:'inherit',textDecoration:'none'}
  return <div className="workspace-chat-attachment" style={{maxWidth:420,width:'100%',minWidth:0}}>
    {url && isImage && <a href={url} target="_blank" rel="noopener noreferrer" style={{display:'block',width:'fit-content',maxWidth:'100%'}}>
      <img src={url} alt={attachment.name} style={{maxWidth:'100%',maxHeight:320,objectFit:'contain',borderRadius:12,display:'block',marginBottom:10}}/>
    </a>}
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',border:'1px solid rgba(160,160,175,.2)',borderRadius:12,background:'rgba(150,150,165,.075)',minWidth:0}}>
      <span aria-hidden="true" style={{width:38,height:38,borderRadius:10,display:'grid',placeItems:'center',background:'rgba(115,125,255,.16)',color:'#a4afff',flexShrink:0,fontSize:20}}>{isImage?'▧':'▤'}</span>
      <div style={{minWidth:0,flex:1}}>
        <div title={attachment.name} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:13,fontWeight:600,color:'inherit'}}>{attachment.name}</div>
        <div style={{fontSize:11,opacity:.55,marginTop:3}}>{[extension,size].filter(Boolean).join(' · ')}</div>
      </div>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" title="Open file" aria-label="Open file" style={{...linkStyle,flexShrink:0,fontSize:19,padding:5}}>↗</a>}
      {url && <a href={url} download={attachment.name} target="_blank" rel="noopener noreferrer" title="Download file" aria-label="Download file" style={{...linkStyle,flexShrink:0,fontSize:19,padding:5}}>↓</a>}
    </div>
    {error && <small style={{color:'#f88'}}>{error}</small>}
  </div>
}
function MessageContent({ message }) {
  const attachment = parseAttachment(message.body)
  return attachment ? <Attachment attachment={attachment}/> : <p className={message.deleted_at?'workspace-chat-deleted':''}>{message.body}</p>
}

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
  const mainFileRef = useRef(null)
  const threadFileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [attachMenu, setAttachMenu] = useState(null)

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

  // Read the same public-facing profile fields for every participant,
  // regardless of whether the viewer is an admin or a client.
  useEffect(() => {
    let active = true
    const ids = [...new Set([...messages.map(m => m.sender_id), ...members.map(m => m.user_id), profile.id, clientId].filter(Boolean))]
    if (!ids.length) return
    const loadPeople = async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id,first_name,brand_name,role,avatar_url,job_title,contact_email')
        .in('id', ids)
      if (!active) return
      if (error) {
        console.error('Unable to load chat member profiles:', error.message)
        return
      }
      setPeople(prev => ({
        ...prev,
        ...Object.fromEntries((data || []).map(p => [p.id, p]))
      }))
    }
    loadPeople()
    // Keep other participants' photos/names in sync after they edit My Profile.
    const onFocus = () => loadPeople()
    window.addEventListener('focus', onFocus)
    const refresh = window.setInterval(loadPeople, 30000)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      window.clearInterval(refresh)
    }
  }, [messages, members, profile.id, clientId])

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
  async function uploadAttachment(file, parentId = null) {
    if (!file || uploading) return
    if (file.size > MAX_ATTACHMENT_BYTES) { setSendingError('File must be 10 MB or smaller.'); return }
    setUploading(true)
    setSendingError('')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'attachment'
    const path = `${clientId}/${profile.id}/${crypto.randomUUID()}-${safeName}`
    try {
      const { error: storageError } = await supabase.storage.from('chat-attachments').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (storageError) throw storageError
      const body = ATTACHMENT_PREFIX + JSON.stringify({ path, name: file.name, type: file.type, size: file.size })
      const { data, error } = await supabase.from('messages').insert({
        client_id: clientId, sender_id: profile.id, sender_role: senderRole, body,
        ...(parentId ? { parent_id: parentId } : {})
      }).select().single()
      if (error) {
        await supabase.storage.from('chat-attachments').remove([path])
        throw error
      }
      setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data])
    } catch (error) {
      setSendingError(error.message || 'Unable to upload file.')
    } finally {
      setUploading(false)
    }
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
  const attachmentMenu = (target) => <div style={{position:'relative',display:'inline-flex'}}>
    <button type="button" title="Add attachment" aria-label="Add attachment" disabled={uploading} onClick={()=>setAttachMenu(attachMenu===target?null:target)} style={{width:34,height:34,borderRadius:10,border:'1px solid rgba(160,160,175,.2)',background:'rgba(160,160,175,.10)',color:'inherit',fontSize:23,lineHeight:1,cursor:'pointer',display:'grid',placeItems:'center'}}>{uploading?'…':'+'}</button>
    {attachMenu===target&&<div style={{position:'absolute',bottom:'calc(100% + 10px)',left:0,zIndex:30,width:235,padding:6,borderRadius:14,background:'#242429',border:'1px solid #424249',boxShadow:'0 12px 35px rgba(0,0,0,.45)'}}>
      {[
        ['▧','Image','JPG, PNG, GIF, WebP','image/*'],
        ['▤','Document','PDF, DOC, DOCX, TXT','.pdf,.doc,.docx,.txt'],
        ['⌁','Other file','ZIP, CSV and more','*/*']
      ].map(([symbol,name,detail,accept])=><button type="button" key={name} onClick={()=>{setAttachMenu(null);const ref=target==='thread'?threadFileRef:mainFileRef;if(ref.current){ref.current.accept=accept;ref.current.click()}}} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'10px',border:0,borderRadius:9,background:'transparent',color:'#f2f2f5',textAlign:'left',cursor:'pointer'}}>
        <span style={{fontSize:21,width:28,textAlign:'center'}}>{symbol}</span><span><span style={{display:'block',fontSize:13,fontWeight:600}}>{name}</span><span style={{display:'block',fontSize:11,color:'#a2a2ae',marginTop:2}}>{detail}</span></span>
      </button>)}
    </div>}
  </div>
  const shown=messages.filter(m=>!m.parent_id&&(m.body.toLowerCase().includes(search.toLowerCase()) || (parseAttachment(m.body)?.name||'').toLowerCase().includes(search.toLowerCase())))
  const avatar=(id,name)=>people[id]?.avatar_url?<img src={people[id].avatar_url} alt={name} className="workspace-chat-avatar-image"/>:name.slice(0,1).toUpperCase()
  const showPerson=id=>{setMembersOpen(false);setSelectedPerson(id)}
  const label=m=>people[m.sender_id]?.first_name || (m.sender_id===profile.id?profile.first_name:null) || (m.sender_role==='admin'?'Chromex team':'Client')
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
            {editing===m.id?<div className="workspace-chat-edit"><textarea className="input" value={editText} onChange={e=>setEditText(e.target.value)}/><button className="btn" onClick={()=>editMessage(m)}>Save</button><button onClick={()=>setEditing(null)}>Cancel</button></div>:<MessageContent message={m}/>}
            {!m.deleted_at&&<div className="workspace-chat-actions">
              <button onClick={()=>setThread(m)}>Reply in thread {messages.filter(x=>x.parent_id===m.id).length||''}</button>
              {['👍','❤️','😂','🎉'].map(emoji=><button key={emoji} title={'React '+emoji} onClick={()=>react(m,emoji)}>{emoji}</button>)}
              {m.sender_id===profile.id&&<>{!parseAttachment(m.body)&&<button onClick={()=>{setEditing(m.id);setEditText(m.body)}}>Edit</button>}<button onClick={()=>deleteMessage(m)}>Delete</button></>}
            </div>}
            <div className="workspace-chat-reactions">{['👍','❤️','😂','🎉'].map(emoji=>{const count=reactions.filter(r=>r.message_id===m.id&&r.emoji===emoji).length;return count?<button key={emoji} onClick={()=>react(m,emoji)}>{emoji} {count}</button>:null})}</div>
          </div>
        </div>
      })}
    </div>
    {thread&&<aside className="workspace-chat-thread">
      <div className="workspace-chat-dialog-head"><h2>Thread</h2><button onClick={()=>setThread(null)}>Close</button></div>
      <div className="workspace-chat-thread-list">
        {[messages.find(m=>m.id===thread.id)||thread,...messages.filter(m=>m.parent_id===thread.id)].map(m=><div className="workspace-chat-row" key={m.id}>
          <div className={'workspace-chat-avatar'+(m.sender_role==='admin'?' staff':'')}>{avatar(m.sender_id,label(m))}</div>
          <div className="workspace-chat-message">
            <div className="workspace-chat-author"><button className="workspace-chat-name-button" onClick={()=>showPerson(m.sender_id)}>{label(m)}</button><time>{new Date(m.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>
            {editing===m.id?<div className="workspace-chat-edit"><textarea className="input" value={editText} onChange={e=>setEditText(e.target.value)}/><button className="btn" onClick={()=>editMessage(m)}>Save</button><button onClick={()=>setEditing(null)}>Cancel</button></div>:<MessageContent message={m}/>}
            {!m.deleted_at&&<div className="workspace-chat-actions">
              {['👍','❤️','😂','🎉'].map(emoji=><button key={emoji} title={'React '+emoji} onClick={()=>react(m,emoji)}>{emoji}</button>)}
              {m.sender_id===profile.id&&<><button onClick={()=>{setEditing(m.id);setEditText(m.body)}}>Edit</button><button onClick={()=>deleteMessage(m)}>Delete</button></>}
            </div>}
            <div className="workspace-chat-reactions">{['👍','❤️','😂','🎉'].map(emoji=>{const count=reactions.filter(r=>r.message_id===m.id&&r.emoji===emoji).length;return count?<button key={emoji} onClick={()=>react(m,emoji)}>{emoji} {count}</button>:null})}</div>
          </div>
        </div>)}
      </div>
      <input ref={threadFileRef} type="file" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)uploadAttachment(file,thread.id)}}/>{attachmentMenu("thread")}<textarea className="input" placeholder="Reply in thread…" value={threadDraft} onChange={e=>setThreadDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendThread()}}}/>
      <button className="btn" onClick={sendThread} disabled={!threadDraft.trim()}>Reply</button>
    </aside>}
    <div className="workspace-chat-compose-wrap">
      {sendingError&&<p className="error-text">{sendingError}</p>}
      <div className="workspace-chat-compose">
        <textarea className="workspace-chat-textarea" aria-label="Write a message" rows="3" placeholder="Message your team…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/>
        <div className="workspace-chat-compose-bottom"><input ref={mainFileRef} type="file" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)uploadAttachment(file)}}/>{attachmentMenu("main")}<span>Enter to send · Shift + Enter for a new line</span><button className="btn" disabled={!draft.trim()} onClick={send}>Send ↗</button></div>
      </div>
    </div>
  </div>
}
