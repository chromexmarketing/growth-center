import { useEffect, useState } from 'react'
import { fetchRevenue, supabase } from '../lib/supabase'

const dateText = date => new Date(date + 'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
const dollars = value => '$' + Number(value || 0).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2})
const iso = (y,m,d) => new Date(Date.UTC(y,m,d)).toISOString().slice(0,10)
function periodFor(date,day,offset=0) {
  const y=date.getFullYear(), m=date.getMonth(), anchor=Math.min(day,new Date(y,m+1,0).getDate())
  const completed=date.getDate()>=anchor ? m : m-1
  const endMonth=completed+offset
  const end= new Date(y,endMonth+1,0)
  const start=new Date(y,endMonth,0)
  return {start:iso(y,endMonth-1,Math.min(day,start.getUTCDate())),end:iso(y,endMonth,Math.min(day,end.getDate()))}
}
export default function Finance({clientId,owner=false,platform='klaviyo'}) {
  const [day,setDay]=useState(17),[invoices,setInvoices]=useState([]),[recaps,setRecaps]=useState([]),[offset,setOffset]=useState(0)
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[uploading,setUploading]=useState(false)
  const [amount,setAmount]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[issued,setIssued]=useState(new Date().toISOString().slice(0,10)),[due,setDue]=useState(''),[pdf,setPdf]=useState(null)
  const [store,setStore]=useState(''),[attributed,setAttributed]=useState(''),[saving,setSaving]=useState(false)
  const [notice,setNotice]=useState(false)
  const [liveRecap,setLiveRecap]=useState(null),[liveBusy,setLiveBusy]=useState(false),[liveError,setLiveError]=useState('')
  const period=periodFor(new Date(),day,offset)
  const recap=recaps.find(r=>r.period_start===period.start&&r.period_end===period.end)
  const pending=invoices.filter(i=>i.status==='pending')
  const shownRecap=recap||liveRecap
  async function load() {
    if(!clientId)return
    setBusy(true);setError('')
    const [settings,bills,summaries]=await Promise.all([
      supabase.from('finance_settings').select('billing_day').eq('client_id',clientId).maybeSingle(),
      supabase.from('finance_invoices').select('*').eq('client_id',clientId).order('issued_on',{ascending:false}),
      supabase.from('finance_recaps').select('*').eq('client_id',clientId).order('period_end',{ascending:false})
    ])
    const err=settings.error||bills.error||summaries.error
    if(err)setError(err.message)
    if(settings.data)setDay(settings.data.billing_day)
    setInvoices(bills.data||[]);setRecaps(summaries.data||[]);setBusy(false)
  }
  useEffect(()=>{load()},[clientId])
  useEffect(()=>{setStore(recap?.store_revenue?.toString()||'');setAttributed(recap?.attributed_revenue?.toString()||'')},[recap?.id,period.start])
  useEffect(()=>{
    let active=true
    setLiveRecap(null);setLiveError('')
    if(!clientId||busy||recap)return()=>{active=false}
    setLiveBusy(true)
    // Reuse the same authorized integration and revenue calculation as the Dashboard.
    // Do not write client-visible figures to Finance until the owner saves a recap.
    const end=new Date(period.end+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-1)
    fetchRevenue(period.start,end.toISOString().slice(0,10),clientId)
      .then(data=>{if(active){if(Number.isFinite(Number(data?.totalRevenue))&&Number.isFinite(Number(data?.emailRevenue))&&data?.totalRevenue!=null&&data?.emailRevenue!=null)setLiveRecap({store_revenue:data.totalRevenue,attributed_revenue:data.emailRevenue});else setLiveError('Revenue figures are not available from the connected platform.')}})
      .catch(e=>{if(active)setLiveError(e.message)})
      .finally(()=>{if(active)setLiveBusy(false)})
    return()=>{active=false}
  },[clientId,busy,recap?.id,period.start,period.end])
  useEffect(()=>{if(!owner&&pending.length){const key='chromex-finance-notice-'+clientId+'-'+pending.map(i=>i.id).join('-');if(sessionStorage.getItem(key)!=='seen'){setNotice(true);sessionStorage.setItem(key,'seen')}}},[owner,clientId,invoices.length])
  useEffect(()=>{if(owner){setStart(period.start);setEnd(period.end)}},[owner,day,offset])
  async function saveDay(event) {
    const next=Number(event.target.value)
    if(next<1||next>28)return
    const {error:e}=await supabase.from('finance_settings').upsert({client_id:clientId,billing_day:next},{onConflict:'client_id'})
    if(e)setError(e.message);else setDay(next)
  }
  async function saveRecap() {
    setSaving(true);setError('')
    const {error:e}=await supabase.from('finance_recaps').upsert({client_id:clientId,period_start:period.start,period_end:period.end,store_revenue:Number(store),attributed_revenue:Number(attributed)},{onConflict:'client_id,period_start'})
    if(e)setError(e.message);else await load()
    setSaving(false)
  }
  async function upload(event) {
    event.preventDefault()
    if(!pdf||pdf.type!=='application/pdf'){setError('Please select a PDF invoice.');return}
    setUploading(true);setError('')
    const key=clientId+'/'+crypto.randomUUID()+'.pdf'
    const uploaded=await supabase.storage.from('finance-invoices').upload(key,pdf,{contentType:'application/pdf'})
    if(uploaded.error){setError(uploaded.error.message);setUploading(false);return}
    const {error:e}=await supabase.from('finance_invoices').insert({client_id:clientId,storage_path:key,amount:Number(amount),period_start:start,period_end:end,issued_on:issued,due_on:due||null,status:'pending',filename:pdf.name})
    if(e){await supabase.storage.from('finance-invoices').remove([key]);setError(e.message)}
    else {setPdf(null);setAmount('');await load()}
    setUploading(false)
  }
  async function openPdf(invoice) {
    const {data,error:e}=await supabase.storage.from('finance-invoices').createSignedUrl(invoice.storage_path,120)
    if(e)setError(e.message);else window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }
  async function setStatus(invoice,status) {
    const {error:e}=await supabase.from('finance_invoices').update({status}).eq('id',invoice.id)
    if(e)setError(e.message);else await load()
  }
  return <section className="finance-page">
    <header className="finance-heading"><img className="finance-logo-image" src="/chromex-finance.svg" alt="Chromex Finance logo" /><div><h1>Chromex Finance</h1><p>Billing &amp; performance</p></div></header>
    {error&&<p className="finance-error" role="alert">{error}</p>}
    {notice&&<div className="finance-notice" role="alert"><strong>You have {pending.length} pending invoice{pending.length!==1?'s':''}.</strong><span>Review your latest bill below.</span><button onClick={()=>setNotice(false)} aria-label="Dismiss notification">×</button></div>}
    <div className="finance-section">
      <div className="finance-section-top"><div><p className="finance-kicker">PERFORMANCE</p><h2>Your latest billable period</h2></div>{owner&&<label className="finance-billing-day">Billing day <select value={day} onChange={saveDay}>{Array.from({length:28},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label>}</div>
      <div className="finance-period-nav"><button onClick={()=>setOffset(x=>x-1)} aria-label="Previous billing period">‹</button><span>{dateText(period.start)} – {dateText(period.end)}</span><button onClick={()=>setOffset(x=>Math.min(0,x+1))} disabled={offset===0} aria-label="Next billing period">›</button></div>
      {busy||(!shownRecap&&liveBusy)?<p className="finance-muted">Loading billing-period revenue…</p>:shownRecap?<p className="finance-recap"><mark>{dateText(period.start)} – {dateText(period.end)}</mark> generated <strong>{dollars(shownRecap.store_revenue)}</strong> in store revenue, with <strong>{dollars(shownRecap.attributed_revenue)}</strong> attributed to {platform==='klaviyo'?'Klaviyo':'Omnisend'} Email &amp; SMS.</p>:<p className="finance-empty">{liveError?'Revenue is unavailable: '+liveError:'No revenue recap available for this billing period.'}</p>}
      {owner&&<div className="finance-owner-edit"><h3>Update period revenue</h3><div className="finance-fields"><label>Store revenue ($)<input type="number" min="0" step="0.01" value={store} onChange={e=>setStore(e.target.value)}/></label><label>Email &amp; SMS attributed ($)<input type="number" min="0" step="0.01" value={attributed} onChange={e=>setAttributed(e.target.value)}/></label></div><button className="finance-primary" disabled={saving||store===''||attributed===''} onClick={saveRecap}>{saving?'Saving…':'Save recap'}</button></div>}
    </div>
    <div className="finance-section"><div className="finance-section-top"><div><p className="finance-kicker">BILLING</p><h2>Invoices</h2></div>{pending.length>0&&<span className="finance-pending-count">{pending.length} pending</span>}</div>
      {busy?<p className="finance-muted">Loading invoices…</p>:invoices.length===0?<p className="finance-empty">No invoices yet.</p>:<div className="finance-invoice-list">{invoices.map(invoice=><article className="finance-invoice" key={invoice.id}><div className="finance-invoice-main"><div><strong>{dateText(invoice.period_start)} – {dateText(invoice.period_end)}</strong><small>Issued {dateText(invoice.issued_on)}{invoice.due_on?' · Due '+dateText(invoice.due_on):''}</small></div><div className="finance-invoice-side"><strong>{dollars(invoice.amount)}</strong><span className={'finance-status '+invoice.status}>{invoice.status==='paid'?'Paid':'Pending'}</span></div></div><div className="finance-invoice-actions"><button onClick={()=>openPdf(invoice)}>↗ View invoice PDF</button><a className="finance-pay-now" href="https://chromexmarketing.com/bank-details" target="_blank" rel="noopener noreferrer">Pay now ↗</a>{owner&&<button onClick={()=>setStatus(invoice,invoice.status==='paid'?'pending':'paid')}>Mark {invoice.status==='paid'?'pending':'paid'}</button>}</div></article>)}</div>}
    </div>
    {owner&&<div className="finance-section finance-owner-edit"><p className="finance-kicker">OWNER ONLY</p><h2>Add invoice</h2><form onSubmit={upload}><div className="finance-fields"><label>Amount ($)<input required type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Service period start<input required type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Service period end<input required type="date" min={start} value={end} onChange={e=>setEnd(e.target.value)}/></label><label>Invoice issued<input required type="date" value={issued} onChange={e=>setIssued(e.target.value)}/></label><label>Payment due (optional)<input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label><label>Invoice PDF<input required type="file" accept="application/pdf,.pdf" onChange={e=>setPdf(e.target.files?.[0]||null)}/></label></div><button className="finance-primary" disabled={uploading}>{uploading?'Uploading…':'Add invoice'}</button></form></div>}
  </section>
}
