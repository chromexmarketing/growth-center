import { useEffect, useState } from 'react'
import { getABTest, getFeaturedImage, versionLabel } from '../lib/automationAB.js'

// Shared by the client-facing automation list and the Chromex team preview.
export default function AutomationModal({ auto, onClose }) {
  const [activeTest, setActiveTest] = useState(null)
  const [zoomImage, setZoomImage] = useState(null)

  useEffect(() => { setActiveTest(null); setZoomImage(null) }, [auto?.id])
  useEffect(() => {
    if (!auto) return
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        if (zoomImage) setZoomImage(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [auto, zoomImage, onClose])

  if (!auto) return null
  const images = auto.image_urls || []
  const selectedTest = activeTest !== null ? getABTest(auto.ab_tests, activeTest) : null
  const original = activeTest !== null ? images[activeTest] : null
  const versions = selectedTest ? [
    { id: 'original', url: original, label: 'Version A' },
    ...selectedTest.variants.map((variant, i) => ({ ...variant, label: versionLabel(i + 1) }))
  ] : []

  return <div className="ab-modal-backdrop" onClick={onClose} role="presentation">
    <div className="ab-automation-modal" role="dialog" aria-modal="true" aria-label={auto.name} onClick={e => e.stopPropagation()}>
      <header className="ab-modal-heading">
        <div>
          <p className="ab-modal-eyebrow">{auto.status}</p>
          <h2>{auto.name}</h2>
          {auto.description && <p className="ab-modal-description">{auto.description}</p>}
        </div>
        <button type="button" className="ab-modal-x" onClick={onClose} aria-label="Close automation">×</button>
      </header>

      {images.some(Boolean) ? <div className="ab-modal-email-grid">
        {images.map((url, i) => {
          if (!url) return null
          const test = getABTest(auto.ab_tests, i)
          const featured = getFeaturedImage(images, auto.ab_tests, i)
          return <div className={'ab-modal-email' + (test ? ' is-ab' : '')} key={i}>
            <button type="button" className="ab-modal-email-preview" onClick={() => test ? setActiveTest(activeTest === i ? null : i) : setZoomImage(url)}
              aria-label={test ? 'Compare versions of Email ' + (i + 1) : 'View Email ' + (i + 1) + ' full-size'}>
              <img src={featured} alt={'Email ' + (i + 1) + ' preview'}/>
            </button>
            <div className="ab-modal-email-foot">
              <strong>Email {i + 1}</strong>
              {test && <span className="ab-test-pill">A/B Test</span>}
              {test?.winner && <span className="ab-winner">★ Winner</span>}
            </div>
            {test && <button type="button" className="ab-modal-compare-trigger" aria-expanded={activeTest === i}
              onClick={() => setActiveTest(activeTest === i ? null : i)}>
              {activeTest === i ? 'Hide versions' : 'View all ' + (test.variants.length + 1) + ' versions'}
            </button>}
          </div>
        })}
      </div> : <p className="ab-modal-empty">No email designs uploaded yet.</p>}

      {selectedTest && <section className="ab-modal-compare">
        <div className="ab-modal-compare-heading">
          <h3>Email {activeTest} — A/B Test</h3>
          <button type="button" className="btn-ghost small" onClick={() => setActiveTest(null)}>Close comparison</button>
        </div>
        <div className="ab-modal-compare-grid">
          {versions.map((v, index) => <article className="ab-modal-version" key={v.id}>
            <div className="ab-modal-version-top">
              <strong>{v.label}</strong>
              {selectedTest.winner === v.id && <span className="ab-winner">★ Winner</span>}
            </div>
            <button type="button" className="ab-modal-version-image" onClick={() => setZoomImage(v.url)} aria-label={'Open ' + v.label + ' full-size'}>
              <img src={v.url} alt={'Email ' + (activeTest + 1) + ' ' + v.label}/>
              <span>Click to enlarge</span>
            </button>
          </article>)}
        </div>
      </section>}
    </div>
    {zoomImage && <div className="ab-preview-overlay" role="dialog" aria-modal="true" aria-label="Full-size email preview" onClick={e => {e.stopPropagation();setZoomImage(null)}}>
      <button className="ab-preview-close" type="button" onClick={e => {e.stopPropagation();setZoomImage(null)}} aria-label="Close preview">×</button>
      <img src={zoomImage} alt="Full-size email design" onClick={e => e.stopPropagation()}/>
    </div>}
  </div>
}
