import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    ref.current?.querySelectorAll('.lp-reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp" ref={ref}>

      {/* ── Nav ─────────────────────────────────────── */}
      <header className="lp-nav lp-shell">
        <Link to="/" className="lp-brand">
          <span className="lp-mark"><img src="/provenode-logo.svg" alt="" /></span>
          Provenode
        </Link>
        <nav className="lp-nav-links">
          <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-gh" aria-label="GitHub">
            <i className="hgi-stroke hgi-github" />
          </a>
          <Link to="/app/dashboard" className="lp-btn lp-btn-orange">
            <i className="hgi-stroke hgi-rocket-01" /> Open console
          </Link>
        </nav>
      </header>

      <main>

        {/* ── Hero ────────────────────────────────────── */}
        <section className="lp-hero lp-shell">
          <span className="lp-eyebrow">
            <span className="lp-dot" />
            Built on Shelby shelbynet
          </span>
          <h1 className="lp-h1">
            Ship the model<br />you approved.<br />
            <span className="lp-scribble">Prove it ran.</span>
          </h1>
          <p className="lp-sub">
            Every AI model gets a SHA-256 identity before it touches your fleet.
            Shelby stores it as an immutable on-chain object. Devices verify the hash
            before activation — wrong file means blocked, not deployed.
          </p>
          <div className="lp-hero-cta">
            <Link to="/app/dashboard" className="lp-btn lp-btn-orange">
              <i className="hgi-stroke hgi-play" /> Open console
            </Link>
            <a href="#features" className="lp-btn">
              See features <i className="hgi-stroke hgi-arrow-down-01" />
            </a>
          </div>
          <p className="lp-note">No credit card · Shelby shelbynet · Deploy free</p>

          {/* Product board */}
          <div className="lp-product lp-reveal">
            <div className="lp-board">
              <div className="lp-wbar">
                <div className="lp-dots"><span /><span /><span /></div>
                <span className="lp-wtitle">Production rollout · Vision Edge v2.4.1</span>
                <span className="lp-live">Shelby ready</span>
              </div>
              <div className="lp-scroll">
                <div className="lp-grid">
                  <div className="lp-th">#</div>
                  <div className="lp-th">Model artifact</div>
                  <div className="lp-th">Shelby object</div>
                  <div className="lp-th">Region</div>
                  <div className="lp-th">Verification</div>
                  <div className="lp-th">Rollout</div>

                  <div className="lp-td lp-num">1</div>
                  <div className="lp-td">
                    <span className="lp-mico" style={{background:'#ded2ff'}}><i className="hgi-stroke hgi-ai-brain-01" /></span>
                    <strong>Vision Edge v2.4.1</strong>
                  </div>
                  <div className="lp-td lp-mono">0x73ab…20f1</div>
                  <div className="lp-td">Singapore</div>
                  <div className="lp-td"><span className="lp-tag"><i className="hgi-stroke hgi-tick-01" /> Verified</span></div>
                  <div className="lp-td"><div className="lp-bar"><div className="lp-fill" /></div> 64%</div>

                  <div className="lp-td lp-num">2</div>
                  <div className="lp-td">
                    <span className="lp-mico" style={{background:'#c9dcff'}}><i className="hgi-stroke hgi-drone" /></span>
                    <strong>Drone Nav v3.2</strong>
                  </div>
                  <div className="lp-td lp-mono">0xe871…b019</div>
                  <div className="lp-td">Bengaluru</div>
                  <div className="lp-td"><span className="lp-tag"><i className="hgi-stroke hgi-tick-01" /> Verified</span></div>
                  <div className="lp-td lp-muted">Complete</div>

                  <div className="lp-td lp-num">3</div>
                  <div className="lp-td">
                    <span className="lp-mico" style={{background:'#f7dc72'}}><i className="hgi-stroke hgi-machine-robot" /></span>
                    <strong>Safety Adapter v0.9</strong>
                  </div>
                  <div className="lp-td lp-mono">Pending</div>
                  <div className="lp-td">Frankfurt</div>
                  <div className="lp-td"><span className="lp-tag lp-tag-warn">Staged</span></div>
                  <div className="lp-td lp-muted">—</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ────────────────────────────────── */}
        <section className="lp-section lp-section-white" id="features">
          <div className="lp-shell">
            <div className="lp-features">
              {[
                {
                  icon: 'hgi-fingerprint-scan',
                  title: 'SHA-256 identity',
                  desc: 'Every model file is hashed before it can enter the fleet. That hash is the identity — not the filename, not the version tag, not the path.',
                  tags: ['SHA-256', 'Manifest', 'Signed'],
                },
                {
                  icon: 'hgi-route-01',
                  title: 'Canary rollouts',
                  desc: '10% first. Then 50%. Then full fleet — but only after every device in the previous stage reports a healthy digest match.',
                  tags: ['10%', '50%', '100%'],
                },
                {
                  icon: 'hgi-shield-energy',
                  title: 'Block on mismatch',
                  desc: "Device downloads the file and hashes it locally. If it doesn't match the signed manifest, activation is blocked. Previous model stays loaded.",
                  tags: ['Compare', 'Block', 'Rollback'],
                },
              ].map((f, i) => (
                <article className={`lp-feat lp-reveal${i ? ` lp-d${i}` : ''}`} key={f.title}>
                  <div className="lp-feat-icon"><i className={`hgi-stroke ${f.icon}`} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                  <div className="lp-minigrid">
                    {f.tags.map((t) => <span key={t}>{t}</span>)}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ─────────────────────────────────────── */}
        <section className="lp-cta">
          <div className="lp-shell">
            <div className="lp-cta-card lp-reveal">
              <span className="lp-spark a" aria-hidden="true">✦</span>
              <span className="lp-spark b" aria-hidden="true">✦</span>
              <h2>Watch a bad model get stopped before it reaches production.</h2>
              <p>Canary, integrity failure, and rollback — end to end in the console.</p>
              <Link to="/app/dashboard" className="lp-btn lp-btn-dark">
                <i className="hgi-stroke hgi-dashboard-square-01" /> Open Provenode console
              </Link>
            </div>
          </div>
        </section>

      </main>

      <footer className="lp-footer lp-shell lp-reveal">
        <b>Provenode</b>
        <span>Verified AI model delivery · Shelby shelbynet</span>
        <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer">
          <i className="hgi-stroke hgi-github" /> GitHub
        </a>
      </footer>

    </div>
  );
}