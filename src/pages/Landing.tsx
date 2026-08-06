import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const CODE_SAMPLE = `from provenode import ProvenodeClient

client = ProvenodeClient(
    api_url="https://provenode-git-main-teams16.vercel.app"
)

# Upload to Shelbynet, SHA-256 registered on Aptos
model = client.upload("model.onnx", name="ResNet-v2")
print(model.sha256)

# Deploy to fleet — devices verify before loading
dep = client.deploy(model.id, region="Global")
print(dep.status)  # "verified"`;

export default function Landing() {
  const ref = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Scroll reveal
    const io = new IntersectionObserver(
      (es) => es.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.07, rootMargin: '0px 0px -40px 0px' }
    );
    ref.current?.querySelectorAll('.lp-reveal').forEach(el => io.observe(el));

    // Nav glass on scroll
    const nav = document.querySelector('.lp-nav') as HTMLElement | null;
    const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 20);
    // Apply immediately on mount too
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Counter animation
    const counters = ref.current?.querySelectorAll('[data-count]') || [];
    const cio = new IntersectionObserver((es) => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        const target = parseFloat(el.dataset.count || '0');
        const suffix = el.dataset.suffix || '';
        const isFloat = !!el.dataset.float;
        let start: number | null = null;
        const dur = 1600;
        const step = (ts: number) => {
          if (!start) start = ts;
          const p = Math.min((ts - start) / dur, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          const val = ease * target;
          el.textContent = (isFloat ? val.toFixed(2) : Math.round(val).toLocaleString()) + suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        cio.unobserve(el);
      });
    }, { threshold: 0.5 });
    counters.forEach(c => cio.observe(c));

    // Typing animation in terminal
    const terminal = document.querySelector('.lp-terminal-text') as HTMLElement | null;
    if (terminal) {
      const lines = [
        '$ provenode upload model.onnx --name "ResNet-v2"',
        '  ✓ SHA-256: 9e4a7c81d2bf…b82f',
        '  ✓ Shelby object: shelby://testnet/models/resnet-v2',
        '  ✓ Registered on Aptos testnet · block 10356365905',
        '',
        '$ provenode deploy --model resnet-v2 --region Global',
        '  → Pushing to 248 devices…',
        '  ✓ 248/248 verified',
      ];
      let li = 0, ci = 0;
      terminal.textContent = '';
      const type = () => {
        if (li >= lines.length) return;
        const line = lines[li];
        if (ci <= line.length) {
          terminal.textContent = lines.slice(0, li).join('\n') + (li > 0 ? '\n' : '') + line.slice(0, ci);
          ci++;
          setTimeout(type, ci === 1 && li > 0 ? 180 : 22);
        } else {
          li++; ci = 0;
          setTimeout(type, 320);
        }
      };
      const tio = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { type(); tio.disconnect(); }
      }, { threshold: 0.5 });
      tio.observe(terminal);
    }

    return () => {
      io.disconnect();
      cio.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div className="lp" ref={ref}>

      {/* Nav */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand">
            <span className="lp-mark"><img src="/provenode-logo.svg" alt="" /></span>
            Provenode
          </Link>
          <nav className="lp-nav-links">
            <a href="#problem" className="lp-navlink">Why</a>
            <a href="#features" className="lp-navlink">Features</a>
            <a href="#code" className="lp-navlink">SDK</a>
            <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-navlink lp-gh" aria-label="GitHub">
              <i className="hgi-stroke hgi-github" />
            </a>
            <span className="lp-nav-sep" aria-hidden="true" />
            <Link to="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
            <Link to="/app/dashboard" className="lp-btn lp-btn-orange">
              <i className="hgi-stroke hgi-rocket-01" /> Deploy now
            </Link>
          </nav>
          {/* Hamburger — mobile only */}
          <button
            className={`lp-hamburger${menuOpen ? ' open' : ''}`}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      <div className={`lp-mobile-nav${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
        <a href="#problem" onClick={() => setMenuOpen(false)}>Why Provenode</a>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#code" onClick={() => setMenuOpen(false)}>SDK</a>
        <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
          <i className="hgi-stroke hgi-github" style={{marginRight:6}} />GitHub
        </a>
        <div className="lp-mobile-divider" />
        <div className="lp-mobile-ctas">
          <Link to="/login" className="lp-btn lp-btn-ghost" onClick={() => setMenuOpen(false)}>Sign in</Link>
          <Link to="/app/dashboard" className="lp-btn lp-btn-orange" onClick={() => setMenuOpen(false)}>
            <i className="hgi-stroke hgi-rocket-01" /> Deploy now
          </Link>
        </div>
      </div>

      <main>

        {/* Hero */}
        <section className="lp-hero">
          <div className="lp-shell">
            <div className="lp-badge lp-anim-fade-up" style={{ animationDelay: '0ms' }}>
              <span className="lp-badge-dot" />
              Live on Shelbynet
              <span className="lp-badge-arrow">→</span>
              <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-badge-link">View source</a>
            </div>
            <h1 className="lp-h1 lp-anim-fade-up" style={{ animationDelay: '80ms' }}>
              Your fleet runs what<br />
              <span className="lp-accent">you approved.</span><br />
              <span className="lp-scribble">Provably.</span>
            </h1>
            <p className="lp-sub lp-anim-fade-up" style={{ animationDelay: '160ms' }}>
              Provenode gives every AI model a SHA-256 identity, publishes it as an immutable Shelby
              object, and enforces hash verification on every device before activation. No match
              means no load — the previous model stays running.
            </p>
            <div className="lp-hero-cta lp-anim-fade-up" style={{ animationDelay: '240ms' }}>
              <Link to="/app/dashboard" className="lp-btn lp-btn-primary">
                Open console <i className="hgi-stroke hgi-arrow-right-01" />
              </Link>
              <a href="#problem" className="lp-btn lp-btn-outline">
                See how it works
              </a>
            </div>
            <div className="lp-hero-note lp-anim-fade-up" style={{ animationDelay: '320ms' }}>
              Free · Open source · Built on Shelbynet + Aptos
            </div>
          </div>
        </section>

        {/* Product board */}
        <div className="lp-board-wrap lp-shell lp-reveal">
          <div className="lp-board">
            <div className="lp-wbar">
              <div className="lp-dots"><span /><span /><span /></div>
              <span className="lp-wtitle">Production rollout · Vision Edge v2.4.1 · Global camera fleet</span>
              <span className="lp-live">Shelby ready</span>
            </div>
            <div className="lp-scroll">
              <div className="lp-grid lp-grid-6">
                {['#','Model artifact','Shelby object','Region','Verification','Rollout'].map(h => (
                  <div key={h} className="lp-th">{h}</div>
                ))}
                {[
                  { n:1, name:'Vision Edge v2.4.1', obj:'0x73ab…20f1', region:'Singapore', bg:'#ded2ff', icon:'hgi-ai-brain-01', verified:true,  rollout:'64%' },
                  { n:2, name:'Drone Nav v3.2',      obj:'0xe871…b019', region:'Bengaluru',  bg:'#c9dcff', icon:'hgi-drone',       verified:true,  rollout:'Complete' },
                  { n:3, name:'Safety Adapter v0.9', obj:'Pending',     region:'Frankfurt',  bg:'#f7dc72', icon:'hgi-machine-robot',verified:false, rollout:'—' },
                ].map(row => (
                  <React.Fragment key={row.n}>
                    <div className="lp-td lp-num">{row.n}</div>
                    <div className="lp-td">
                      <span className="lp-mico" style={{background:row.bg}}><i className={`hgi-stroke ${row.icon}`}/></span>
                      <strong>{row.name}</strong>
                    </div>
                    <div className="lp-td lp-mono">{row.obj}</div>
                    <div className="lp-td">{row.region}</div>
                    <div className="lp-td">
                      {row.verified
                        ? <span className="lp-tag lp-tag-green"><i className="hgi-stroke hgi-tick-01"/>Verified</span>
                        : <span className="lp-tag lp-tag-yellow">Staged</span>}
                    </div>
                    <div className="lp-td">
                      {row.rollout === '64%'
                        ? <><div className="lp-bar"><div className="lp-fill"/></div><span style={{fontSize:10,marginLeft:4}}>64%</span></>
                        : <span style={{fontSize:11,color:'#6d6a64'}}>{row.rollout}</span>}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="lp-board-floats">
            <div className="lp-float lp-float-a lp-reveal lp-d1">
              <strong><i className="hgi-stroke hgi-alert-02" /> Canary paused</strong>
              Digest mismatch on CAM-SIN-042
            </div>
            <div className="lp-float lp-float-b lp-reveal lp-d2">
              <strong><i className="hgi-stroke hgi-checkmark-circle-02" /> 248 devices</strong>
              Verified across 4 regions
            </div>
          </div>
        </div>

        {/* Stats */}
        <section className="lp-stats-section lp-reveal">
          <div className="lp-shell lp-stats">
            <div className="lp-stat">
              <span className="lp-stat-n" data-count="248">0</span>
              <span className="lp-stat-l">edge devices</span>
            </div>
            <div className="lp-stat-div" />
            <div className="lp-stat">
              <span className="lp-stat-n" data-count="99.99" data-suffix="%" data-float="1">0%</span>
              <span className="lp-stat-l">integrity rate</span>
            </div>
            <div className="lp-stat-div" />
            <div className="lp-stat">
              <span className="lp-stat-n" data-count="4">0</span>
              <span className="lp-stat-l">global regions</span>
            </div>
            <div className="lp-stat-div" />
            <div className="lp-stat">
              <span className="lp-stat-n" data-count="25">0</span>
              <span className="lp-stat-l">API endpoints</span>
            </div>
          </div>
        </section>

        {/* Terminal animation */}
        <section className="lp-terminal-section lp-reveal" id="terminal">
          <div className="lp-shell">
            <div className="lp-terminal-wrap">
              <div className="lp-terminal-bar">
                <div className="lp-dots lp-dots-dark"><span/><span/><span/></div>
                <span className="lp-terminal-title">provenode cli</span>
              </div>
              <pre className="lp-terminal-body"><code className="lp-terminal-text"></code><span className="lp-cursor">▋</span></pre>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="lp-problem" id="problem">
          <div className="lp-shell">
            <div className="lp-problem-inner lp-reveal">
              <div className="lp-problem-text">
                <p className="lp-kicker">The real problem</p>
                <h2 className="lp-h2">You pushed an update.<br />What is camera 42 actually running?</h2>
                <p className="lp-problem-p">
                  When you deploy a new model to 248 edge devices, there is no reliable way
                  to prove every device received the exact file you approved. Filenames change.
                  CDN caches corrupt. Partial downloads happen silently.
                </p>
                <p className="lp-problem-p">
                  The standard answer is "trust the orchestrator" — which means trusting a
                  database that can be edited. Shelby objects cannot. That is the difference.
                </p>
                <div className="lp-problem-checks">
                  {[
                    ['hgi-cancel-circle', 'Database says model v2 is deployed', true],
                    ['hgi-cancel-circle', 'Device actually running model v1.9', true],
                    ['hgi-cancel-circle', 'No way to prove the discrepancy', true],
                    ['hgi-checkmark-circle-02', 'Provenode enforces hash at activation', false],
                  ].map(([icon, text, bad]) => (
                    <div className="lp-pcheck" key={text as string}>
                      <span className={`lp-pcheck-ico ${bad ? 'bad' : 'good'}`}><i className={`hgi-stroke ${icon}`}/></span>
                      <span style={{textDecoration: bad ? 'line-through' : 'none', opacity: bad ? 0.6 : 1}}>{text as string}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lp-proof-card">
                <div className="lp-proof-top">
                  <b>Proof of deployment</b>
                  <span className="lp-tag lp-tag-green"><i className="hgi-stroke hgi-tick-01"/> VERIFIED</span>
                </div>
                <div className="lp-proof-body">
                  {[
                    ['Model', 'vision-edge-v2.4.1.onnx'],
                    ['Shelby object', 'shelby://testnet/models/vision/2.4.1'],
                    ['SHA-256', '9e4a7c81d2bf…b82f'],
                    ['Aptos contract', '0x77f8cb3d…87cb'],
                    ['Activation rule', 'Digest must match manifest'],
                  ].map(([k, v]) => (
                    <div className="lp-proof-row" key={k}>
                      <span className="lp-proof-k">{k}</span>
                      <span className="lp-proof-v lp-mono">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="lp-section lp-section-light" id="features">
          <div className="lp-shell">
            <div className="lp-sec-head lp-reveal">
              <p className="lp-kicker">Built-in features</p>
              <h2 className="lp-h2">Everything for verified edge AI delivery.</h2>
            </div>
            <div className="lp-features-6">
              {[
                { icon:'hgi-fingerprint-scan', title:'SHA-256 identity',       desc:'Every model is content-addressed before deployment. Hash is the identity, not the filename.',        bg:'var(--lp-paper)' },
                { icon:'hgi-route-01',         title:'Canary rollouts',        desc:'10% → 50% → 100% with automatic rollback if error rate exceeds your threshold.',                    bg:'#fff3ca' },
                { icon:'hgi-shield-energy',    title:'Activation enforcement', desc:'Devices re-hash the download and compare it to the signed manifest. No match = no load.',           bg:'#e8e0ff' },
                { icon:'hgi-blockchain-01',    title:'On-chain manifests',     desc:'Deployment decisions uploaded to Shelby as immutable objects. Auditors go to the chain, not your DB.', bg:'#d4eafe' },
                { icon:'hgi-analytics-01',     title:'A/B model testing',      desc:'Split fleet traffic between two model versions, measure real latency and error rate per device.',    bg:'#e7f5ea' },
                { icon:'hgi-git-branch',       title:'Model lineage',          desc:'Track parent → child relationships. Catch when a recalled base model is still in production.',       bg:'#fce7e7' },
              ].map((f, i) => (
                <article className={`lp-feat lp-reveal lp-d${i % 3}`} key={f.title} style={{background:f.bg}}>
                  <div className="lp-feat-icon"><i className={`hgi-stroke ${f.icon}`}/></div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Code demo */}
        <section className="lp-section lp-section-dark" id="code">
          <div className="lp-shell">
            <div className="lp-code-inner lp-reveal">
              <div className="lp-code-text">
                <p className="lp-kicker lp-kicker-light">Python SDK</p>
                <h2 className="lp-h2 lp-h2-light">Deploy from your CI pipeline.</h2>
                <p className="lp-code-p">
                  Three lines to upload, deploy, and wait for verification.
                  The SDK handles SHA-256, Shelby upload, canary rollout, and device polling.
                </p>
                <div className="lp-code-bullets">
                  {[
                    'pip install provenode-sdk',
                    'Supports HuggingFace Hub import',
                    'GitHub Action included in repo',
                  ].map(b => (
                    <div className="lp-code-bullet" key={b}>
                      <i className="hgi-stroke hgi-tick-01"/>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lp-code-block">
                <div className="lp-code-top">
                  <div className="lp-dots lp-dots-dark"><span/><span/><span/></div>
                  <span className="lp-code-lang">Python</span>
                </div>
                <pre className="lp-pre"><code>{CODE_SAMPLE}</code></pre>
              </div>
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="lp-integrations lp-reveal">
          <div className="lp-shell">
            <p className="lp-int-label">Integrates with</p>
            <div className="lp-int-row">
              {[
                { icon: 'hgi-github',         label: 'GitHub Actions' },
                { icon: 'hgi-blockchain-01',  label: 'Shelbynet' },
                { icon: 'hgi-ai-brain-01',    label: 'HuggingFace Hub' },
                { icon: 'hgi-shield-01',      label: 'Aptos Move' },
                { icon: 'hgi-notification-02',label: 'Webhooks' },
                { icon: 'hgi-analytics-01',   label: 'Prometheus' },
              ].map(({ icon, label }) => (
                <div className="lp-int-item" key={label}>
                  <i className={`hgi-stroke ${icon}`} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="lp-cta">
          <div className="lp-shell">
            <div className="lp-cta-card lp-reveal">
              <span className="lp-spark a" aria-hidden="true">✦</span>
              <span className="lp-spark b" aria-hidden="true">✦</span>
              <h2>When device 42 in Singapore loads the wrong model, you will know. Before it activates.</h2>
              <p>Deploy your first model in under 5 minutes. Free. Open source.</p>
              <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
                <Link to="/app/dashboard" className="lp-btn lp-btn-dark">
                  <i className="hgi-stroke hgi-dashboard-square-01"/> Open console
                </Link>
                <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-btn" style={{background:'rgba(255,255,255,.15)',border:'1.5px solid rgba(255,255,255,.4)',color:'#fff',boxShadow:'none'}}>
                  <i className="hgi-stroke hgi-github"/> Star on GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-footer-dot" />
            <b>Provenode</b>
          </div>
          <span className="lp-footer-tag">Verified AI model delivery · Shelbynet + Aptos</span>
          <div className="lp-footer-links">
            <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer">
              <i className="hgi-stroke hgi-github"/> GitHub
            </a>
            <Link to="/app/dashboard">Console</Link>
            <a href="https://explorer.aptoslabs.com/account/0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18?network=testnet" target="_blank" rel="noreferrer">Contract</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
