// Deploy with secrets SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, WEBHOOK_SECRET.
// Database webhook: public.messages INSERT -> this function.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const env = (key: string) => Deno.env.get(key) || ''
const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false }
})
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!env('WEBHOOK_SECRET') || request.headers.get('authorization') !== `Bearer ${env('WEBHOOK_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const payload = await request.json()
    const message = payload.record
    if (payload.type !== 'INSERT' || payload.table !== 'messages' || !message?.id || !message?.client_id) {
      return new Response('Ignored', { status: 200 })
    }
    // Re-fetch from the trusted database; never trust webhook payload for sender/recipient.
    const { data: stored, error: messageError } = await supabase.from('messages')
      .select('id,client_id,sender_id,sender_role,body,deleted_at')
      .eq('id', message.id).single()
    if (messageError || !stored || stored.deleted_at || stored.sender_role !== 'admin') {
      return new Response('Ignored', { status: 200 })
    }
    const { data: author } = await supabase.from('profiles').select('role').eq('id', stored.sender_id).maybeSingle()
    if (!author || !['admin', 'staff'].includes(author.role)) return new Response('Ignored', { status: 200 })
    if (author.role === 'staff') {
      const { data: assignment } = await supabase.from('staff_assignments').select('staff_id')
        .eq('staff_id', stored.sender_id).eq('client_id', stored.client_id).maybeSingle()
      if (!assignment) return new Response('Ignored', { status: 200 })
    }
    const { data: clients } = await supabase.from('profiles').select('id')
      .eq('id', stored.client_id).eq('role', 'client')
    const { data: members } = await supabase.from('client_memberships').select('user_id')
      .eq('client_id', stored.client_id)
    const ids = [...new Set([...(clients || []).map(x => x.id), ...(members || []).map(x => x.user_id)])]
      .filter(id => id !== stored.sender_id)
    if (!ids.length) return new Response('No recipients', { status: 200 })
    const { data: subscriptions, error: subError } = await supabase.from('push_subscriptions')
      .select('id,user_id,subscription').in('user_id', ids)
    if (subError) throw subError
    const { data: sender } = await supabase.from('profiles').select('first_name')
      .eq('id', stored.sender_id).maybeSingle()
    const name = sender?.first_name || 'Chromex team'
    const attachment = stored.body?.startsWith('__chromex_attachment_v1__:')
    const body = attachment ? 'Sent an attachment' : String(stored.body || 'New message').slice(0, 160)
    const notification = JSON.stringify({
      title: `Chromex · ${name}`, body, tag: `chat-${stored.id}`,
      url: '/?tab=chat', icon: '/chromex-icon-192.png?v=6'
    })
    const results = await Promise.allSettled((subscriptions || []).map(async item => {
      try { await webpush.sendNotification(item.subscription, notification) }
      catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', item.id)
        } else throw error
      }
    }))
    const failed = results.filter(result => result.status === 'rejected').length
    if (failed) console.error('Push deliveries failed:', failed)
    return new Response(JSON.stringify({ attempted: results.length, failed }), {
      status: failed ? 502 : 200, headers: { 'content-type': 'application/json' }
    })
  } catch (error) {
    console.error('Push webhook error', error)
    return new Response('Delivery error', { status: 500 })
  }
})
