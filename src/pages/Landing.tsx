import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    ref.current?.querySelectorAll('.lp-reveal').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp" ref={ref}>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="lp-nav lp-shell">
        <Link to="/" className="lp-brand">
          <span className="lp-mark"><img src="/provenode-logo.svg" alt="Provenode" /></span>
          Provenode
        </Link>
        <nav className="lp-nav-links">
          <a href="#features" className="lp-link">Features</a>
          <a href="#shelby" className="lp-link">Why Shelby</a>
          <a href="#workflow" className="lp-link">How it works</a>
          <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-gh" aria-label="GitHub">
            <i className="hgi-stroke hgi-github" />
          </a>
          <Link to="/app/dashboard" className="lp-btn">Open console</Link>
          <Link to="/app/dashboard" className="lp-btn lp-btn-orange">
            <i className="hgi-stroke hgi-rocket-01" /> Deploy
          </Link>
        </nav>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="lp-hero lp-shell">
          <span className="lp-eyebrow">
            <span className="lp-dot" />
            Built for edge fleets on Shelby
          </span>

          <h1 className="lp-h1">
            Ship the model<br />
            you approved.<br />
            <span className="lp-scribble">Prove it ran.</span>
          </h1>

          <p className="lp-sub">
            Provenode hashes every artifact, stores it as an immutable Shelby object,
            and only activates on device when the digest matches. Wrong file — blocked.
            Fleet stays on the last good version.
          </p>

          <div className="lp-hero-cta">
            <Link to="/app/dashboard" className="lp-btn lp-btn-orange">
              <i className="hgi-stroke hgi-play" /> Open console
            </Link>
            <a href="#shelby" className="lp-btn">
              How Shelby fits in <i className="hgi-stroke hgi-arrow-down-01" />
            </a>
          </div>
          <div className="lp-note">No credit card · Shelbynet · Free to deploy</div>

          {/* Product board */}
          <div className="lp-product lp-reveal">
            <div className="lp-board">
              <div className="lp-wbar">
                <div className="lp-dots"><span/><span/><span/></div>
                <span className="lp-wtitle">Production rollout · Vision Edge v2.4.1</span>
                <span className="lp-live">Shelby ready</span>
              </div>
              <div style={{overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
                <div style={{minWidth:520}}>
                  <div style={{display:'grid',gridTemplateColumns:'40px 1.4fr 1fr .8fr 90px',background:'#f1efe9',borderBottom:'1px solid #d8d4cc'}}>
                    {['#','Model artifact','Shelby object','Region','Rollout'].map(h=>(
                      <div key={h} className="lp-th">{h}</div>
                    ))}
                  </div>
                  {[
                    { n:1, model:'Vision Edge v2.4.1', obj:'0x73ab…20f1', region:'Singapore', icon:'hgi-ai-brain-01', bg:'#ded2ff', tag:true, prog:true },
                    { n:2, model:'Drone Nav v3.2',      obj:'0xe871…b019', region:'Bengaluru',  icon:'hgi-drone',       bg:'#c9dcff', tag:true, prog:false, done:'Complete' },
                    { n:3, model:'Safety Adapter v0.9', obj:'Pending',     region:'Frankfurt',  icon:'hgi-machine-robot',bg:'#f7dc72', tag:false,prog:false, done:'—' },
                  ].map(row => (
                    <div key={row.n} style={{display:'grid',gridTemplateColumns:'40px 1.4fr 1fr .8fr 90px',borderBottom:'1px solid #d8d4cc'}}>
                      <div className="lp-td lp-td-num">{row.n}</div>
                      <div className="lp-td">
                        <span className="lp-micon" style={{background:row.bg}}><i className={`hgi-stroke ${row.icon}`}/></span>
                        <strong style={{fontSize:11}}>{row.model}</strong>
                      </div>
                      <div className="lp-td" style={{fontFamily:'ui-monospace,monospace',fontSize:10}}>{row.obj}</div>
                      <div className="lp-td" style={{fontSize:11}}>{row.region}</div>
                      <div className="lp-td">
                        {row.tag ? (
                          <><div className="lp-prog"><div className="lp-prog-fill"/></div></>
                        ) : (
                          <span style={{fontSize:11,color:'#6d6a64'}}>{row.done}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Fleet types ────────────────────────────────────── */}
        <section className="lp-fleet lp-shell lp-reveal">
          <p className="lp-fleet-label">One control plane for every kind of edge fleet</p>
          <div className="lp-fleet-items">
            <span className="lp-fleet-item lp-reveal lp-d1"><i className="hgi-stroke hgi-camera-01"/>Smart cameras</span>
            <span className="lp-fleet-item lp-reveal lp-d2"><i className="hgi-stroke hgi-drone"/>Autonomous drones</span>
            <span className="lp-fleet-item lp-reveal lp-d3"><i className="hgi-stroke hgi-machine-robot"/>Warehouse robots</span>
            <span className="lp-fleet-item lp-reveal lp-d4"><i className="hgi-stroke hgi-car-01"/>Vehicle systems</span>
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────── */}
        <section className="lp-section lp-section-white" id="features">
          <div className="lp-shell">
            <div className="lp-head lp-reveal">
              <div className="lp-head-grid">
                <div>
                  <p className="lp-kicker">What it actually does</p>
                  <h2 className="lp-h2">Hash. Ship. Check.<br/>Rollback if needed.</h2>
                </div>
                <p className="lp-head-p">
                  Model files are not just downloads. Provenode owns identity, distribution,
                  verification, health, and recovery in one place — so a bad artifact never becomes a bad fleet.
                </p>
              </div>
            </div>
            <div className="lp-features">
              {[
                { icon:'hgi-fingerprint-scan', title:'Content-address every model', desc:'SHA-256 is computed before anything hits the fleet. That hash is the identity — not the filename, not the tag.', tags:['SHA-256','Manifest','Runtime'] },
                { icon:'hgi-route-01',         title:'Roll out in stages',          desc:'10% canary first. Then 50%. Then full fleet — only if devices stay healthy. Or stop and reverse.',               tags:['10%','50%','100%'] },
                { icon:'hgi-shield-energy',    title:'Block bad activations',       desc:"If the downloaded digest does not match the signed manifest, the device keeps the previous model and alerts you.", tags:['Compare','Block','Rollback'] },
              ].map((f,i) => (
                <article className={`lp-feat lp-reveal ${i>0?`lp-d${i}`:''}`} key={f.title}>
                  <div className="lp-feat-icon"><i className={`hgi-stroke ${f.icon}`}/></div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                  <div className="lp-minigrid">{f.tags.map(t=><span key={t}>{t}</span>)}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Shelby ──────────────────────────────────────────── */}
        <section className="lp-section" id="shelby">
          <div className="lp-shell lp-split">
            <div className="lp-bigcopy lp-reveal">
              <p className="lp-kicker">Why Shelby</p>
              <h2 className="lp-h2">Store once. Read anywhere. Verify on device.</h2>
              <p>
                Every approved model becomes an immutable Shelby object.
                The deployment manifest points at that object. Devices fetch it,
                re-hash it, and only load if the bytes match what you signed.
              </p>
              <div className="lp-checks">
                {[
                  'One object ID for every region — no "which CDN copy?"',
                  'Immutable commitment you can show auditors',
                  'Device-side digest check before activation',
                ].map(c => (
                  <div className="lp-check" key={c}>
                    <span className="lp-tick"><i className="hgi-stroke hgi-tick-01"/></span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
              <Link to="/app/dashboard" className="lp-btn lp-btn-orange">
                Open Shelby layer <i className="hgi-stroke hgi-arrow-right-01"/>
              </Link>
            </div>
            <div className="lp-proof lp-reveal lp-d1">
              <div className="lp-proof-top">
                <b>Artifact proof</b>
                <span className="lp-tag"><i className="hgi-stroke hgi-tick-01"/>VERIFIED</span>
              </div>
              <div className="lp-proof-body">
                {[
                  ['Model',          'vision-edge-v2.4.1.onnx'],
                  ['Shelby object',  'shelby://shelbynet/models/vision/2.4.1'],
                  ['Commitment',     '0x73ab91c4…20f1'],
                  ['SHA-256',        '9e4a7c81d2bf…b82f'],
                  ['Activation',     'Digest must match manifest'],
                ].map(([k,v]) => (
                  <div className="lp-proof-row" key={k}>
                    <span>{k}</span>
                    <span className={`lp-mono`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Workflow ─────────────────────────────────────────── */}
        <section className="lp-section lp-section-white" id="workflow">
          <div className="lp-shell">
            <div className="lp-reveal">
              <p className="lp-kicker">Release loop</p>
              <h2 className="lp-h2">From approved file to<br/>healthy fleet in four steps.</h2>
            </div>
            <div className="lp-steps">
              {[
                { n:'01', icon:'hgi-cloud-upload',   title:'Publish',   desc:'Hash the model and write the immutable Shelby object.' },
                { n:'02', icon:'hgi-file-security',  title:'Sign',      desc:'Attach runtime, policy, and target fleet to a deployment manifest.' },
                { n:'03', icon:'hgi-global',         title:'Distribute',desc:'Devices pull the approved object — canary first if you want.' },
                { n:'04', icon:'hgi-shield-01',      title:'Verify',    desc:'Activate only after digest + health checks pass. Else roll back.' },
              ].map((s,i) => (
                <article className={`lp-step lp-reveal lp-d${i}`} key={s.n}>
                  <span className="lp-step-n">STEP {s.n}</span>
                  <div className="lp-step-ico"><i className={`hgi-stroke ${s.icon}`}/></div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ─────────────────────────────────────────────── */}
        <section className="lp-cta">
          <div className="lp-shell">
            <div className="lp-cta-card lp-reveal">
              <span className="lp-cta-spark a" aria-hidden="true">✦</span>
              <span className="lp-cta-spark b" aria-hidden="true">✦</span>
              <h2 className="lp-h2">Watch a bad model get stopped<br/>before it reaches production.</h2>
              <p>Canary, integrity failure, and rollback — end to end in the console.</p>
              <Link to="/app/dashboard" className="lp-btn lp-btn-dark">
                <i className="hgi-stroke hgi-dashboard-square-01"/> Open Provenode console
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer lp-shell lp-reveal">
        <b>Provenode</b>
        <span>Verified edge AI delivery · Shelby shelbynet</span>
        <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer">
          <i className="hgi-stroke hgi-github"/> GitHub
        </a>
      </footer>
    </div>
  );
}