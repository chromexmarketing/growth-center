import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ClientNotifications({profile,clientId,tab,onUnread,onChat,onFinance}) {
  const [groups,setGroups]=useState([])
  const [invoices,setInvoices]=useState([])
  const [dismissed,setDismissed]=useState(false)
  useEffect(()=>{
    let alive=true, generation=0
    const count=async (table,field,id)=>{
      let cursor=''
      try {cursor=localStorage.getItem('chromex-read:'+profile.id+':'+clientId+':'+(table==='messages'?'team':id))||''} catch {}
      let q=supabase.from(table).select('id',{count:'exact',head:true}).eq(field,id).neq('sender_id',profile.id).is('deleted_at',null)
      if(cursor)q=q.gt('created_at',cursor)
      const result=await q
      if(result.error)throw result.error
      return result.count||0
    }
    async function refresh(){
      const run=++generation
      const bills=await supabase.from('finance_invoices').select('id,due_on').eq('client_id',clientId).eq('status','pending')
      if(alive&&run===generation&&!bills.error)setInvoices(bills.data||[])
      try {
        const direct=await supabase.from('direct_conversations').select('id,person_a,person_b').eq('client_id',clientId).or('person_a.eq.'+profile.id+',person_b.eq.'+profile.id)
        if(direct.error)throw direct.error
        const partners=[...new Set((direct.data||[]).map(c=>c.person_a===profile.id?c.person_b:c.person_a))]
        const names=partners.length?await supabase.from('profiles').select('id,first_name,brand_name').in('id',partners):{data:[]}
        const result=await Promise.all([
          count('messages','client_id',clientId).then(n=>({id:null,label:'Team chat',n})),
          ...(direct.data||[]).map(async c=>{const person=(names.data||[]).find(p=>p.id===(c.person_a===profile.id?c.person_b:c.person_a));return {id:c.id,label:person?.first_name||person?.brand_name||'Private chat',n:await count('direct_messages','conversation_id',c.id)}})
        ])
        if(alive&&run===generation){setGroups(result.filter(g=>g.n));onUnread(result.reduce((sum,g)=>sum+g.n,0))}
      } catch(error){console.warn('Unable to refresh unread messages',error)}
    }
    refresh()
    const timer=setInterval(refresh,15000)
    const channel=supabase.channel('client-notices-'+profile.id+'-'+clientId)
      .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:'client_id=eq.'+clientId},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'direct_messages'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'finance_invoices',filter:'client_id=eq.'+clientId},refresh)
      .subscribe()
    window.addEventListener('chromex-read-change',refresh)
    window.addEventListener('focus',refresh)
    return()=>{alive=false;clearInterval(timer);supabase.removeChannel(channel);window.removeEventListener('chromex-read-change',refresh);window.removeEventListener('focus',refresh)}
  },[profile.id,clientId,onUnread])
  const total=groups.reduce((sum,g)=>sum+g.n,0)
  const overdue=invoices.some(i=>i.due_on&&i.due_on<new Date().toLocaleDateString('en-CA'))
  return <>
    <style>{'.client-notices{position:fixed;right:20px;top:16px;z-index:40;width:min(340px,calc(100vw - 40px));display:grid;gap:8px;pointer-events:none}.client-notices>*{pointer-events:auto}.client-notice-popup{background:#fff;color:#242424;border:1px solid #e9e5e0;border-radius:14px;padding:14px;box-shadow:0 8px 30px #0002}.client-notice-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.client-notice-popup button,.client-invoice-banner{cursor:pointer;font:inherit}.client-notice-link{display:flex;width:100%;justify-content:space-between;margin-top:8px;padding:9px;border:0;border-radius:8px;background:#fff3e8;color:#9a460c;text-align:left}.client-invoice-banner{border:1px solid #efceaa;background:#fff6e9;color:#854b14;border-radius:10px;padding:8px 12px;display:flex;gap:8px;justify-content:space-between;align-items:center;font-size:13px;box-shadow:0 2px 8px #0001}.client-invoice-banner.overdue{background:#fff0ee;color:#9f3025;border-color:#f2b6af}@media(max-width:700px){.client-notices{top:calc(env(safe-area-inset-top,0px) + 8px);right:10px;width:calc(100vw - 20px)}.client-notices.chat-open{top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 75px)}}'}</style>
    <div className={'client-notices'+(tab==='chat'?' chat-open':'')}>
      {invoices.length>0&&tab!=='finance'&&<button className={'client-invoice-banner'+(overdue?' overdue':'')} onClick={onFinance}><span>{overdue?'Overdue':'Pending'} invoice{invoices.length===1?'':'s'}{invoices.length>1?' ('+invoices.length+')':''}</span><strong>View invoice →</strong></button>}
      {!dismissed&&total>0&&tab!=='chat'&&<section className="client-notice-popup" aria-label="Unread messages"><div className="client-notice-head"><strong>You have {total} unread message{total===1?'':'s'}</strong><button aria-label="Dismiss unread notification" onClick={()=>setDismissed(true)} style={{border:0,background:'transparent',fontSize:20}}>×</button></div>{groups.map(g=><button key={g.id||'team'} className="client-notice-link" onClick={()=>onChat(g.id)}><span>{g.label}</span><strong>{g.n} →</strong></button>)}</section>}
    </div>
  </>
}
