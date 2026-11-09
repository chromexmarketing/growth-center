import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { readComposerRuns, plainTextFromRuns, serializeChatMessage, richRunsFromBody, plainMessageText, legacyChatRuns } from '../lib/chatRichText.js'

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
function FormattedMessage({ text, onMentionClick, allowedMentions, meId }) {
  const runs = richRunsFromBody(text) || legacyChatRuns(text)
  return runs.map((run, index) => {
    const isMention = !!run.mentionId && run.text.startsWith('@')
    const canOpen = isMention && allowedMentions.has(run.mentionId)
    let content = isMention
      ? canOpen
        ? <button type="button" className={'workspace-chat-mention' + (run.mentionId === meId ? ' is-me' : '')}
            title="View member profile" onClick={()=>onMentionClick(run.mentionId)}>{run.text}</button>
        : <span className="workspace-chat-mention">{run.text}</span>
      : <LinkifiedText text={run.text}/>
    if (run.underline) content = <u>{content}</u>
    if (run.italic) content = <em>{content}</em>
    if (run.bold) content = <strong>{content}</strong>
    return <span key={index}>{content}</span>
  })
}
function MessageContent({ message, onMentionClick, allowedMentions, meId }) {
  const attachment = parseAttachment(message.body)
  return attachment ? <Attachment attachment={attachment}/> : <p className={message.deleted_at?'workspace-chat-deleted':''}>{message.deleted_at ? message.body : <FormattedMessage text={message.body} onMentionClick={onMentionClick} allowedMentions={allowedMentions} meId={meId}/>}</p>
}

// Shared by both sides:
//  - client:  clientId = their own id, senderRole = 'client'
//  - admin:   clientId = selected client's id, senderRole = 'admin'
export default function Chat({ profile, clientId, senderRole, title }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [composerFocused, setComposerFocused] = useState(false)
  useEffect(() => {
    if (!composerFocused) {
      document.documentElement.style.removeProperty('--chromex-keyboard-inset')
      return
    }
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      document.documentElement.style.setProperty('--chromex-keyboard-inset', inset + 'px')
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--chromex-keyboard-inset')
    }
  }, [composerFocused])

  const [people, setPeople] = useState({})
  const [search, setSearch] = useState('')
  const [mobileActions, setMobileActions] = useState(null)
  const holdTimer = useRef(null)
  const composerRef = useRef(null)
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionActive, setMentionActive] = useState(0)
  const mentionRangeRef = useRef(null)

  function closeMentions() {
    setMentionQuery(null)
    setMentionActive(0)
    mentionRangeRef.current = null
  }

  function findMentionAtCaret() {
    const root = composerRef.current
    const selection = window.getSelection()
    if (!root || !selection || !selection.rangeCount || !selection.isCollapsed) return null
    const caret = selection.getRangeAt(0)
    const node = caret.startContainer
    if (node.nodeType !== 3 || !root.contains(node)) return null
    if (node.parentElement?.closest('[data-mention-id]')) return null
    const prefix = node.textContent.slice(0, caret.startOffset)
    const match = prefix.match(/(^|[\\s([{])@([^@\\n]{0,48})$/)
    if (!match) return null
    const range = document.createRange()
    const startOffset = caret.startOffset - match[0].length + match[1].length
    range.setStart(node, startOffset)
    range.setEnd(node, caret.startOffset)
    return { range, query: match[2].replace(/\\u200b/g, '').trimStart() }
  }

  function updateMentionSuggestions() {
    const found = findMentionAtCaret()
    if (!found) { closeMentions(); return }
    mentionRangeRef.current = found.range
    setMentionQuery(found.query)
    setMentionActive(0)
  }

  const insertComposerLineBreak = () => {
    const selection = window.getSelection()
    if (!selection?.rangeCount || !composerRef.current?.contains(selection.anchorNode)) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const br = document.createElement('br')
    const next = document.createTextNode('\u200b')
    const fragment = document.createDocumentFragment()
    fragment.appendChild(br)
    fragment.appendChild(next)
    range.insertNode(fragment)
    range.setStart(next, 1)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    setDraft(plainTextFromRuns(readComposerRuns(composerRef.current)))
  }
  const applyFormatting = (command) => {
    const el = composerRef.current
    if (!el) return
    el.focus()
    document.execCommand(command, false, null)
    setDraft(plainTextFromRuns(readComposerRuns(composerRef.current)))
  }
  function insertMemberMention(person) {
    const editor = composerRef.current
    const existing = mentionRangeRef.current
    if (!editor || !existing || !editor.contains(existing.commonAncestorContainer)) return
    const range = existing.cloneRange()
    range.deleteContents()
    const token = document.createElement('span')
    token.className = 'workspace-chat-mention-token'
    token.setAttribute('data-mention-id', person.id)
    token.setAttribute('contenteditable', 'false')
    token.textContent = '@' + person.name
    const trailing = document.createTextNode(' ')
    const fragment = document.createDocumentFragment()
    fragment.append(token, trailing)
    range.insertNode(fragment)
    editor.focus()
    const caret = document.createRange()
    caret.setStart(trailing, 1)
    caret.collapse(true)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(caret)
    setDraft(plainTextFromRuns(readComposerRuns(editor)))
    closeMentions()
  }
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
    const runs = readComposerRuns(composerRef.current)
    const body = serializeChatMessage(runs)
    const plain = plainTextFromRuns(runs)
    if (!body || !plain.trim()) return
    jumpToLatestMessage()
    closeMentions()
    setDraft('')
    if (composerRef.current) composerRef.current.innerHTML = ''
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
    if (error) {
      if (composerRef.current) composerRef.current.textContent = plain
      setDraft(plain)
      setReplyTo(messages.find(m=>m.id===replyId)||null)
      setSendingError(error.message)
    }
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
  const mentionMemberIds = new Set([profile.id, clientId, ...members.map(m=>m.user_id)].filter(Boolean))
  const mentionCandidates = [...mentionMemberIds].map(id => {
    const person = people[id]
    const name = person?.first_name || (id === profile.id ? profile.first_name : '') || ''
    return { id, name, avatar: person?.avatar_url || (id === profile.id ? profile.avatar_url : ''), role: person?.job_title || person?.brand_name || (person?.role === 'staff' ? 'Chromex team' : 'Member') }
  }).filter(person=>person.name)
  const mentionMatches = mentionQuery === null ? [] : mentionCandidates
    .filter(person => person.name.toLocaleLowerCase().includes(mentionQuery.toLocaleLowerCase().trim()))
    .slice(0, 7)
  const shown=messages.filter(m=>(plainMessageText(m.body).toLowerCase().includes(search.toLowerCase()) || (parseAttachment(m.body)?.name||'').toLowerCase().includes(search.toLowerCase())))
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
              <span>{(()=>{const original=messages.find(x=>x.id===m.parent_id);return !original?'Message unavailable':original.deleted_at?'Message deleted':parseAttachment(original.body)?.name||plainMessageText(original.body)})()}</span>
            </div>}
            {editing===m.id?<div className="workspace-chat-edit"><textarea className="input" value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){setEditing(null)}else if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();editMessage(m)}}} autoFocus aria-label="Edit message" rows={3}/><button className="btn" onClick={()=>editMessage(m)}>Save</button><button type="button" onClick={()=>setEditing(null)}>Cancel</button></div>:<div className="workspace-chat-message-content"><MessageContent message={m} onMentionClick={showPerson} allowedMentions={mentionMemberIds} meId={profile.id}/>{!m.deleted_at&&m.sender_id===profile.id&&!parseAttachment(m.body)&&<button type="button" className="workspace-chat-desktop-edit" aria-label="Edit your message" title="Edit message" onClick={()=>{setEditing(m.id);setEditText(plainMessageText(m.body));setSendingError('')}}><span aria-hidden="true">✎</span> Edit</button>}</div>}
            {!m.deleted_at&&<div className={'workspace-chat-actions'+(mobileActions===m.id?' mobile-open':'')} onClick={()=>setMobileActions(null)}>
              <button onClick={()=>setReplyTo(m)}>Reply</button>
              {['👍','❤️','😂','🎉'].map(emoji=><button key={emoji} title={'React '+emoji} onClick={()=>react(m,emoji)}>{emoji}</button>)}
              {m.sender_id===profile.id&&<>{!parseAttachment(m.body)&&<button onClick={()=>{setEditing(m.id);setEditText(plainMessageText(m.body))}}>Edit</button>}<button onClick={()=>deleteMessage(m)}>Delete</button></>}
            </div>}
            <div className="workspace-chat-reactions">{['👍','❤️','😂','🎉'].map(emoji=>{const count=reactions.filter(r=>r.message_id===m.id&&r.emoji===emoji).length;return count?<button key={emoji} onClick={()=>react(m,emoji)}>{emoji} {count}</button>:null})}</div>
          </div>
        </div>
      })}
    </div>
    {mobileActions&&<div className="workspace-chat-sheet-overlay" onContextMenu={e=>e.preventDefault()} onClick={()=>setMobileActions(null)}><div className="workspace-chat-sheet" role="dialog" aria-modal="true" aria-label="Message actions" onClick={e=>e.stopPropagation()}><div className="workspace-chat-sheet-handle"/><div className="workspace-chat-sheet-reactions">{['❤️','🔥','😂','💯','👍','🤍','🎉'].map(emoji=><button key={emoji} aria-label={'React '+emoji} onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m)react(m,emoji);setMobileActions(null)}}>{emoji}</button>)}</div><div className="workspace-chat-sheet-commands"><button onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m)setReplyTo(m);setMobileActions(null)}}>↩ <span>Reply</span></button><button onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m&&!parseAttachment(m.body))navigator.clipboard?.writeText(plainMessageText(m.body));setMobileActions(null)}}>⧉ <span>Copy text</span></button>{messages.find(x=>x.id===mobileActions)?.sender_id===profile.id&&<><button onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m&&!parseAttachment(m.body)){setEditing(m.id);setEditText(plainMessageText(m.body))}setMobileActions(null)}}>✎ <span>Edit</span></button><button onClick={()=>{const m=messages.find(x=>x.id===mobileActions);if(m)deleteMessage(m);setMobileActions(null)}}>⌫ <span>Delete</span></button></>}</div><button className="workspace-chat-sheet-cancel" onClick={()=>setMobileActions(null)}>Cancel</button></div></div>}
    <div className={`workspace-chat-compose-wrap ${composerFocused ? "chat-composer-active" : ""} ${draft.trim() ? "chat-composer-has-text" : ""}`}>
      {sendingError&&<p className="error-text">{sendingError}</p>}
      {replyTo&&<div className="workspace-chat-reply-preview"><div><small>Replying to <strong>{label(replyTo)}</strong></small><p>{replyTo.deleted_at?'Message deleted':parseAttachment(replyTo.body)?.name||plainMessageText(replyTo.body)}</p></div><button type="button" onClick={()=>setReplyTo(null)} aria-label="Cancel reply" title="Cancel reply">×</button></div>}
      {pendingAttachment&&<div className="workspace-chat-pending-attachment"><div className="workspace-chat-pending-preview">{attachmentPreview?<img src={attachmentPreview} alt="Selected image preview"/>:<span>▤</span>}<div><strong>{pendingAttachment.name}</strong><small>{(pendingAttachment.size/1048576).toFixed(2)} MB · Not sent yet</small></div></div><button type="button" className="workspace-chat-pending-remove" onClick={()=>setPendingAttachment(null)} aria-label="Remove selected attachment">×</button></div>}
      <div className="workspace-chat-compose">
        {mentionMatches.length > 0 && <div className="workspace-chat-mention-picker" role="listbox" aria-label="Mention a channel member">
          <div className="workspace-chat-mention-picker-label">Mention someone</div>
          {mentionMatches.map((person, i)=><button type="button" role="option" aria-selected={i===mentionActive} key={person.id}
            className={'workspace-chat-mention-option'+(i===mentionActive?' active':'')}
            onMouseDown={e=>e.preventDefault()} onClick={()=>insertMemberMention(person)}>
            <span className="workspace-chat-mention-avatar">{person.avatar?<img src={person.avatar} alt=""/>:person.name[0].toUpperCase()}</span>
            <span className="workspace-chat-mention-person"><strong>{person.name}</strong><small>{person.id===profile.id?'You':person.role}</small></span>
          </button>)}
        </div>}
        <div ref={composerRef} contentEditable suppressContentEditableWarning className="workspace-chat-textarea workspace-chat-rich-editor" role="textbox" aria-multiline="true" aria-label="Write a message" aria-autocomplete="list" aria-expanded={mentionMatches.length > 0} data-placeholder="Message your team…" onFocus={()=>setComposerFocused(true)} onBlur={e=>{if(!e.currentTarget.parentElement?.parentElement?.contains(e.relatedTarget))setComposerFocused(false)}} onInput={()=>{setDraft(plainTextFromRuns(readComposerRuns(composerRef.current)));updateMentionSuggestions()}} onClick={updateMentionSuggestions} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))updateMentionSuggestions()}} onKeyDown={e=>{if(mentionMatches.length&&!e.nativeEvent.isComposing){if(e.key==='ArrowDown'){e.preventDefault();setMentionActive(v=>(v+1)%mentionMatches.length);return}if(e.key==='ArrowUp'){e.preventDefault();setMentionActive(v=>(v-1+mentionMatches.length)%mentionMatches.length);return}if(e.key==='Escape'){e.preventDefault();closeMentions();return}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();insertMemberMention(mentionMatches[Math.min(mentionActive,mentionMatches.length-1)]);return}}if(e.key!=='Enter'||e.nativeEvent.isComposing)return;if(e.shiftKey){e.preventDefault();insertComposerLineBreak();closeMentions();return}const desktop=window.matchMedia('(min-width: 701px) and (pointer: fine)').matches;if(desktop&&!e.shiftKey){e.preventDefault();if(pendingAttachment){if(!uploading)uploadAttachment(pendingAttachment)}else if(draft.trim())send()}else if(!desktop&&(e.metaKey||e.ctrlKey)){e.preventDefault();if(pendingAttachment){if(!uploading)uploadAttachment(pendingAttachment)}else if(draft.trim())send()}}}></div>
      <div className="workspace-chat-format-toolbar" role="toolbar" aria-label="Message formatting">
        <button type="button" title="Bold (select text)" aria-label="Bold" onMouseDown={e=>e.preventDefault()} onClick={()=>applyFormatting('bold')}><strong>B</strong></button>
        <button type="button" title="Italic (select text)" aria-label="Italic" onMouseDown={e=>e.preventDefault()} onClick={()=>applyFormatting('italic')}><em>I</em></button>
        <button type="button" title="Underline (select text)" aria-label="Underline" onMouseDown={e=>e.preventDefault()} onClick={()=>applyFormatting('underline')}><u>U</u></button>
      </div>
        <div className="workspace-chat-compose-bottom"><input ref={mainFileRef} type="file" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file){if(file.size>MAX_ATTACHMENT_BYTES){setSendingError("File must be 10 MB or smaller.");return}setSendingError("");setPendingAttachment(file)}}}/>{attachmentMenu("main")}<span>Enter to send · Shift + Enter for a new line</span><button className="btn" disabled={uploading||(!draft.trim()&&!pendingAttachment)} onClick={()=>{if(pendingAttachment)uploadAttachment(pendingAttachment);else send()}}>{uploading?"Sending…":"Send ↗"}</button></div>
      </div>
    </div>
  </div>
}
