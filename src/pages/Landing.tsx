import React, { useEffect, useRef } from 'react';

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.reveal') || [];
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing-page" ref={rootRef}>
      <header className="shell nav">
        <a className="brand" href="/">
          <span className="brandmark"><img src="/provenode-logo.svg" alt="" /></span>
          Provenode
        </a>
        <nav className="links">
          <a href="#product">Product</a>
          <a href="#shelby">Why Shelby</a>
          <a href="#workflow">How it works</a>
          <a className="social" href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" aria-label="GitHub">
            <i className="hgi-stroke hgi-github" />
          </a>
          <a className="btn" href="/login">Open console</a>
          <a className="btn orange" href="/login"><i className="hgi-stroke hgi-rocket-01" /> Deploy</a>
        </nav>
      </header>

      <main>
        <section className="shell hero">
          <span className="eyebrow"><b /> Built for edge fleets on Shelby</span>
          <h1>Ship the model you approved.<br /><span className="scribble">Prove it ran.</span></h1>
          <p>Provenode hashes every artifact, stores it as a Shelby object, and only activates on device when the digest matches. Wrong file? Blocked. Fleet stays on the last good version.</p>
          <div className="hero-actions">
            <a className="btn orange" href="/login"><i className="hgi-stroke hgi-play" /> Open console</a>
            <a className="btn" href="#shelby">How Shelby fits in <i className="hgi-stroke hgi-arrow-down-01" /></a>
          </div>
          <div className="subnote">No credit card · Runs on shelbynet · Free to deploy</div>

          <div className="product" id="product">
            <div className="float one"><strong><i className="hgi-stroke hgi-alert-02" /> Canary paused</strong>Digest mismatch on CAM-SIN-042</div>
            <div className="float two"><strong><i className="hgi-stroke hgi-checkmark-circle-02" /> 248 devices</strong>Verified across 4 regions</div>
            <div className="board">
              <div className="windowbar">
                <div className="dots"><i /><i /><i /></div>
                <span className="window-title">Production rollout · Vision Edge v2.4.1</span>
                <span className="live">Shelby ready</span>
              </div>
              <div className="sheet">
                <div className="cell head rownum">#</div>
                <div className="cell head">Model artifact</div>
                <div className="cell head">Shelby object</div>
                <div className="cell head">Region</div>
                <div className="cell head">Verification</div>
                <div className="cell head">Rollout</div>

                <div className="cell rownum">1</div>
                <div className="cell"><span className="model-icon"><i className="hgi-stroke hgi-ai-brain-01" /></span><b>Vision Edge v2.4.1</b></div>
                <div className="cell mono">0x73ab…20f1</div>
                <div className="cell">Singapore</div>
                <div className="cell"><span className="tag"><i className="hgi-stroke hgi-tick-01" /> Verified</span></div>
                <div className="cell"><div className="progress"><i /></div>64%</div>

                <div className="cell rownum">2</div>
                <div className="cell"><span className="model-icon" style={{background:'var(--blue)'}}><i className="hgi-stroke hgi-drone" /></span><b>Drone Nav v3.2</b></div>
                <div className="cell mono">0xe871…b019</div>
                <div className="cell">Bengaluru</div>
                <div className="cell"><span className="tag"><i className="hgi-stroke hgi-tick-01" /> Verified</span></div>
                <div className="cell">Complete</div>

                <div className="cell rownum">3</div>
                <div className="cell"><span className="model-icon" style={{background:'var(--yellow)'}}><i className="hgi-stroke hgi-machine-robot" /></span><b>Safety Adapter v0.9</b></div>
                <div className="cell mono">Pending</div>
                <div className="cell">Frankfurt</div>
                <div className="cell"><span className="tag warn">Staged</span></div>
                <div className="cell">—</div>
              </div>
            </div>
          </div>
        </section>

        <section className="shell logo-strip reveal">
          <p>One control plane for every kind of edge fleet</p>
          <div className="fleet-logos">
            <span className="reveal d1"><i className="hgi-stroke hgi-camera-01" /> Smart cameras</span>
            <span className="reveal d2"><i className="hgi-stroke hgi-drone" /> Autonomous drones</span>
            <span className="reveal d3"><i className="hgi-stroke hgi-machine-robot" /> Warehouse robots</span>
            <span className="reveal d4"><i className="hgi-stroke hgi-car-01" /> Vehicle systems</span>
          </div>
        </section>

        <section className="section white">
          <div className="shell">
            <div className="section-head reveal">
              <div><span className="kicker">What it actually does</span><h2>Hash. Ship. Check. Rollback if needed.</h2></div>
              <p>Model files aren't just downloads. Provenode owns identity, distribution, verification, and recovery in one place — so a bad artifact never becomes a bad fleet.</p>
            </div>
            <div className="feature-grid">
              <article className="feature reveal">
                <span className="feature-icon"><i className="hgi-stroke hgi-fingerprint-scan" /></span>
                <h3>Content-address every model</h3>
                <p>SHA-256 is computed before anything hits the fleet. That hash is the identity — not the filename, not the tag.</p>
                <div className="mini-grid"><span>SHA-256</span><span>Manifest</span><span>Runtime</span></div>
              </article>
              <article className="feature reveal d1">
                <span className="feature-icon"><i className="hgi-stroke hgi-route-01" /></span>
                <h3>Roll out in stages</h3>
                <p>10% canary first. Then 50%. Then full fleet — only if devices stay healthy. Or stop and reverse.</p>
                <div className="mini-grid"><span>10%</span><span>50%</span><span>100%</span></div>
              </article>
              <article className="feature reveal d2">
                <span className="feature-icon"><i className="hgi-stroke hgi-shield-energy" /></span>
                <h3>Block bad activations</h3>
                <p>If the downloaded digest doesn't match the signed manifest, the device keeps the previous model and alerts you.</p>
                <div className="mini-grid"><span>Compare</span><span>Block</span><span>Rollback</span></div>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="shelby">
          <div className="shell split">
            <div className="bigcopy reveal">
              <span className="kicker">Why Shelby</span>
              <h2>Store once. Read anywhere. Verify on device.</h2>
              <p>Every approved model becomes an immutable Shelby object. The deployment manifest points at that object. Devices fetch it, re-hash it, and only load if the bytes match what you signed.</p>
              <div className="checklist">
                <div className="check"><span className="tick"><i className="hgi-stroke hgi-tick-01" /></span><span>One object ID for every region — no "which CDN copy?"</span></div>
                <div className="check"><span className="tick"><i className="hgi-stroke hgi-tick-01" /></span><span>Immutable commitment you can show auditors</span></div>
                <div className="check"><span className="tick"><i className="hgi-stroke hgi-tick-01" /></span><span>Device-side digest check before activation</span></div>
              </div>
              <a className="btn orange" href="/login">Open Shelby layer <i className="hgi-stroke hgi-arrow-right-01" /></a>
            </div>
            <div className="proof-card reveal d1">
              <div className="top"><b>Artifact proof</b><span className="tag"><i className="hgi-stroke hgi-tick-01" /> VERIFIED</span></div>
              <div className="body">
                <div className="proof-row"><span>Model</span><b>vision-edge-v2.4.1.onnx</b></div>
                <div className="proof-row"><span>Shelby object</span><span className="mono">shelby://shelbynet/models/vision/2.4.1</span></div>
                <div className="proof-row"><span>Commitment</span><span className="mono">0x73ab91c4…20f1</span></div>
                <div className="proof-row"><span>SHA-256</span><span className="mono">9e4a7c81d2bf…b82f</span></div>
                <div className="proof-row"><span>Activation rule</span><b>Digest must match manifest</b></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section white" id="workflow">
          <div className="shell">
            <div className="reveal"><span className="kicker">Release loop</span><h2 style={{maxWidth:680}}>From approved file to healthy fleet in four steps.</h2></div>
            <div className="workflow">
              <article className="step reveal"><span className="n">STEP 01</span><div className="step-ico"><i className="hgi-stroke hgi-cloud-upload" /></div><h3>Publish</h3><p>Hash the model and write the immutable Shelby object.</p></article>
              <article className="step reveal d1"><span className="n">STEP 02</span><div className="step-ico"><i className="hgi-stroke hgi-file-security" /></div><h3>Sign</h3><p>Attach runtime, policy, and target fleet to a deployment manifest.</p></article>
              <article className="step reveal d2"><span className="n">STEP 03</span><div className="step-ico"><i className="hgi-stroke hgi-global" /></div><h3>Distribute</h3><p>Devices pull the approved object — canary first if you want.</p></article>
              <article className="step reveal d3"><span className="n">STEP 04</span><div className="step-ico"><i className="hgi-stroke hgi-shield-01" /></div><h3>Verify</h3><p>Activate only after digest + health checks pass. Else roll back.</p></article>
            </div>
          </div>
        </section>

        <section className="shell cta">
          <div className="cta-card reveal">
            <span className="spark a" aria-hidden="true">✦</span>
            <span className="spark b" aria-hidden="true">✦</span>
            <h2>Watch a bad model get stopped before production.</h2>
            <p>Canary, integrity failure, and rollback — end to end in the console.</p>
            <a className="btn dark" href="/login"><i className="hgi-stroke hgi-dashboard-square-01" /> Open Provenode console</a>
          </div>
        </section>
      </main>

      <footer className="shell footer reveal">
        <b>Provenode</b>
        <span>Verified edge AI delivery · Shelby shelbynet · Hugeicons</span>
        <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer"><i className="hgi-stroke hgi-github" /> GitHub</a>
      </footer>
    </div>
  );
}