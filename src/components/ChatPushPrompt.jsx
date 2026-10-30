import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
const base64ToBytes = value => {
  const padded = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}
const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const supported = () => Boolean(PUBLIC_KEY && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && (!/iPhone|iPad|iPod/i.test(navigator.userAgent) || installed()))

export default function ChatPushPrompt({ userId }) {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    async function check() {
      if (!supported() || Notification.permission === 'denied') return
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription && Notification.permission === 'granted') {
          // Restore the subscription after a login or an app reinstall.
          await supabase.from('push_subscriptions').upsert({
            user_id: userId, endpoint: subscription.endpoint, subscription: subscription.toJSON()
          }, { onConflict: 'endpoint' })
          return
        }
        if (active) setVisible(true)
      } catch (e) { console.warn('Push unavailable:', e) }
    }
    check()
    return () => { active = false }
  }, [userId])

  async function enable() {
    setBusy(true); setError('')
    try {
      if (!supported()) throw new Error('Install Chromex to your Home Screen before enabling notifications.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications were not allowed. You can change this in your phone settings.')
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: base64ToBytes(PUBLIC_KEY)
      })
      const { error: failure } = await supabase.from('push_subscriptions').upsert({
        user_id: userId, endpoint: subscription.endpoint, subscription: subscription.toJSON()
      }, { onConflict: 'endpoint' })
      if (failure) throw failure
      setVisible(false)
    } catch (e) { setError(e.message || 'Unable to enable notifications. Please try again.') }
    finally { setBusy(false) }
  }
  if (!visible) return null
  return createPortal(<div className="chromex-push-overlay" role="presentation">
    <section className="chromex-push-modal" role="dialog" aria-modal="true" aria-labelledby="chromex-push-title">
      <div className="chromex-push-bell">🔔</div>
      <h2 id="chromex-push-title">Never miss a message</h2>
      <p>Get a notification on your phone when your Chromex team sends a chat message, even when the app is closed.</p>
      {error && <p role="alert" className="chromex-push-error">{error}</p>}
      <button type="button" className="btn" disabled={busy} onClick={enable}>{busy ? 'Enabling…' : 'Enable Notifications'}</button>
      <button type="button" className="chromex-push-later" disabled={busy} onClick={() => setVisible(false)}>Not now</button>
    </section>
  </div>, document.body)
}
