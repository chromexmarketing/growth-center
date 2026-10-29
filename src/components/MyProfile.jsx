import {useState} from 'react'
import {supabase} from '../lib/supabase'

export default function MyProfile({profile}){
  const [name,setName]=useState(profile.first_name||'')
  const [jobTitle,setJobTitle]=useState(profile.job_title||'')
  const [contactEmail,setContactEmail]=useState(profile.contact_email||'')
  const [avatar,setAvatar]=useState(profile.avatar_url||'')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function save(changes){
    setBusy(true);setError('');setNotice('')
    const {data,error}=await supabase.from('profiles').update(changes).eq('id',profile.id).select('first_name,avatar_url,job_title,contact_email').single()
    if(error)setError(error.message)
    else {setName(data.first_name||'');setAvatar(data.avatar_url||'');setJobTitle(data.job_title||'');setContactEmail(data.contact_email||'');setNotice('Profile saved. Refresh other open sessions to see the update.')}
    setBusy(false)
  }
  async function upload(file){
    if(!file)return
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024){setError('Choose a JPG, PNG or WebP under 3 MB.');return}
    setBusy(true);setError('');setNotice('')
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'
    const path=profile.id+'/avatar-'+Date.now()+'.'+ext
    const {error:uploadError}=await supabase.storage.from('chat-avatars').upload(path,file,{upsert:false,contentType:file.type})
    if(uploadError){setError(uploadError.message);setBusy(false);return}
    const url=supabase.storage.from('chat-avatars').getPublicUrl(path).data.publicUrl
    await save({avatar_url:url})
  }
  const company=profile.role==='admin'?'Chromex Marketing':(profile.brand_name||'Your company')
  return <div className="my-profile-page">
    <p className="eyebrow">Personal settings</p>
    <h1 className="page-title">My Profile</h1>
    <p className="page-sub">Your identity across the Chromex workspace.</p>
    <section className="my-profile-surface">
      <div className="my-profile-cover" />
      <div className="my-profile-content">
        <div className="my-profile-top">
          <div className="my-profile-photo">{avatar?<img src={avatar} alt="Your profile" />:(name||'?').slice(0,1).toUpperCase()}</div>
          <div className="my-profile-identity">
            <h2>{name||'Your profile'}</h2>
            <p>{company}</p>
          </div>
        </div>
        <div className="my-profile-actions">
          <label className="my-profile-upload">
            <span>{busy?'Saving…':avatar?'Change photo':'Add profile photo'}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{upload(e.target.files?.[0]);e.target.value=''}} style={{display:'none'}} />
          </label>
          {avatar&&<button type="button" className="my-profile-remove" disabled={busy} onClick={()=>save({avatar_url:null})}>Remove photo</button>}
          <span className="my-profile-hint">JPG, PNG or WebP · Up to 3 MB</span>
        </div>
        <div className="my-profile-divider" />
        <div className="my-profile-fields">
          <div>
            <h3>Personal information</h3>
            <p className="muted">This is how teammates see you in chat.</p>
          </div>
          <label className="my-profile-field" htmlFor="profile-display-name">Display name
            <input id="profile-display-name" className="input" value={name} maxLength={80} onChange={e=>setName(e.target.value)} />
          </label>
          <label className="my-profile-field" htmlFor="profile-job-title">Title / role
            <input id="profile-job-title" className="input" placeholder="e.g. Founder, Marketing Manager" value={jobTitle} maxLength={80} onChange={e=>setJobTitle(e.target.value)} />
          </label>
          <label className="my-profile-field" htmlFor="profile-contact-email">Contact email (visible to chat members)
            <input id="profile-contact-email" type="email" className="input" placeholder="you@company.com" value={contactEmail} maxLength={254} onChange={e=>setContactEmail(e.target.value)} />
          </label>
          <div className="my-profile-field">Login email
            <div className="my-profile-readonly">{profile.email||'Managed in account settings'}</div>
          </div>
          <div className="my-profile-field">Company
            <div className="my-profile-readonly">{company}</div>
          </div>
        </div>
        {error&&<p className="error-text" role="alert">{error}</p>}
        {notice&&<p className="muted" role="status">{notice}</p>}
        <div className="my-profile-footer">
          <span className="muted">Your company is managed by Chromex.</span>
          <button className="btn" disabled={busy||!name.trim()} onClick={()=>save({first_name:name.trim(),job_title:jobTitle.trim(),contact_email:contactEmail.trim()||null})}>{busy?'Saving…':'Save changes'}</button>
        </div>
      </div>
    </section>
  </div>
}
