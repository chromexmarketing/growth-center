import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Shared by both sides:
//  - client:  clientId = their own id, senderRole = 'client'
//  - admin:   clientId = selected client's id, senderRole = 'admin'
export default function Chat({ profile, clientId, senderRole, title }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
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
    if (error) setDraft(body) // restore on failure
  }

  return (
    <div>
      <p className="eyebrow">Direct line</p>
      <h1 className="page-title">{title ?? 'Chat with the team'}</h1>
      <p className="page-sub">Questions, feedback, requests — we're here.</p>

      <div className="card chat-box">
        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty" style={{ border: 'none' }}>No messages yet. Say hey! 👋</div>
          )}
          {messages.map(m => {
            const mine = m.sender_role === senderRole
            return (
              <div key={m.id} className={`msg ${mine ? 'mine' : 'theirs'}`}>
                {m.body}
                <span className="msg-meta">
                  {m.sender_role === 'admin' ? 'Chromex' : 'You'}{mine && m.sender_role === 'client' ? '' : ''} · {new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            )
          })}
        </div>
        <div className="chat-input-row">
          <input
            className="input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Type a message…"
          />
          <button className="btn" onClick={send}>Send</button>
        </div>
      </div>
    </div>
  )
}
