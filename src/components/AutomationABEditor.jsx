import { useState } from 'react'
import { versionLabel } from '../lib/automationAB.js'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024

export default function AutomationABEditor({ slots, tests, onChange }) {
  const [error, setError] = useState('')
  const [openImage, setOpenImage] = useState(null)

  function patch(index, mutate) {
    onChange(previous => {
      const current = previous[index] || { enabled: false, variants: [], winner: null }
      return { ...previous, [index]: mutate(current) }
    })
  }

  function validate(file) {
    if (!file) return false
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for the email design.')
      return false
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Email design images must be smaller than 10 MB.')
      return false
    }
    setError('')
    return true
  }

  function addVersion(index, file) {
    if (!validate(file)) return
    const variant = { id: crypto.randomUUID(), url: '', file, preview: URL.createObjectURL(file) }
    patch(index, test => ({ ...test, variants: [...test.variants, variant] }))
  }

  function replaceVersion(index, id, file) {
    if (!validate(file)) return
    patch(index, test => ({
      ...test,
      variants: test.variants.map(v => {
        if (v.id !== id || test.winner === id) return v
        if (v.preview?.startsWith('blob:')) URL.revokeObjectURL(v.preview)
        return { ...v, file, preview: URL.createObjectURL(file) }
      })
    }))
  }

  function removeVersion(index, id) {
    patch(index, test => ({
      ...test,
      variants: test.variants.filter(v => {
        if (v.id !== id) return true
        if (test.winner === id) return true
        if (v.preview?.startsWith('blob:')) URL.revokeObjectURL(v.preview)
        return false
      })
    }))
  }

  function selectWinner(index, id) {
    if (!window.confirm('Set this version as the winner? This choice will be locked after saving.')) return
    patch(index, test => test.winner ? test : ({ ...test, winner: id }))
  }

  return <div className="ab-editor">
    {slots.map((slot, index) => {
      const test = tests[index]
      const original = slot.preview || slot.url
      const enabled = !!test?.enabled
      const variants = test?.variants || []
      const winning = test?.winner
      return <section className="ab-editor-email" key={index}>
        <div className="ab-editor-email-heading">
          <div><strong>Email {index + 1}</strong><span>{enabled ? 'A/B test enabled' : variants.length ? 'A/B test hidden · saved versions retained' : 'Single email design'}</span></div>
          <button type="button" className="btn-ghost small" onClick={() => {
            if (!original) { setError('Upload the original email image before enabling A/B testing.'); return }
            patch(index, current => ({ ...current, enabled: !current.enabled }))
          }}>{enabled ? 'Disable A/B Test' : variants.length ? 'Re-enable A/B Test' : 'Enable A/B Test'}</button>
        </div>
        {enabled && <>
          <p className="ab-editor-hint">Your existing image is Version A. Upload only the additional versions — nothing needs to be reuploaded.</p>
          <div className="ab-editor-versions">
            <div className="ab-editor-version">
              <div className="ab-editor-version-head"><strong>Version A</strong><span>Original</span></div>
              {original && <button type="button" className="ab-editor-image" onClick={() => setOpenImage(original)} title="View original email"><img src={original} alt={'Original Email ' + (index + 1)}/></button>}
              {winning === 'original'
                ? <span className="ab-winner">★ Winner</span>
                : !winning && <button type="button" className="btn-ghost small" onClick={() => selectWinner(index, 'original')}>Mark as winner</button>}
            </div>
            {variants.map((v, variantIndex) => <div className="ab-editor-version" key={v.id}>
              <div className="ab-editor-version-head"><strong>{versionLabel(variantIndex + 1)}</strong>{winning === v.id && <span className="ab-winner">★ Winner</span>}</div>
              {(v.preview || v.url) && <button type="button" className="ab-editor-image" title="View email design" onClick={() => setOpenImage(v.preview || v.url)}><img src={v.preview || v.url} alt={versionLabel(variantIndex + 1)}/></button>}
              <div className="ab-editor-actions">
                {winning !== v.id && <label className="btn-ghost small">Replace<input type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; replaceVersion(index, v.id, file) }}/></label>}
                {winning !== v.id && <button type="button" className="btn-ghost small" onClick={() => removeVersion(index, v.id)}>Remove</button>}
                {!winning && <button type="button" className="btn-ghost small" onClick={() => selectWinner(index, v.id)}>Mark winner</button>}
              </div>
            </div>)}
            <label className="ab-editor-add"><span>+ Add version</span><small>Upload a new email design</small><input type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; addVersion(index, file) }}/></label>
          </div>
          {winning && <p className="ab-editor-hint">The selected winner is locked. It appears as the main email preview while this A/B test is enabled.</p>}
        </>}
      </section>
    })}
    {error && <p className="error-text" role="alert">{error}</p>}
    {openImage && <div className="ab-preview-overlay" role="dialog" aria-modal="true" aria-label="Email design preview" onClick={() => setOpenImage(null)}>
      <button className="ab-preview-close" type="button" onClick={() => setOpenImage(null)} aria-label="Close preview">×</button>
      <img src={openImage} alt="Full-size email design" onClick={e => e.stopPropagation()}/>
    </div>}
  </div>
}
