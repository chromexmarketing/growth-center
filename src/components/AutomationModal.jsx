/* The automation detail modal, shared by the client portal and the
   admin "View as client" button so both always look identical. */
export default function AutomationModal({ auto, onClose }) {
  if (!auto) return null
  const images = (auto.image_urls ?? []).filter(Boolean)

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 999
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 32, maxWidth: 900,
        maxHeight: '90vh', overflowY: 'auto'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20 }}>
          <div>
            <p style={{ color: 'var(--orange)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
              {auto.status}
            </p>
            <h2 style={{ fontSize: 28, marginBottom: 8 }}>{auto.name}</h2>
            {auto.description && <p style={{ color: 'var(--muted)' }}>{auto.description}</p>}
          </div>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 28, cursor: 'pointer' }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {images.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {images.map((url, i) => (
              <div key={i} style={{ borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--line)' }}>
                <img src={url} alt={`Email ${i + 1}`} style={{ width: '100%', display: 'block' }} />
                <p style={{ padding: 12, background: 'var(--bg-soft)', fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                  Email {i + 1}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>
            No email designs uploaded yet
          </p>
        )}
      </div>
    </div>
  )
}
