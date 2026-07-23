import { useEffect, useState } from 'react'

// Corner mascot: pops in with a welcome bubble, bobs in place,
// and can be clicked to bring the bubble back with a fresh line.
const LINES = [
  name => `Hey ${name}! Welcome back 👋`,
  name => `Good to see you, ${name}!`,
  name => `${name}! Your inbox empire awaits.`,
  () => `Fresh numbers are in. Take a look!`,
  () => `Need anything? The chat tab goes straight to the team.`,
]

export default function Mascot({ firstName }) {
  const [bubble, setBubble] = useState(true)
  const [lineIdx, setLineIdx] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setBubble(false), 7000)
    return () => clearTimeout(t)
  }, [lineIdx])

  function poke() {
    setLineIdx(i => (i + 1) % LINES.length)
    setBubble(true)
  }

  return (
    <div className="mascot-corner">
      {bubble && (
        <div className="mascot-bubble">
          <b>Chromex</b> · {LINES[lineIdx](firstName || 'there')}
        </div>
      )}
      <img src="/mascot.svg" alt="Chromex mascot" onClick={poke} title="Say hi" />
    </div>
  )
}
