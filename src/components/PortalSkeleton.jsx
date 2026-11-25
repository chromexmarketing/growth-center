// A lightweight preview of the real portal layout while authentication and
// workspace data are loading. No fake metrics, text, or navigation interactions.
const Block = ({ width = '100%', height = 14, className = '' }) => (
  <span className={'portal-skeleton-block ' + className} style={{ width, height }} aria-hidden="true" />
)

export default function PortalSkeleton() {
  return (
    <div className="portal-skeleton" role="status" aria-busy="true" aria-label="Loading Chromex workspace">
      <span className="portal-skeleton-sr">Loading your workspace…</span>

      <aside className="portal-skeleton-sidebar" aria-hidden="true">
        <div className="portal-skeleton-brand"><img src="/logo.webp" alt="" /><span>Chromex<em>.</em></span></div>
        <div className="portal-skeleton-sidebar-items">
          <Block width="72%" height={12} className="portal-skeleton-nav-title" />
          {[0,1,2,3,4].map(i => <div className={'portal-skeleton-nav ' + (i === 0 ? 'is-current' : '')} key={i}>
            <Block width={19} height={19} className="portal-skeleton-nav-icon" />
            <Block width={i === 2 ? '58%' : i === 3 ? '75%' : '65%'} height={12} />
          </div>)}
        </div>
        <div className="portal-skeleton-sidebar-bottom"><Block height={36} width="90%" /></div>
      </aside>

      <div className="portal-skeleton-mobile-head" aria-hidden="true">
        <div className="portal-skeleton-brand"><img src="/logo.webp" alt="" /><span>Chromex<em>.</em></span></div>
        <Block height={32} width={32} className="portal-skeleton-circle" />
      </div>

      <main className="portal-skeleton-content" aria-hidden="true">
        <div className="portal-skeleton-overview"><Block width={86} height={10} /><Block width="min(360px, 75%)" height={29} /><Block width="min(265px, 62%)" height={13}/></div>

        <div className="portal-skeleton-filters">
          {[52,58,64,64,62].map((width,i) => <Block key={i} width={width} height={30} className="portal-skeleton-pill" />)}
        </div>

        <div className="portal-skeleton-metrics">
          {[0,1,2].map(i => <div key={i} className="portal-skeleton-metric">
            <Block width={i===1?'74%':'62%'} height={12}/>
            <Block width="69%" height={29}/>
            <Block width="49%" height={10}/>
          </div>)}
        </div>

        <div className="portal-skeleton-chart">
          <div className="portal-skeleton-chart-head">
            <Block width={136} height={12}/>
            <Block width={110} height={12}/>
          </div>
          <div className="portal-skeleton-bars">
            {[36,53,44,68,61,48,74,54,71,63,80,72,89,65,76,93,79,84,69,95,86,77,91,82].map((height,i)=>
              <div className="portal-skeleton-bar" key={i} style={{ height: height + '%' }}/>
            )}
          </div>
          <div className="portal-skeleton-chart-axis"><Block height={8} width="22%"/><Block height={8} width="24%"/><Block height={8} width="22%"/></div>
        </div>
      </main>

      <nav className="portal-skeleton-mobile-dock" aria-hidden="true">
        {[0,1,2,3,4].map(i => <div key={i}><Block width={21} height={21}/><Block width={i===1?43:35} height={8}/></div>)}
      </nav>
    </div>
  )
}
