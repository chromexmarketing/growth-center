export default function GrowthTeaser() {
  return (
    <div className="growth-page">
      {/* ---------- hero ---------- */}
      <div className="growth-hero">
        <div className="aurora" aria-hidden>
          <span className="a1" /><span className="a2" /><span className="a3" />
        </div>
        <p className="growth-eyebrow">Coming soon</p>
        <h1 className="growth-title">Chromex <span>Growth</span></h1>
        <p className="growth-sub">
          Retention analytics built around your brand's retention blueprint.
          Not everyone else's.
        </p>
        <div className="growth-line" aria-hidden />
        <div className="g-scroll-cue" aria-hidden>↓</div>
      </div>

      {/* ---------- the problem ---------- */}
      <section className="g-section">
        <p className="g-kicker">The problem</p>
        <h2 className="g-statement">
          Every retention platform shows every brand
          the <em>same</em> dashboard. But retention
          isn't one thing.
        </h2>
      </section>

      {/* ---------- the demonstration ---------- */}
      <section className="g-section">
        <p className="g-kicker">What Growth sees</p>
        <h3 className="g-heading">What your dashboard obsesses over depends on who you are.</h3>

        <div className="g-cards">
          <div className="g-card">
            <span className="g-chip">Sell supplements?</span>
            <p className="g-metric">Reorder velocity</p>
            <p className="g-body">
              Is your 30 day cohort coming back faster or slower than your
              90 day average says it should?
            </p>
          </div>
          <div className="g-card">
            <span className="g-chip">Sell mattresses?</span>
            <p className="g-metric">Replenishment window</p>
            <p className="g-body">
              You sold 4,100 units in 2019, and those customers are entering
              their buying window right now.
            </p>
          </div>
          <div className="g-card">
            <span className="g-chip">Sell apparel?</span>
            <p className="g-metric">Cross season loyalty</p>
            <p className="g-body">
              Did your summer buyers show up for fall, or did you rent them
              for one collection?
            </p>
          </div>
        </div>

        <p className="g-closer">
          Same platform. Completely different dashboards. Whatever you sell,
          Growth builds yours around how <em>your</em> customers actually come back.
        </p>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="g-section">
        <p className="g-kicker">How it works</p>
        <div className="g-steps">
          <div className="g-step">
            <span className="g-num">01</span>
            <h4>Learn</h4>
            <p>
              In week one, Growth studies your AOV, margins, purchase cycles,
              SKU mix, and customer behavior to map your retention blueprint.
            </p>
          </div>
          <div className="g-step">
            <span className="g-num">02</span>
            <h4>Build</h4>
            <p>
              Your dashboard assembles itself around the metrics that actually
              predict repeat purchases for your business. Nothing generic survives.
            </p>
          </div>
          <div className="g-step">
            <span className="g-num">03</span>
            <h4>Guide</h4>
            <p>
              Every shift in your numbers arrives with the why behind it, how
              urgent it is, and what to do next, ranked by impact on your revenue.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- sign-off ---------- */}
      <section className="g-section g-signoff">
        <div className="growth-line" aria-hidden />
        <p>Launching exclusively for Chromex partners.</p>
      </section>
    </div>
  )
}
