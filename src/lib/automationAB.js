// A/B design metadata is indexed by the existing automation email position.
// Version A always comes from automations.image_urls; extra variants live here.
export function normalizeABTests(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\\d+$/.test(key) || !value || typeof value !== 'object') continue
    out[key] = {
      enabled: !!value.enabled,
      variants: (Array.isArray(value.variants) ? value.variants : [])
        .filter(v => v && typeof v.id === 'string')
        .map(v => ({ ...v, url: typeof v.url === 'string' ? v.url : '' })),
      winner: typeof value.winner === 'string' ? value.winner : null,
    }
  }
  return out
}
export function versionLabel(index) {
  let n = index + 1
  let label = ''
  while (n > 0) {
    n -= 1
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26)
  }
  return 'Version ' + label
}
export function getABTest(tests, index) {
  const t = tests && tests[String(index)]
  return t && t.enabled && Array.isArray(t.variants) && t.variants.length > 0 ? t : null
}
export function getFeaturedImage(imageUrls, abTests, index) {
  const original = imageUrls?.[index] || ''
  const test = getABTest(abTests, index)
  if (!test || !test.winner || test.winner === 'original') return original
  return test.variants.find(v => v.id === test.winner)?.url || original
}
export function shiftABTestsAfterEmailRemoval(tests, removedIndex) {
  const out = {}
  for (const [key, value] of Object.entries(tests || {})) {
    const index = Number(key)
    if (!Number.isInteger(index) || index === removedIndex) continue
    out[index > removedIndex ? index - 1 : index] = value
  }
  return out
}
