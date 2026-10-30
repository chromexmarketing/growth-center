import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function detectEnvironment() {
  const ua = navigator.userAgent
  const iphone = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(ua)
  const browser = /CriOS/i.test(ua) ? 'chrome' : /FxiOS/i.test(ua) ? 'firefox' : /EdgiOS/i.test(ua) ? 'edge' : /Chrome|CriOS|EdgA/i.test(ua) ? 'chrome' : /Safari/i.test(ua) ? 'safari' : 'other'
  return { device: iphone ? 'ios' : android ? 'android' : 'desktop', browser }
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function InstallApp() {
  const [environment, setEnvironment] = useState(detectEnvironment)
  const [open, setOpen] = useState(false)
  const [installed, setInstalled] = useState(isInstalled)
  const [prompt, setPrompt] = useState(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const onPrompt = event => {
      event.preventDefault()
      setPrompt(event)
    }
    const onInstalled = () => { setInstalled(true); setOpen(false); setPrompt(null) }
    const onDisplay = () => setInstalled(isInstalled())
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    const display = window.matchMedia('(display-mode: standalone)')
    display.addEventListener?.('change', onDisplay)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      display.removeEventListener?.('change', onDisplay)
    }
  }, [])

  async function install() {
    if (!prompt) return
    const activePrompt = prompt
    setPrompt(null)
    try {
      await activePrompt.prompt()
      const choice = await activePrompt.userChoice
      if (choice?.outcome === 'accepted') setStatus('Installation started. Look for Chromex on your home screen.')
      else setStatus('You can install Chromex whenever you are ready.')
    } catch {
      setStatus('The installation prompt could not open. Please use your browser menu instead.')
    }
  }

  if (installed) return null
  const { device, browser } = environment
  const canPrompt = Boolean(prompt)
  const isIOS = device === 'ios'

  return <>
    <button className="nav-btn chromex-install-nav" onClick={() => { setOpen(true); setStatus('') }}>
      <span className="ico">↓</span> Install Chromex App
    </button>
    {open && createPortal(<div className="chromex-install-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="chromex-install-modal" role="dialog" aria-modal="true" aria-labelledby="chromex-install-title">
        <button className="chromex-install-close" aria-label="Close install guide" onClick={() => setOpen(false)}>×</button>
        <div className="chromex-install-mark"><img src="/logo.webp" alt="" /></div>
        <h2 id="chromex-install-title">Take Chromex with you.</h2>
        <p className="chromex-install-subtitle">Add your workspace to your home screen for quick, app-like access.</p>
        <div className="chromex-install-fields">
          <label>My device
            <select value={device} onChange={e => setEnvironment(old => ({ ...old, device: e.target.value }))}>
              <option value="ios">iPhone / iPad</option>
              <option value="android">Android</option>
              <option value="desktop">Computer</option>
            </select>
          </label>
          <label>My browser
            <select value={browser} onChange={e => setEnvironment(old => ({ ...old, browser: e.target.value }))}>
              <option value="safari">Safari</option>
              <option value="chrome">Chrome</option>
              <option value="edge">Edge</option>
              <option value="firefox">Firefox</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <p className="chromex-install-detected">We picked these based on your device. Change them if needed.</p>
        {canPrompt && !isIOS ? <div className="chromex-install-instructions">
          <p>You're ready to install.</p>
          <button className="chromex-install-primary" onClick={install}>Install Chromex App</button>
        </div> : isIOS ? <div className="chromex-install-instructions">
          <h3>Add Chromex to your Home Screen</h3>
          {browser === 'safari' ? <>
            <div className="chromex-install-step"><span>1</span><p>In <strong>Safari</strong>, tap the <strong>Share button</strong> <span className="chromex-install-share-symbol" aria-label="Share icon">↑</span> in the Safari toolbar (usually at the bottom on iPhone).</p></div>
            <div className="chromex-install-step"><span>2</span><p>Scroll down and select <strong>Add to Home Screen</strong>.</p></div>
            <div className="chromex-install-step"><span>3</span><p>Tap <strong>Add</strong> to finish.</p></div>
          </> : browser === 'chrome' ? <>
            <div className="chromex-install-step"><span>1</span><p>In <strong>Chrome</strong>, tap the <strong>Share button</strong> <span className="chromex-install-share-symbol" aria-label="Share icon">↑</span> beside the website address.</p></div>
            <div className="chromex-install-step"><span>2</span><p>Scroll through the Share menu and tap <strong>Add to Home Screen</strong>.</p></div>
            <div className="chromex-install-step"><span>3</span><p>Tap <strong>Add</strong> to finish.</p></div>
          </> : browser === 'edge' ? <>
            <div className="chromex-install-step"><span>1</span><p>In <strong>Edge</strong>, open the browser's <strong>Share</strong> options.</p></div>
            <div className="chromex-install-step"><span>2</span><p>Choose <strong>Add to Home Screen</strong> if available, then tap <strong>Add</strong>.</p></div>
            <p className="chromex-install-hint">If that option isn't shown, open Chromex in Safari instead.</p>
          </> : <>
            <div className="chromex-install-step"><span>1</span><p>Open Chromex in <strong>Safari</strong>.</p></div>
            <div className="chromex-install-step"><span>2</span><p>Tap <strong>Share</strong> <span className="chromex-install-share-symbol" aria-label="Share icon">↑</span>, select <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</p></div>
          </>}
        </div> : <div className="chromex-install-instructions">
          <h3>Install from your browser</h3>
          {device === 'android' ? <>
            <div className="chromex-install-step"><span>1</span><p>{browser === 'chrome' ? 'Open the Chrome menu (⋮).' : 'Open your browser menu.'}</p></div>
            <div className="chromex-install-step"><span>2</span><p>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm.</p></div>
            <p className="chromex-install-hint">For the easiest experience, use Chrome on Android.</p>
          </> : <>
            <div className="chromex-install-step"><span>1</span><p>Open this portal in <strong>Chrome or Edge</strong> on your computer.</p></div>
            <div className="chromex-install-step"><span>2</span><p>Look for the <strong>Install</strong> icon in the address bar or the installation option in the browser menu.</p></div>
            <div className="chromex-install-step"><span>3</span><p>Confirm to open Chromex in its own window.</p></div>
          </>}
        </div>}
        {status && <p className="chromex-install-status" role="status">{status}</p>}
        <button className="chromex-install-later" onClick={() => setOpen(false)}>Maybe later</button>
      </section>
    </div>, document.body)}
  </>
}
