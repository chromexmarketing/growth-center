import {useEffect,useRef,useState} from 'react'
import {supabase} from '../lib/supabase'

export default function MyProfile({profile}){
  const [name,setName]=useState(profile.first_name||'')
  const [jobTitle,setJobTitle]=useState(profile.job_title||'')
  const [contactEmail,setContactEmail]=useState(profile.contact_email||'')
  const [avatar,setAvatar]=useState(profile.avatar_url||'')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  const [cropSrc,setCropSrc]=useState('')
  const [cropZoom,setCropZoom]=useState(1)
  const [cropOffset,setCropOffset]=useState({x:0,y:0})
  const [cropSize,setCropSize]=useState(null)
  const cropImage=useRef(null)
  const dragging=useRef(null)
  useEffect(()=>()=>{if(cropSrc)URL.revokeObjectURL(cropSrc)},[cropSrc])
  const width=cropSize?240*cropSize.w/Math.min(cropSize.w,cropSize.h)*cropZoom:240
  const height=cropSize?240*cropSize.h/Math.min(cropSize.w,cropSize.h)*cropZoom:240
  const clamp=(x,y,w=width,h=height)=>({x:Math.max((240-w)/2,Math.min((w-240)/2,x)),y:Math.max((240-h)/2,Math.min((h-240)/2,y))})
  function selectPhoto(file){
    if(!file)return
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024){setError('Choose a JPG, PNG or WebP under 3 MB.');return}
    setError('');setCropSize(null);setCropZoom(1);setCropOffset({x:0,y:0});setCropSrc(URL.createObjectURL(file))
  }
  async function confirmPhoto(){
    if(!cropImage.current||!cropSize)return
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512
    const ctx=canvas.getContext('2d')
    if(!ctx){setError('Could not crop photo.');return}
    const scale=512/240
    ctx.drawImage(cropImage.current,((240-width)/2+cropOffset.x)*scale,((240-height)/2+cropOffset.y)*scale,width*scale,height*scale)
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9))
    if(!blob){setError('Could not crop photo.');return}
    const saved=await upload(new File([blob],'avatar.jpg',{type:'image/jpeg'}))
    if(saved)setCropSrc('')
  }
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
    if(uploadError){setError(uploadError.message);setBusy(false);return false}
    const url=supabase.storage.from('chat-avatars').getPublicUrl(path).data.publicUrl
    await save({avatar_url:url})
    return true
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
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{selectPhoto(e.target.files?.[0]);e.target.value=''}} style={{display:'none'}} />
          </label>
          {avatar&&<button type="button" className="my-profile-remove" disabled={busy} onClick={()=>save({avatar_url:null})}>Remove photo</button>}
          <span className="my-profile-hint">JPG, PNG or WebP · Up to 3 MB</span>
        </div>

        {cropSrc&&<div className="my-profile-crop-panel">
          <h3>Position your photo</h3><p className="muted">Drag to reposition and use the slider to zoom.</p>
          <div className="my-profile-crop-frame" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);dragging.current={clientX:e.clientX,clientY:e.clientY,...cropOffset}}} onPointerMove={e=>{if(dragging.current)setCropOffset(clamp(dragging.current.x+e.clientX-dragging.current.clientX,dragging.current.y+e.clientY-dragging.current.clientY))}} onPointerUp={()=>dragging.current=null} onPointerCancel={()=>dragging.current=null}>
            <img ref={cropImage} src={cropSrc} draggable={false} alt="Profile photo preview" onLoad={e=>setCropSize({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})} style={{width,height,left:(240-width)/2+cropOffset.x,top:(240-height)/2+cropOffset.y}}/>
            <div className="my-profile-crop-circle"/>
          </div>
          <label className="my-profile-crop-zoom">Zoom <input type="range" min="1" max="3" step=".05" value={cropZoom} onChange={e=>{const z=Number(e.target.value);setCropZoom(z);if(cropSize){const w=240*cropSize.w/Math.min(cropSize.w,cropSize.h)*z,h=240*cropSize.h/Math.min(cropSize.w,cropSize.h)*z;setCropOffset(v=>clamp(v.x,v.y,w,h))}}}/></label>
          <div className="my-profile-crop-actions"><button type="button" className="my-profile-remove" onClick={()=>setCropSrc('')}>Cancel</button><button type="button" className="btn" disabled={busy||!cropSize} onClick={confirmPhoto}>{busy?'Saving…':'Save photo'}</button></div>
        </div>}
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
