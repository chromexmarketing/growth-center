// Compact, safe rich-text representation for chat. Message bodies stay plain
// strings in Supabase; formatted bodies use a versioned JSON envelope.
export const CHAT_RICH_PREFIX = '__chromex_richtext_v1__:'

const emptyMarks = () => ({ bold: false, italic: false, underline: false })
const sameMarks = (a, b) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline

function pushRun(runs, text, marks = emptyMarks()) {
  if (!text) return
  const normalized = String(text).replace(/\u200b/g, '').replace(/\r\n?/g, '\n')
  if (!normalized) return
  const run = { text: normalized, bold: !!marks.bold, italic: !!marks.italic, underline: !!marks.underline }
  const previous = runs[runs.length - 1]
  if (previous && sameMarks(previous, run)) previous.text += run.text
  else runs.push(run)
}

/** Extract actual styled content and explicit line breaks from a contentEditable. */
export function readComposerRuns(root) {
  if (!root) return []
  const runs = []
  const lastCharacter = () => runs.length ? runs[runs.length - 1].text.slice(-1) : ''

  function visit(node, inherited) {
    if (node.nodeType === 3) {
      pushRun(runs, node.nodeValue || '', inherited)
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.tagName.toLowerCase()
    if (tag === 'br') {
      pushRun(runs, '\n')
      return
    }
    if (tag === 'div' || tag === 'p') {
      // Browsers may create block wrappers when the user presses Enter.
      if (runs.length && lastCharacter() !== '\n') pushRun(runs, '\n')
    }
    const weight = node.style?.fontWeight || ''
    const decoration = node.style?.textDecorationLine || node.style?.textDecoration || ''
    const marks = {
      bold: inherited.bold || tag === 'b' || tag === 'strong' || weight === 'bold' || (/^[6-9]00$/.test(weight)),
      italic: inherited.italic || tag === 'i' || tag === 'em' || node.style?.fontStyle === 'italic',
      underline: inherited.underline || tag === 'u' || decoration.includes('underline')
    }
    for (const child of node.childNodes) visit(child, marks)
  }

  for (const child of root.childNodes) visit(child, emptyMarks())
  return runs
}

export function plainTextFromRuns(runs) {
  return runs.map(run => run.text).join('')
}

export function serializeChatMessage(runs) {
  const text = plainTextFromRuns(runs)
  if (!text.trim()) return ''
  if (!runs.some(run => (run.bold || run.italic || run.underline) && run.text.trim())) return text.trim()
  return CHAT_RICH_PREFIX + JSON.stringify({
    runs: runs.filter(run => run.text).map(run => ({
      text: run.text, bold: !!run.bold, italic: !!run.italic, underline: !!run.underline
    }))
  })
}

export function richRunsFromBody(body) {
  if (typeof body !== 'string' || !body.startsWith(CHAT_RICH_PREFIX)) return null
  try {
    const parsed = JSON.parse(body.slice(CHAT_RICH_PREFIX.length))
    if (!parsed || !Array.isArray(parsed.runs) || parsed.runs.length > 10000) return null
    if (!parsed.runs.every(run => run && typeof run.text === 'string')) return null
    const runs = []
    for (const run of parsed.runs) pushRun(runs, run.text, run)
    return runs
  } catch {
    return null
  }
}

export function plainMessageText(body) {
  const runs = richRunsFromBody(body)
  return runs ? plainTextFromRuns(runs) : String(body || '')
}

/** Compatibility for earlier messages stored using Markdown markers. */
export function legacyChatRuns(body) {
  const input = String(body || '')
  const runs = []
  const marks = emptyMarks()
  const markers = { '**': 'bold', '__': 'underline', '*': 'italic', '_': 'italic' }
  let i = 0
  while (i < input.length) {
    // Keep URLs intact: underscores or asterisks in a link are not formatting.
    const link = input.slice(i).match(/^(?:https?:\/\/|www\.)[^\s<>]+/i)
    if (link) {
      pushRun(runs, link[0], marks)
      i += link[0].length
      continue
    }
    let marker = null
    for (const candidate of ['**', '__', '*', '_']) {
      if (input.startsWith(candidate, i)) {
        marker = candidate
        break
      }
    }
    if (marker) {
      const property = markers[marker]
      // Only interpret an opening marker if it has a matching closing marker.
      if (marks[property] || input.indexOf(marker, i + marker.length) !== -1) {
        marks[property] = !marks[property]
        i += marker.length
        continue
      }
    }
    pushRun(runs, input[i], marks)
    i += 1
  }
  return runs
}
