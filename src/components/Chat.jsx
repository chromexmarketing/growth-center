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
  const [imageOpen,setImageOpen] = useState(false)
  const [savingImage,setSavingImage] = useState(false)
  const [saveError,setSaveError] = useState('')
  async function saveImage() {
    if (!url || savingImage) return
    setSavingImage(true); setSaveError('')
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl; anchor.download = attachment.name || 'photo.jpg'
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } catch { setSaveError('Unable to save automatically. Touch and hold the image to save it.') }
    finally { setSavingImage(false) }
  }
  useEffect(() => { if (!imageOpen) return; const close = e => { if (e.key === 'Escape') setImageOpen(false) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [imageOpen])
  const size = attachment.size ? attachment.size < 1048576 ? `${Math.round(attachment.size/1024)} KB` : `${(attachment.size/1048576).toFixed(1)} MB` : ''
  const extension = attachment.name.split('.').pop()?.toUpperCase() || 'FILE'
  const linkStyle = {color:'inherit',textDecoration:'none'}
  return <div className="workspace-chat-attachment" style={{maxWidth:320,width:'100%',minWidth:0}}>
    {url && isImage && <button type="button" aria-label="View photo" onClick={()=>setImageOpen(true)} style={{display:'block',width:'fit-content',maxWidth:'100%',padding:0,border:0,background:'transparent',cursor:'zoom-in'}}>
      <img src={url} alt="Chat photo" style={{maxWidth:'100%',maxHeight:240,objectFit:'contain',borderRadius:12,display:'block',marginBottom:10}}/>
    </button>}
    {imageOpen && url && <div role="dialog" aria-modal="true" aria-label="Photo preview" onClick={()=>setImageOpen(false)} style={{position:'fixed',inset:0,zIndex:10020,background:'rgba(0,0,0,.94)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{position:'absolute',top:'max(18px, env(safe-area-inset-top))',right:18,left:18,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:10,zIndex:1}}>
        <button type="button" onClick={e=>{e.stopPropagation();saveImage()}} disabled={savingImage} aria-label="Save photo" style={{color:'white',background:'rgba(255,255,255,.17)',border:0,borderRadius:24,padding:'10px 16px',fontSize:14,cursor:'pointer'}}>{savingImage?'Saving…':'↓ Save'}</button>
        <button type="button" aria-label="Close photo" onClick={()=>setImageOpen(false)} style={{color:'white',background:'rgba(255,255,255,.17)',border:0,borderRadius:30,width:42,height:42,fontSize:26,cursor:'pointer'}}>×</button>
      </div>
      <img src={url} alt="Full-size chat photo" onClick={e=>e.stopPropagation()} style={{maxWidth:'100%',maxHeight:'84dvh',objectFit:'contain',borderRadius:8}}/>
      {saveError&&<div role="status" style={{position:'absolute',bottom:32,left:18,right:18,textAlign:'center',color:'white',fontSize:13}}>{saveError}</div>}
    </div>}
    {!isImage && <div style={{display:'flex',alignItems:'center',gap:9,padding:'8px 10px',border:'1px solid rgba(160,160,175,.2)',borderRadius:12,background:'rgba(150,150,165,.075)',minWidth:0}}>
      <span aria-hidden="true" style={{width:38,height:38,borderRadius:10,display:'grid',placeItems:'center',background:'rgba(115,125,255,.16)',color:'#a4afff',flexShrink:0,fontSize:20}}>{isImage?'▧':'▤'}</span>
      <div style={{minWidth:0,flex:1}}>
        <div title={attachment.name} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11,fontWeight:500,color:'inherit',maxWidth:'100%'}}>{attachment.name}</div>
        <div style={{fontSize:11,opacity:.55,marginTop:3}}>{[extension,size].filter(Boolean).join(' · ')}</div>
      </div>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" title="Open file" aria-label="Open file" style={{...linkStyle,flexShrink:0,fontSize:19,padding:5}}>↗</a>}
      {url && <a href={url} download={attachment.name} target="_blank" rel="noopener noreferrer" title="Download file" aria-label="Download file" style={{...linkStyle,flexShrink:0,fontSize:19,padding:5}}>↓</a>}
    </div>}
    {error && <small style={{color:'#f88'}}>{error}</small>}
  </div>
}
function LinkifiedText({ text }) {
  const pieces = String(text || '').split(/(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi)
  return pieces.map((piece, index) => {
    if (!/^(https?:\/\/|www\.)/i.test(piece)) return piece
    const match = piece.match(/^(.*?)([.,!?;:)}\]]*)$/)
    const url = match?.[1] || piece
    const trailing = match?.[2] || ''
    const href = /^www\./i.test(url) ? 'https://' + url : url
    return <span key={index}><a href={href} target="_blank" rel="noopener noreferrer" className="workspace-chat-link">{url}</a>{trailing}</span>
  })
}
function MessageContent({ message }) {
  const attachment = parseAttachment(message.body)
  return attachment ? <Attachment attachment={attachment}/> : <p className={message.deleted_at?'workspace-chat-deleted':''}>{message.deleted_at ? message.body : <LinkifiedText text={message.body}/>}</p>
}

// Shared by both sides:
//  - client:  clientId = their own id, senderRole = 'client'
//  - admin:   clientId = selected client's id, senderRole = 'admin'
export default function Chat({ profile, clientId, senderRole, title }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [people, setPeople] = useState({})
  const [search, setSearch] = useState('')
  const [mobileActions, setMobileActions] = useState(null)
  const holdTimer = useRef(null)
  const composerRef = useRef(null)
  useEffect(() => { const el = composerRef.current; if (!el) return; el.style.height = '34px'; el.style.height = Math.min(el.scrollHeight, 112) + 'px' }, [draft])
  const cancelHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null }
  const startHold = (id) => { cancelHold(); holdTimer.current = setTimeout(() => { window.getSelection?.()?.removeAllRanges(); setMobileActions(id) }, 480) }
  const [membersOpen,setMembersOpen] = useState(false)
  const [selectedPerson,setSelectedPerson] = useState(null)
  const [members,setMembers] = useState([])
  const [sendingError,setSendingError] = useState('')
  const [replyTo,setReplyTo] = useState(null)
  const [editing,setEditing] = useState(null)
  const [editText,setEditText] = useState('')
  const [reactions,setReactions] = useState([])
  const reactionPending = useRef(new Set())
  const scrollRef = useRef(null)
  const mainFileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [attachMenu, setAttachMenu] = useState(null)
  const animatedMessageIds = useRef(new Set())
  const [pendingAttachment, setPendingAttachment] = useState(null)
  const [attachmentPreview, setAttachmentPreview] = useState('')
  useEffect(() => { if (!pendingAttachment?.type?.startsWith('image/')) { setAttachmentPreview(''); return }; const url = URL.createObjectURL(pendingAttachment); setAttachmentPreview(url); return () => URL.revokeObjectURL(url) }, [pendingAttachment])

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
        if(payload.eventType==='INSERT')setMessages(prev=>{if(prev.some(m=>m.id===payload.new.id))return prev;animatedMessageIds.current.add(payload.new.id);return [...prev,payload.new]} )
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
        .select('id,first_name,brand_name,brand_logo_url,role,avatar_url,job_title,contact_email')
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
    Promise.all([
      supabase.from('chat_members').select('user_id,member_role').eq('client_id',clientId),
      supabase.from('staff_assignments').select('staff_id').eq('client_id',clientId),
      supabase.from('profiles').select('id').eq('role','admin')
    ]).then(([clientMembers,staffMembers,owners])=>{
      const all=[...(clientMembers.data||[]),...(staffMembers.data||[]).map(m=>({user_id:m.staff_id,member_role:'staff'})),...(owners.data||[]).map(m=>({user_id:m.id,member_role:'staff'}))]
      setMembers([...new Map(all.map(m=>[m.user_id,m])).values()])
    })
  },[clientId])

  const shouldStickToBottom = useRef(true)
  const initialScrollDone = useRef(false)
  useEffect(() => {
    initialScrollDone.current = false
    shouldStickToBottom.current = true
  }, [clientId])
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    if (!initialScrollDone.current || shouldStickToBottom.current) {
      container.scrollTop = container.scrollHeight
      initialScrollDone.current = true
    }
  }, [messages])

  function jumpToLatestMessage() {
    shouldStickToBottom.current = true
    const container = scrollRef.current
    if (container) container.scrollTop = container.scrollHeight
  }

  async function send() {
    const body = draft.trim()
    if (!body) return
    jumpToLatestMessage()
    setDraft('')
    const replyId = replyTo?.id || null
    setReplyTo(null)
    const { data, error } = await supabase
      .from('messages')
      .insert({ client_id: clientId, sender_id: profile.id, sender_role: senderRole, body, ...(replyId ? { parent_id: replyId } : {}) })
      .select()
      .single()
    if (!error && data) {
      animatedMessageIds.current.add(data.id)
      setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data])
    }
    if (error) { setDraft(body);setReplyTo(messages.find(m=>m.id===replyId)||null);setSendingError(error.message) }
  }

  async function uploadAttachment(file) {
    if (!file || uploading) return
    jumpToLatestMessage()
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
        ...(replyTo?.id ? { parent_id: replyTo.id } : {})
      }).select().single()
      if (error) {
        await supabase.storage.from('chat-attachments').remove([path])
        throw error
      }
      setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data])
      setReplyTo(null)
      setPendingAttachment(null)
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
    const key = m.id + ':' + emoji
    if (reactionPending.current.has(key)) return
    reactionPending.current.add(key)
    try {
      const {data: existing,error: readError} = await supabase.from('message_reactions').select('message_id').eq('message_id',m.id).eq('user_id',profile.id).eq('emoji',emoji).maybeSingle()
      if (readError) throw readError
      if (existing) {
        const {error} = await supabase.from('message_reactions').delete().eq('message_id',m.id).eq('user_id',profile.id).eq('emoji',emoji)
        if (error) throw error
      } else {
        const {error} = await supabase.from('message_reactions').upsert({message_id:m.id,user_id:profile.id,emoji},{onConflict:'message_id,user_id,emoji',ignoreDuplicates:true})
        if (error) throw error
      }
      const {data,error} = await supabase.from('message_reactions').select('*')
      if (error) throw error
      setReactions(data || [])
      setSendingError('')
    } catch (error) { setSendingError(error.message || 'Could not update reaction') }
    finally { reactionPending.current.delete(key) }
  }
  const attachmentMenu = (target) => <div style={{position:'relative',display:'inline-flex'}}>
    <button type="button" title="Add attachment" aria-label="Add attachment" disabled={uploading} onClick={()=>setAttachMenu(attachMenu===target?null:target)} style={{width:34,height:34,borderRadius:10,border:'1px solid rgba(160,160,175,.2)',background:'rgba(160,160,175,.10)',color:'inherit',fontSize:23,lineHeight:1,cursor:'pointer',display:'grid',placeItems:'center'}}>{uploading?'…':'+'}</button>
    {attachMenu===target&&<div style={{position:'absolute',bottom:'calc(100% + 10px)',left:0,zIndex:30,width:235,maxWidth:'calc(100vw - 40px)',padding:6,borderRadius:14,background:'#242429',border:'1px solid #424249',boxShadow:'0 12px 35px rgba(0,0,0,.45)'}}>
      {[
        ['▧','Photo','JPG, PNG, GIF, WebP','image/*'],
        ['▤','Document','PDF, DOC, DOCX, TXT, CSV','.pdf,.doc,.docx,.txt,.csv']
      ].map(([symbol,name,detail,accept])=><button type="button" key={name} onClick={()=>{setAttachMenu(null);const ref=mainFileRef;if(ref.current){ref.current.accept=accept;ref.current.click()}}} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'10px',border:0,borderRadius:9,background:'transparent',color:'#f2f2f5',textAlign:'left',cursor:'pointer'}}>
        <span style={{fontSize:21,width:28,textAlign:'center'}}>{symbol}</span><span><span style={{display:'block',fontSize:13,fontWeight:600}}>{name}</span><span style={{display:'block',fontSize:11,color:'#a2a2ae',marginTop:2}}>{detail}</span></span>
      </button>)}
    </div>}
  </div>
  const shown=messages.filter(m=>(m.body.toLowerCase().includes(search.toLowerCase()) || (parseAttachment(m.body)?.name||'').toLowerCase().includes(search.toLowerCase())))
  const avatar=(id,name)=>people[id]?.avatar_url?<img src={people[id].avatar_url} alt={name} className="workspace-chat-avatar-image"/>:name.slice(0,1).toUpperCase()
  const brandBadge=(id,role)=> {
    const isStaff=role==='admin'||people[id]?.role==='admin'||people[id]?.role==='staff'||members.some(member=>member.user_id===id&&member.member_role==='staff')
    const url=isStaff?'/logo.webp':(people[clientId]?.brand_logo_url||null)
    return url?<img className="workspace-chat-brand-badge" src={url} alt={isStaff?'Chromex':'Client brand'} title={isStaff?'Chromex Marketing':people[clientId]?.brand_name||'Client brand'}/>:null
  }
  const showPerson=id=>{setMembersOpen(false);setSelectedPerson(id)}
  const label=m=>people[m.sender_id]?.first_name || (m.sender_id===profile.id?profile.first_name:null) || (m.sender_role==='admin'?'Chromex team':'Client')
  return <div className="workspace-chat">
    <header className="workspace-chat-head">
      <div className="workspace-chat-symbol">#</div>
      <button type="button" className="workspace-chat-heading workspace-chat-members-trigger" onClick={()=>setMembersOpen(true)}><h1>{title||'Chromex × Your Team'} ⌄</h1><p>Private company channel · Click to view members</p></button>
      <input className="input workspace-chat-search" aria-label="Search messages" placeholder="⌕ Search in conversation" value={search} onChange={e=>setSearch(e.target.value)}/>
    </header>
    {membersOpen&&<div className="workspace-chat-overlay" onClick={()=>setMembersOpen(false)}><section className="workspace-chat-dialog" onClick={e=>e.stopPropagation()}><div className="workspace-chat-dialog-head"><h2>Channel members</h2><button onClick={()=>setMembersOpen(false)}>Close</button></div>{[...new Set([profile.id,clientId,...members.map(m=>m.user_id),...messages.map(m=>m.sender_id)])].map(id=><div className="workspace-chat-member" key={id}><div className="workspace-chat-avatar">{avatar(id,people[id]?.first_name||'Member')}</div><button className="workspace-chat-name-button" onClick={()=>showPerson(id)}>{people[id]?.first_name||'Team member'}{id===profile.id?' (you)':''}</button>{brandBadge(id,people[id]?.role)}</div>)}</section></div>}
    {selectedPerson&&<div className="workspace-chat-overlay" onClick={()=>setSelectedPerson(null)}><section className="workspace-chat-dialog workspace-chat-person-card" onClick={e=>e.stopPropagation()}><div className="workspace-chat-dialog-head"><h2>Member profile</h2><button onClick={()=>setSelectedPerson(null)}>Close</button></div><div className="workspace-chat-person-large">{avatar(selectedPerson,people[selectedPerson]?.first_name||'Member')}</div><h2>{people[selectedPerson]?.first_name||'Team member'}</h2><p className="muted">{people[selectedPerson]?.job_title || people[selectedPerson]?.brand_name || (people[selectedPerson]?.role==='admin'?'Chromex Marketing':'Client team')}</p><div className="workspace-chat-person-field"><strong>Email</strong><span>{people[selectedPerson]?.contact_email || (selectedPerson===profile.id?profile.email:'') || 'Not shared'}</span></div></section></div>}
    <div className="workspace-chat-body" ref={scrollRef} onScroll={e=>{const el=e.currentTarget;shouldStickToBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<100}}>
      {!shown.length&&<div className="workspace-chat-empty">{search?'No messages match your search.':'This is the beginning of your conversation.'}</div>}
      {shown.map((m,i)=>{
        const name=label(m)
        const grouped=i>0&&shown[i-1].sender_id===m.sender_id&&new Date(m.created_at)-new Date(shown[i-1].created_at)<1200000
        return <div className={'workspace-chat-row'+(grouped?' compact':'')+(animatedMessageIds.current.has(m.id)?' chat-message-arrive':'')} key={m.id} onTouchStart={()=>{if(!m.deleted_at)startHold(m.id)}} onTouchEnd={cancelHold} onTouchMove={cancelHold} onTouchCancel={cancelHold} onContextMenu={e=>{if(window.matchMedia('(max-width:700px)').matches){e.preventDefault();if(!m.deleted_at)setMobileActions(m.id)}}}>
          {grouped?<div className="workspace-chat-time-short">{new Date(m.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>:<div className={'workspace-chat-avatar'+(m.sender_role==='admin'?' staff':'')}>{avatar(m.sender_id,name)}</div>}
          <div className="workspace-chat-message">
            {!grouped&&<div className="workspace-chat-author"><button className="workspace-chat-name-button" onClick={()=>showPerson(m.sender_id)}>{name}</button>{brandBadge(m.sender_id,m.sender_role)}<time>{new Date(m.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>}
            {m.parent_id&&<div className="workspace-chat-inline-quote" title="Replied-to message">
              <strong>{messages.find(x=>x.id===m.parent_id)?label(messages.find(x=>x.id===m.parent_id)):'Original message'}</strong>
              <span>{(()=>{const original=messages.find(x=>x.id===m.parent_id);return !original?'Message unavailable':original.deleted_at?'Message deleted':parseAttachment(original.body)?.name||original.body})()}</span>
            </div>}
            {editing===m.id?<div className="workspace-chat-edit"><textarea className="input" value={editText} onChange={e=>setEditText(e.target.value)}/><button className="btn" onClick={()=>editMessage(m)}>Save</button><button onClick={()=>setEditing(null)}>Cancel</button></div>:<MessageContent message={m}/>}
            {!m.deleted_at&&<div className={'workspace-chat-actions'+(mobileActions===m.id?' mobile-open':'')} onClick={()=>setMobileActions(null)}>
              <button onClick={()=>setReplyTo(m)}>Reply</button>
              {['👍','❤️','😂','🎉'].map(emoji=><button key={emoji} title={'React '+emoji} onClick={()=>react(m,emoji)}>{emoji}</button>)}
              {m.sender_id===profile.id&&<>{!parseAttachment(m.body)&&<button onClick={()=>{setEditing(m.id);setEditText(m.body)}}>Edit</button>}<button onClick={()=>deleteMessage(m)}>Delete</button></>}
            </div>}
            <div className="workspace-chat-reactions">{['👍','❤️','😂','🎉'].map(emoji=>{const count=reactions.filter(r=>r.message_id===m.id&&r.emoji===emoji).length;return count?<button key={emoji} onClick={()=>react(m,emoji)}>{emoji} {count}</button>:null})}</div>
          </div>
        </div>
      })}
    </div>
    {mobileActions&&<div className="workspace-chat-sheet-overlay" onContextMenu={e=>e.preventDefault()} onClick={()=>setMobileActions(null)}><div className="workspace-chat-sheet" role="dialog" aria-modal="true" aria-label="Message actions" onClick={e=>e.stopPropagation()}><div className="workspace-chat-sheet-handle"/><div className="workspace-chat-sheet-reactions">{['❤️','🔥','😂','💯','👍','🤍','🎉'].map(emoji=><button key={emoji} aria-label={'React '+emoji} onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m)react(m,emoji);setMobileActions(null)}}>{emoji}</button>)}</div><div className="workspace-chat-sheet-commands"><button onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m)setReplyTo(m);setMobileActions(null)}}>↩ <span>Reply</span></button><button onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m&&!parseAttachment(m.body))navigator.clipboard?.writeText(m.body);setMobileActions(null)}}>⧉ <span>Copy text</span></button>{messages.find(x=>x.id===mobileActions)?.sender_id===profile.id&&<><button onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m&&!parseAttachment(m.body)){setEditing(m.id);setEditText(m.body)}setMobileActions(null)}}>✎ <span>Edit</span></button><button onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m)deleteMessage(m);setMobileActions(null)}}>⌫ <span>Delete</span></button></>}</div><button className="workspace-chat-sheet-cancel" onClick={()=>setMobileActions(null)}>Cancel</button></div></div>}
    <div className="workspace-chat-compose-wrap">
      {sendingError&&<p className="error-text">{sendingError}</p>}
      {replyTo&&<div className="workspace-chat-reply-preview"><div><small>Replying to <strong>{label(replyTo)}</strong></small><p>{replyTo.deleted_at?'Message deleted':parseAttachment(replyTo.body)?.name||replyTo.body}</p></div><button type="button" onClick={()=>setReplyTo(null)} aria-label="Cancel reply" title="Cancel reply">×</button></div>}
      {pendingAttachment&&<div className="workspace-chat-pending-attachment"><div className="workspace-chat-pending-preview">{attachmentPreview?<img src={attachmentPreview} alt="Selected image preview"/>:<span>▤</span>}<div><strong>{pendingAttachment.name}</strong><small>{(pendingAttachment.size/1048576).toFixed(2)} MB · Not sent yet</small></div></div><button type="button" className="workspace-chat-pending-remove" onClick={()=>setPendingAttachment(null)} aria-label="Remove selected attachment">×</button></div>}
      <div className="workspace-chat-compose">
        <textarea ref={composerRef} className="workspace-chat-textarea" aria-label="Write a message" rows="1" placeholder="Message your team…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key!=='Enter'||e.nativeEvent.isComposing)return;const desktop=window.matchMedia('(min-width: 701px) and (pointer: fine)').matches;if(desktop&&!e.shiftKey){e.preventDefault();if(pendingAttachment){if(!uploading)uploadAttachment(pendingAttachment)}else if(draft.trim())send()}else if(!desktop&&(e.metaKey||e.ctrlKey)){e.preventDefault();if(pendingAttachment){if(!uploading)uploadAttachment(pendingAttachment)}else if(draft.trim())send()}}}/>
        <div className="workspace-chat-compose-bottom"><input ref={mainFileRef} type="file" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file){if(file.size>MAX_ATTACHMENT_BYTES){setSendingError("File must be 10 MB or smaller.");return}setSendingError("");setPendingAttachment(file)}}}/>{attachmentMenu("main")}<span>Enter to send · Shift + Enter for a new line</span><button className="btn" disabled={uploading||(!draft.trim()&&!pendingAttachment)} onClick={()=>{if(pendingAttachment)uploadAttachment(pendingAttachment);else send()}}>{uploading?"Sending…":"Send ↗"}</button></div>
      </div>
    </div>
  </div>
}
