import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ClientNotifications({clientId,onFinance}) {
  const [invoices,setInvoices]=useState([])
  useEffect(()=>{
    let alive=true, generation=0
    async function refresh(){
      const run=++generation
      const {data,error}=await supabase.from('finance_invoices').select('id,due_on').eq('client_id',clientId).eq('status','pending')
      if(alive&&run===generation&&!error)setInvoices(data||[])
    }
    refresh()
    const timer=setInterval(refresh,15000)
    const channel=supabase.channel('invoice-reminder-'+clientId)
      .on('postgres_changes',{event:'*',schema:'public',table:'finance_invoices',filter:'client_id=eq.'+clientId},refresh)
      .subscribe()
    window.addEventListener('focus',refresh)
    return()=>{alive=false;clearInterval(timer);supabase.removeChannel(channel);window.removeEventListener('focus',refresh)}
  },[clientId])
  if(!invoices.length)return null
  const now=new Date()
  const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')
  const overdue=invoices.some(i=>i.due_on&&i.due_on<today)
  return <>
    <style>{'.client-invoice-reminder{position:fixed;top:16px;right:20px;z-index:40;max-width:calc(100vw - 40px);display:flex;align-items:center;gap:12px;padding:9px 14px;border:1px solid #efceaa;border-radius:10px;background:#fff6e9;color:#854b14;box-shadow:0 2px 8px #0001;font:inherit;font-size:12px;cursor:pointer;text-align:left}.client-invoice-reminder.overdue{background:#fff0ee;color:#9f3025;border-color:#f2b6af}.client-invoice-reminder strong{white-space:nowrap}.client-invoice-reminder:focus-visible{outline:2px solid currentColor;outline-offset:3px}@media(max-width:700px){.client-invoice-reminder{top:calc(env(safe-area-inset-top,0px) + 8px);right:10px;max-width:calc(100vw - 20px);padding:7px 10px;gap:8px}}'}</style>
    <button type="button" className={'client-invoice-reminder'+(overdue?' overdue':'')} onClick={onFinance}><span>{invoices.length===1?'You have an unpaid invoice':'You have '+invoices.length+' unpaid invoices'}{overdue?' · Overdue':''}</span><strong>View invoice →</strong></button>
  </>
}
