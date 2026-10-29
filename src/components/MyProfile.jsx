import {useState} from 'react'
import {supabase} from '../lib/supabase'

export default function MyProfile({profile}){
  const [name,setName]=useState(profile.first_name||'')
  const [avatar,setAvatar]=useState(profile.avatar_url||'')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function save(changes){
    setBusy(true);setError('');setNotice('')
    const {data,error}=await supabase.from('profiles').update(changes).eq('id',profile.id).select('first_name,avatar_url').single()
    if(error)setError(error.message)
    else {setName(data.first_name||'');setAvatar(data.avatar_url||'');setNotice('Profile saved. Refresh other open sessions to see the update.')}
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
  return <div className="my-profile-page">
    <p className="eyebrow">Account settings</p><h1 className="page-title">My Profile</h1>
    <p className="page-sub">Manage how your name and photo appear in company chat.</p>
    <section className="card my-profile-card">
      <div className="my-profile-top"><div className="my-profile-photo">{avatar?<img src={avatar} alt="Your profile" />:(name||'?').slice(0,1).toUpperCase()}</div><div><h3>{name||'Your profile'}</h3><p className="muted">{profile.role==='admin'?'Chromex Admin':'Client representative'}</p><label className="my-profile-upload">Upload photo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>upload(e.target.files?.[0])}/></label>{avatar&&<button className="my-profile-remove" disabled={busy} onClick={()=>save({avatar_url:null})}>Remove photo</button>}</div></div>
      <label className="label" htmlFor="profile-display-name">Display name</label><input id="profile-display-name" className="input" value={name} maxLength={80} onChange={e=>setName(e.target.value)}/>
      <label className="label">Account role</label><p className="my-profile-readonly">{profile.role==='admin'?'Chromex Admin':'Client representative'}</p>
      <p className="muted">Your login email and role are managed by Chromex.</p>
      {error&&<p className="error-text" role="alert">{error}</p>}{notice&&<p className="muted" role="status">{notice}</p>}
      <button className="btn" disabled={busy||!name.trim()} onClick={()=>save({first_name:name.trim()})}>{busy?'Saving…':'Save changes'}</button>
    </section>
  </div>
}
