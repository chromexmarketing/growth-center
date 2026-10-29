import { useEffect, useState } from 'react'

export default function Mascot({ firstName, roadmapItems=[], onOpenRoadmap }) {
  const [bubble,setBubble] = useState(false)
  const [dismissedKey,setDismissedKey] = useState('')
  const awaiting=roadmapItems.filter(i=>i.status==='awaiting_client')
  const recent=roadmapItems.filter(i=>i.status==='completed' && i.completed_at && Date.now()-new Date(i.completed_at).getTime()<7*86400000).sort((a,b)=>new Date(b.completed_at)-new Date(a.completed_at))
  const key=awaiting.length ? 'await:'+awaiting.map(i=>i.id+':'+i.client_instruction).join(',') : recent.length ? 'done:'+recent[0].id+':'+recent[0].completed_at : ''
  const line=awaiting.length ? (awaiting[0].client_instruction || ('Your '+awaiting[0].title+' needs your attention.')) : recent.length ? (recent[0].title+' is complete!') : ''
  useEffect(()=>{
    if(!key || dismissedKey===key){setBubble(false);return}
    const storageKey='chromex-mascot-'+key
    if(sessionStorage.getItem(storageKey)){setBubble(false);return}
    setBubble(true)
    const t=setTimeout(()=>setBubble(false),9000)
    return ()=>clearTimeout(t)
  },[key,dismissedKey])
  function dismiss(){setBubble(false);setDismissedKey(key);if(key)sessionStorage.setItem('chromex-mascot-'+key,'1')}
  return <div className="mascot-corner">
    {bubble && <div className="mascot-bubble" role="status">
      <button type="button" className="mascot-dismiss" aria-label="Dismiss update" onClick={dismiss}>×</button>
      <b>Chromex</b> · {line}
      {onOpenRoadmap && <button type="button" className="mascot-roadmap-link" onClick={()=>{onOpenRoadmap();dismiss()}}>View roadmap →</button>}
    </div>}
    <img src="/mascot.svg" alt="Chromex mascot" onClick={()=>setBubble(b=>!b)} title="Roadmap updates" />
  </div>
}
