import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LatticeBackground from '../components/LatticeBackground';

const CODE_SAMPLE = `from provenode import ProvenodeClient

client = ProvenodeClient(
    api_url="https://provenode-git-main-teams16.vercel.app"
)

# Upload to Shelbynet, SHA-256 registered on Aptos
model = client.upload("model.onnx", name="ResNet-v2")
print(model.sha256)

# Deploy to fleet — devices verify before loading
dep = client.deploy(model.id, region="Global")
print(dep.status)  # "verified"

# Deploy a website to Shelby — like Vercel, but decentralized
site = client.sites.create("my-portfolio")
client.sites.deploy(site.id, "./dist.zip")
print(f"Live at /s/{site.slug}")`;

const FAQS = [
  { q: 'How is Shelby Sites different from Vercel or Netlify?', a: 'Vercel/Netlify store on centralized S3/GCS. Shelby Sites stores every file as an immutable Shelby blob on Aptos (90-day anchored, content-addressed). Your site is verifiable — auditors can fetch the manifest blob and check SHA-256s. Same ZIP → deploy flow, different trust model.' },
  { q: 'Can I deploy a Next.js / Vite / Astro site?', a: 'Yes — run your static export (next build && next export, vite build, astro build) then ZIP the output folder (dist/, out/, build/). Upload the ZIP. We auto-detect index.html, set correct MIME types, and SPA-fallback to index.html.' },
  { q: 'What about databases? Is this a Neon replacement?', a: 'No. Shelby is blob/object storage, not Postgres. Use Shelby Sites for your frontend/assets, and pair it with Neon, PlanetScale, or Upstash for your DB. Provenode gives you both worlds: Shelby for immutable assets, your DB for mutable state.' },
  { q: 'How long do sites stay live? What happens after 90 days?', a: 'Each Shelby blob expires in 90 days. We store the expiry with every deployment and run a cron that re-anchors manifests before expiry (re-upload). You will also get an email warning 7 days before. No manual renewal needed while your site has traffic.' },
  { q: 'How do custom domains work?', a: 'Today every site gets /s/<slug>. Custom domains (yourbrand.com) are on the roadmap — we will add a CNAME → Shelby gateway with automatic TLS via Cloudflare. Join the waitlist from the Sites console.' },
  { q: 'Is it really on-chain verifiable?', a: 'Yes. Every deployment manifest is itself a Shelby blob. Fetch it and you get the full file list with SHA-256s and objectIds. Compare the hash of any served file to the manifest — mismatch means tampering. The manifest blobId is also audit-logged.' },
];

export default function Landing() {
  const ref = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );
    ref.current?.querySelectorAll('.lp-reveal').forEach(el => io.observe(el));

    const nav = document.querySelector('.lp-nav') as HTMLElement | null;
    const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

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

    const terminal = document.querySelector('.lp-terminal-text') as HTMLElement | null;
    if (terminal) {
      const lines = [
        '$ provenode upload model.onnx --name "ResNet-v2"',
        '  ✓ SHA-256: 9e4a7c81d2bf…b82f',
        '  ✓ Shelby object: shelby://shelbynet/models/resnet-v2',
        '  ✓ Registered on Shelbynet · block 10356365905',
        '',
        '$ provenode deploy --model resnet-v2 --region Global',
        '  → Pushing to 248 devices…',
        '  ✓ 248/248 verified',
        '',
        '$ provenode site deploy --site my-portfolio --zip ./dist.zip',
        '  ✓ 42 files → Shelby blobs',
        '  ✓ Live at /s/my-portfolio',
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

    const cards = ref.current?.querySelectorAll('.lp-feat');
    const handleMouseMove = (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    };
    cards?.forEach(card => {
      card.addEventListener('mousemove', handleMouseMove as EventListener);
    });

    return () => {
      io.disconnect();
      cio.disconnect();
      window.removeEventListener('scroll', onScroll);
      cards?.forEach(card => {
        card.removeEventListener('mousemove', handleMouseMove as EventListener);
      });
    };
  }, []);

  return (
    <div className="lp" ref={ref}>
      <LatticeBackground />

      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand">
            <span className="lp-mark"><img src="/provenode-logo.svg" alt="" /></span>
            Provenode
          </Link>
          <nav className="lp-nav-links">
            <a href="#features" className="lp-navlink">Features</a>
            <a href="#sites" className="lp-navlink">Sites</a>
            <a href="#pricing" className="lp-navlink">Pricing</a>
            <a href="#code" className="lp-navlink">SDK</a>
            <a href="/docs/" target="_blank" rel="noreferrer" className="lp-navlink">Docs</a>
            <a href="https://x.com/provenode" target="_blank" rel="noreferrer" className="lp-navlink lp-gh" aria-label="X (Twitter)"><i className="hgi-stroke hgi-twitter" /></a>
            <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-navlink lp-gh" aria-label="GitHub"><i className="hgi-stroke hgi-github" /></a>
            <span className="lp-nav-sep" aria-hidden="true" />
            <Link to="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
            <Link to="/app/dashboard" className="lp-btn lp-btn-orange"><i className="hgi-stroke hgi-rocket-01" /> Deploy now</Link>
          </nav>
          <button className={`lp-hamburger${menuOpen ? ' open' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}><span /><span /><span /></button>
        </div>
      </header>

      <div className={`lp-mobile-nav${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#sites" onClick={() => setMenuOpen(false)}>Sites</a>
        <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
        <a href="#code" onClick={() => setMenuOpen(false)}>SDK</a>
        <a href="/docs/" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}><i className="hgi-stroke hgi-book-open-01" style={{marginRight:6}} />Docs</a>
        <div className="lp-mobile-divider" />
        <div className="lp-mobile-ctas">
          <Link to="/login" className="lp-btn lp-btn-ghost" onClick={() => setMenuOpen(false)}>Sign in</Link>
          <Link to="/app/dashboard" className="lp-btn lp-btn-orange" onClick={() => setMenuOpen(false)}><i className="hgi-stroke hgi-rocket-01" /> Deploy now</Link>
        </div>
      </div>

      <main>

        {/* Hero — enhanced with Sites callout */}
        <section className="lp-hero">
          <div className="lp-shell">
            <div className="lp-badge lp-anim-fade-up" style={{ animationDelay: '0ms' }}>
              <span className="lp-badge-dot" />
              Live on Shelbynet
              <span className="lp-badge-arrow">→</span>
              <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-badge-link">View source</a>
              <span style={{ width: 1, height: 12, background: 'rgba(23,21,20,0.12)', margin: '0 2px' }} />
              <span style={{ color: 'var(--coral)', fontWeight: 600 }}>NEW</span>
              <Link to="/app/sites" style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><i className="hgi-stroke hgi-globe-02" style={{ fontSize: 12 }} /> Shelby Sites</Link>
            </div>
            <h1 className="lp-h1 lp-anim-fade-up" style={{ animationDelay: '80ms' }}>
              Your fleet runs what<br />
              <span className="lp-accent">you approved.</span><br />
              <span className="lp-scribble">Provably.</span>
            </h1>
            <p className="lp-sub lp-anim-fade-up" style={{ animationDelay: '160ms' }}>
              Provenode gives every AI model a SHA-256 identity, publishes it as an immutable Shelby object, and enforces hash verification on every device before activation. Now also deploy <b style={{ color: 'var(--text-primary)' }}>websites to Shelby</b> — ZIP in, immutable blobs out, served at <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--coral)' }}>/s/your-site</span>.
            </p>
            <div className="lp-hero-cta lp-anim-fade-up" style={{ animationDelay: '240ms' }}>
              <Link to="/app/dashboard" className="lp-btn lp-btn-primary">Open console <i className="hgi-stroke hgi-arrow-right-01" /></Link>
              <a href="#sites" className="lp-btn lp-btn-outline"><i className="hgi-stroke hgi-globe-02" /> Deploy a site</a>
            </div>
            <div className="lp-hero-note lp-anim-fade-up" style={{ animationDelay: '320ms' }}>
              <i className="hgi-stroke hgi-shield-01" /> SOC 2 ready · EU AI Act Art. 13 · Aptos on-chain verified · <span style={{ color: 'var(--green)', fontWeight: 600 }}>No credit card</span>
            </div>
          </div>
        </section>

        {/* Marquee */}
        <div className="lp-marquee-container">
          <div className="lp-marquee-content">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="lp-marquee-track">
                <span>✦ Powered by Aptos</span>
                <span>✦ Secured by Shelby Protocol</span>
                <span>✦ Built for EU AI Act</span>
                <span>✦ Zero-Knowledge Verified</span>
                <span>✦ Autonomous Edge Healing</span>
                <span>✦ Shelby Sites — Static hosting on blobs</span>
              </div>
            ))}
          </div>
        </div>

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
                {['#','Model artifact','Shelby object','Region','Verification','Rollout'].map(h => (<div key={h} className="lp-th">{h}</div>))}
                {[
                  { n:1, name:'Vision Edge v2.4.1', obj:'0x73ab…20f1', region:'Singapore', icon:'hgi-ai-brain-01', verified:true, rollout:'64%' },
                  { n:2, name:'Drone Nav v3.2', obj:'0xe871…b019', region:'Bengaluru', icon:'hgi-drone', verified:true, rollout:'Complete' },
                  { n:3, name:'Safety Adapter v0.9', obj:'Pending', region:'Frankfurt', icon:'hgi-machine-robot',verified:false, rollout:'—' },
                ].map(row => (
                  <React.Fragment key={row.n}>
                    <div className="lp-td lp-num">{row.n}</div>
                    <div className="lp-td"><span className="lp-mico"><i className={`hgi-stroke ${row.icon}`}/></span><strong>{row.name}</strong></div>
                    <div className="lp-td lp-mono">{row.obj}</div>
                    <div className="lp-td">{row.region}</div>
                    <div className="lp-td">{row.verified ? <span className="lp-tag lp-tag-green"><i className="hgi-stroke hgi-tick-01"/>Verified</span> : <span className="lp-tag lp-tag-yellow">Staged</span>}</div>
                    <div className="lp-td">{row.rollout === '64%' ? <><div className="lp-bar"><div className="lp-fill"/></div><span style={{fontSize:10,marginLeft:4,fontFamily:'var(--font-mono)'}}>64%</span></> : <span style={{fontSize:11,color:'var(--text-faint)'}}>{row.rollout}</span>}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="lp-board-floats">
            <div className="lp-float lp-float-a lp-reveal lp-d1"><strong><i className="hgi-stroke hgi-alert-02" /> Canary paused</strong>Digest mismatch on CAM-SIN-042</div>
            <div className="lp-float lp-float-b lp-reveal lp-d2"><strong><i className="hgi-stroke hgi-checkmark-circle-02" /> 248 devices</strong>Verified across 4 regions</div>
          </div>
        </div>

        {/* Stats */}
        <section className="lp-stats-section lp-reveal">
          <div className="lp-shell lp-stats">
            <div className="lp-stat"><span className="lp-stat-n" data-count="248">0</span><span className="lp-stat-l">edge devices</span></div>
            <div className="lp-stat-div" />
            <div className="lp-stat"><span className="lp-stat-n" data-count="99.99" data-suffix="%" data-float="1">0%</span><span className="lp-stat-l">integrity rate</span></div>
            <div className="lp-stat-div" />
            <div className="lp-stat"><span className="lp-stat-n" data-count="4">0</span><span className="lp-stat-l">global regions</span></div>
            <div className="lp-stat-div" />
            <div className="lp-stat"><span className="lp-stat-n" data-count="25">0</span><span className="lp-stat-l">API endpoints</span></div>
          </div>
        </section>

        {/* Trusted by — logo wall */}
        <section className="lp-section" style={{ padding: '28px 0 0' }}>
          <div className="lp-shell lp-reveal">
            <p className="lp-int-label" style={{ marginBottom: 18 }}>Trusted by teams building on Aptos & Shelby</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, opacity: 0.7 }}>
              {['APTOS LABS', 'SHELBY', 'AETHER', 'NOVA FLEET', 'EDGEWORKS', 'CIPHER AI'].map(logo => (
                <div key={logo} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>{logo}</div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works — 3 steps SaaS */}
        <section className="lp-section lp-reveal" id="how">
          <div className="lp-shell">
            <div className="lp-sec-head">
              <p className="lp-kicker">How it works</p>
              <h2 className="lp-h2">Three steps to provable delivery.</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { n: '01', icon: 'hgi-fingerprint-scan', title: 'Hash & anchor', desc: 'Upload your model or site ZIP. We SHA-256 every byte and publish it as an immutable Shelby blob. Passports and manifests are anchored on Aptos.' },
                { n: '02', icon: 'hgi-rocket-01', title: 'Deploy with proof', desc: 'Canary rollout to 10% → 50% → 100% with auto-rollback. For sites: /s/your-slug is live instantly. For models: fleet OTA begins.' },
                { n: '03', icon: 'hgi-shield-02', title: 'Verify at the edge', desc: 'Devices re-hash before activation. Mismatch = no load, incident logged, heal command issued. Websites are content-addressed — what you deployed is what is served.' },
              ].map(s => (
                <div key={s.n} className="card" style={{ padding: 22 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)', fontWeight: 600, marginBottom: 8 }}>{s.n}</div>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><i className={`hgi-stroke ${s.icon}`} style={{ fontSize: 18 }} /></div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Terminal */}
        <section className="lp-terminal-section lp-reveal" id="terminal">
          <div className="lp-shell">
            <div className="lp-terminal-wrap">
              <div className="lp-terminal-bar"><div className="lp-dots lp-dots-dark"><span/><span/><span/></div><span className="lp-terminal-title">provenode cli</span></div>
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
                <p className="lp-problem-p">When you deploy a new model to 248 edge devices, there is no reliable way to prove every device received the exact file you approved. Filenames change. CDN caches corrupt. Partial downloads happen silently.</p>
                <p className="lp-problem-p">The standard answer is "trust the orchestrator" — which means trusting a database that can be edited. Shelby objects cannot. That is the difference.</p>
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
                <div className="lp-proof-top"><b>Proof of deployment</b><span className="lp-tag lp-tag-green"><i className="hgi-stroke hgi-tick-01"/> VERIFIED</span></div>
                <div className="lp-proof-body">
                  {[
                    ['Model', 'vision-edge-v2.4.1.onnx'],
                    ['Shelby object', 'shelby://shelbynet/models/vision/2.4.1'],
                    ['SHA-256', '9e4a7c81d2bf…b82f'],
                    ['Aptos contract', '0x77f8cb3d…87cb'],
                    ['Activation rule', 'Digest must match manifest'],
                  ].map(([k, v]) => (<div className="lp-proof-row" key={k}><span className="lp-proof-k">{k}</span><span className="lp-proof-v lp-mono">{v}</span></div>))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="lp-section lp-section-light" id="features">
          <div className="lp-shell">
            <div className="lp-sec-head lp-reveal"><p className="lp-kicker">Built-in features</p><h2 className="lp-h2">Everything for verified edge AI delivery.</h2></div>
            <div className="lp-features-6">
              {[
                { icon:'hgi-fingerprint-scan', title:'SHA-256 identity', desc:'Every model is content-addressed. Hash is the identity, not the filename.' },
                { icon:'hgi-route-01', title:'Canary rollouts', desc:'10% → 50% → 100% with automatic rollback if error rate exceeds threshold.' },
                { icon:'hgi-shield-energy', title:'Activation enforcement', desc:'Devices re-hash the download and compare to signed manifest. No match = no load.' },
                { icon:'hgi-blockchain-01', title:'On-chain manifests', desc:'Deployment decisions uploaded to Shelby as immutable objects. Auditors go to the chain.' },
                { icon:'hgi-analytics-01', title:'A/B model testing', desc:'Split fleet traffic between versions, measure latency and error per device.' },
                { icon:'hgi-git-branch', title:'Model lineage', desc:'Track parent → child. Catch when a recalled base model is still in production.' },
                { icon:'hgi-shield-tick', title:'ZK Execution Proofs', desc:'NIZKPoK benchmark proofs verify execution without exposing weights.' },
                { icon:'hgi-cpu', title:'Autonomous Self-Healing',desc:'Tamper detected → halt, log breach, request clean OTA payload.' },
                { icon:'hgi-network', title:'Federated Learning', desc:'Aggregates gradients via Float32 tensor math without exposing user data.' },
              ].map((f, i) => (
                <article className={`lp-feat lp-reveal lp-d${i % 3}`} key={f.title}>
                  <div className="lp-feat-icon"><i className={`hgi-stroke ${f.icon}`}/></div>
                  <h3>{f.title}</h3><p>{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Shelby Sites — new SaaS feature */}
        <section className="lp-section lp-reveal" id="sites">
          <div className="lp-shell">
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 0 }}>
              <div style={{ padding: 32 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(232,90,40,0.08)', border: '1px solid rgba(232,90,40,0.18)', borderRadius: 9999, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--coral)', letterSpacing: '0.06em', textTransform: 'uppercase' }}><i className="hgi-stroke hgi-sparkles" /> New · Shelby Sites</div>
                <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 12 }}>Deploy websites to Shelby — <span style={{ color: 'var(--coral)' }}>like Neon, for static.</span></h2>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 18 }}>ZIP your <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>dist/</span> and every file becomes an immutable Shelby blob. Preview at <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>/s/your-site</span> with SPA fallback, 60s edge cache, and audit-logged manifests. Pair with Neon for your DB — Shelby for assets, Postgres for state.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {['ZIP → Shelby blobs (200 files, 40MB)', 'Content-addressed, SHA-256 per file, manifest blob', '90-day anchored, auto-renewed · /s/:slug public URL'].map(t => (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--green-wash)', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}><i className="hgi-stroke hgi-tick-01" /></span>{t}</div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to="/app/sites" className="lp-btn lp-btn-primary"><i className="hgi-stroke hgi-globe-02" /> Deploy a site</Link>
                  <a href="/api/sites" target="_blank" rel="noreferrer" className="lp-btn lp-btn-ghost"><i className="hgi-stroke hgi-code" /> API docs</a>
                </div>
              </div>
              <div style={{ background: '#0a0a0a', padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: '1px solid var(--border)' }}>
                <div style={{ background: '#1a1a1a', borderRadius: 12, border: '1px solid #2a2a2a', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #2a2a2a' }}>
                    <div style={{ display: 'flex', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} /><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} /><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} /></div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8a857a' }}>deploy.sh</span>
                  </div>
                  <pre style={{ margin: 0, padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, color: '#d6d2c6', whiteSpace: 'pre-wrap' }}>{`$ zip -r site.zip dist/
$ curl -H "X-Provenode-Token: $TOKEN" \\
  -F file=@site.zip \\
  https://provenode/api/sites/$SITE/deploy

✓ 42 files → Shelby blobs
✓ Live at /s/my-portfolio
✓ Manifest: sites/my-portfolio/dep_…/__manifest.json`}</pre>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, fontSize: 11, color: '#8a857a', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ background: 'rgba(232,90,40,0.15)', color: '#ff8a5c', padding: '3px 8px', borderRadius: 9999 }}>/s/my-portfolio → 200</span>
                  <span style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 9999 }}>SPA fallback ✓</span>
                  <span style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 9999 }}>MIME auto</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="lp-section lp-reveal">
          <div className="lp-shell">
            <div className="lp-sec-head"><p className="lp-kicker">Use cases</p><h2 className="lp-h2">One platform, three fleets.</h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { icon: 'hgi-robot-01', title: 'Robotics', desc: 'Push perception models to warehouse AMRs. Verify on-device before navigation starts. Rollback fleet-wide in seconds.', stat: '12k robots' },
                { icon: 'hgi-video-01', title: 'Smart cameras', desc: 'City-scale camera fleets with EU AI Act audit trails. Every model version anchored, every device attested.', stat: '248 cameras' },
                { icon: 'hgi-drone', title: 'Drones & UAVs', desc: 'Safety-critical navigation updates with autonomous self-healing. Tamper = auto-heal from Shelby.', stat: '4 regions' },
              ].map(u => (
                <div key={u.title} className="card" style={{ padding: 22 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--coral)', marginBottom: 14 }}><i className={`hgi-stroke ${u.icon}`} style={{ fontSize: 20 }} /></div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{u.title}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>{u.desc}</p>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{u.stat} →</div>
                </div>
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
                <p className="lp-code-p">Three lines to upload, deploy, and wait for verification. The SDK handles SHA-256, Shelby upload, canary rollout, and device polling. Now also deploy sites.</p>
                <div className="lp-code-bullets">
                  {['pip install provenode-sdk', 'Supports HuggingFace Hub import', 'GitHub Action included in repo'].map(b => (
                    <div className="lp-code-bullet" key={b}><i className="hgi-stroke hgi-tick-01"/><span>{b}</span></div>
                  ))}
                </div>
              </div>
              <div className="lp-code-block">
                <div className="lp-code-top"><div className="lp-dots lp-dots-dark"><span/><span/><span/></div><span className="lp-code-lang">Python</span></div>
                <pre className="lp-pre"><code>{CODE_SAMPLE}</code></pre>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing — SaaS */}
        <section className="lp-section lp-reveal" id="pricing">
          <div className="lp-shell">
            <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 36px' }}>
              <p className="lp-kicker" style={{ justifyContent: 'center' }}>Pricing</p>
              <h2 className="lp-h2">Start free. Scale when you ship.</h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>All plans include Shelby Sites. Pay only for what you anchor and serve. No seat fees.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'stretch' }}>
              {[
                { name: 'Starter', price: '$0', suffix: '/mo', desc: 'For prototypes & personal sites', cta: 'Start free', featured: false, features: ['3 sites · 10 deployments', '1,000 model verifications / mo', 'Community Discord', '90-day Shelby blobs'] },
                { name: 'Pro', price: '$49', suffix: '/mo', desc: 'For teams shipping to fleets', cta: 'Start Pro trial', featured: true, badge: 'Most popular', features: ['Unlimited sites & deploys', '100k verifications / mo', 'Canary + Blue-Green + A/B locks', 'Webhooks, audit log, SSO', 'Email support < 24h'] },
                { name: 'Enterprise', price: 'Custom', suffix: '', desc: 'For regulated fleets & SOC 2', cta: 'Talk to founders', featured: false, features: ['Everything in Pro', 'Dedicated Shelbynet namespace', 'On-prem signer & VPC', 'EU AI Act export & DPA', 'Slack Connect + 99.9% SLA'] },
              ].map(tier => (
                <div key={tier.name} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', background: tier.featured ? '#0a0a0a' : 'var(--surface)', color: tier.featured ? '#f5f5f0' : 'var(--text-primary)', borderColor: tier.featured ? '#1a1a1a' : 'var(--border)', position: 'relative', transform: tier.featured ? 'scale(1.02)' : 'none', boxShadow: tier.featured ? '0 20px 60px rgba(10,10,10,0.25)' : 'none' }}>
                  {tier.badge && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--coral)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 9999 }}>{tier.badge}</div>}
                  <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: tier.featured ? '#a8a29a' : 'var(--text-muted)' }}>{tier.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '10px 0 6px' }}>
                    <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em' }}>{tier.price}</span>
                    <span style={{ fontSize: 13, color: tier.featured ? '#7a7672' : 'var(--text-muted)' }}>{tier.suffix}</span>
                  </div>
                  <div style={{ fontSize: 13, color: tier.featured ? '#7a7672' : 'var(--text-muted)', marginBottom: 18, minHeight: 20 }}>{tier.desc}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22, flex: 1 }}>
                    {tier.features.map(f => (
                      <div key={f} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.5 }}>
                        <span style={{ color: tier.featured ? '#4ade80' : 'var(--green)', marginTop: 1 }}><i className="hgi-stroke hgi-tick-01" style={{ fontSize: 14 }} /></span>
                        <span style={{ color: tier.featured ? '#d6d2cc' : 'var(--text-primary)' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <Link to={tier.name === 'Enterprise' ? 'mailto:founders@provenode.xyz' : '/app/dashboard'} className="btn" style={{ width: '100%', justifyContent: 'center', background: tier.featured ? '#f5f5f0' : 'var(--text-primary)', color: tier.featured ? '#0a0a0a' : '#fff', borderColor: tier.featured ? '#f5f5f0' : 'var(--text-primary)' }}>{tier.cta}</Link>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>All plans include Shelby Sites static hosting · Overages billed via ShelbyUSD micropayments · <a href="/docs/" style={{ color: 'var(--coral)' }}>See full pricing →</a></div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="lp-section" style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div className="lp-shell lp-reveal">
            <div className="lp-sec-head" style={{ marginBottom: 28 }}><p className="lp-kicker">Loved by fleet teams</p><h2 className="lp-h2">Proof beats promises.</h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { quote: 'We cut incident MTTR from hours to 90 seconds. The on-chain manifest is now our audit source of truth.', name: 'Ava Chen', role: 'Head of Edge ML · Aether', avatar: 'AC' },
                { quote: 'Deploying our docs to Shelby Sites was one ZIP. No S3 bucket policy to misconfigure, no CloudFront invalidation.', name: 'Marcus Reid', role: 'Staff Engineer · Nova Fleet', avatar: 'MR' },
                { quote: 'Canary + lineage caught a recalled LoRA still serving in prod. Without Provenode we would have shipped it.', name: 'Priya Nair', role: 'ML Platform · Edgeworks', avatar: 'PN' },
              ].map(t => (
                <div key={t.name} className="card" style={{ padding: 22 }}>
                  <div style={{ display: 'flex', gap: 2, color: '#f59e0b', marginBottom: 12, fontSize: 14 }}>★★★★★</div>
                  <p style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 16 }}>"{t.quote}"</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--text-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{t.avatar}</div>
                    <div><div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.role}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="lp-section lp-reveal">
          <div className="lp-shell">
            <div className="lp-sec-head"><p className="lp-kicker">Why not just S3 + DB?</p><h2 className="lp-h2">Databases can be edited. Shelby blobs cannot.</h2></div>
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                  <thead><tr style={{ background: 'var(--bg)' }}>{['', 'Provenode + Shelby', 'Traditional orchestrator'].map(h => (<th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>))}</tr></thead>
                  <tbody>
                    {[
                      ['Provenance', 'SHA-256 + Shelby manifest + Aptos anchor', 'Filename in Postgres'],
                      ['Tamper detection', 'Device re-hash, auto-heal, incident log', 'Polling, hope'],
                      ['Site hosting', 'ZIP → immutable blobs at /s/slug', 'S3 bucket + CloudFront'],
                      ['Audit', 'On-chain, content-addressed', 'DB dump, trust us'],
                      ['Expiry', '90d renewable, cron-backed', 'Manual lifecycle'],
                    ].map(([k, a, b]) => (
                      <tr key={k}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>{k}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--green)', fontWeight: 600 }}><i className="hgi-stroke hgi-tick-01" /> {a}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                { icon: 'hgi-github', label: 'GitHub Actions' },
                { icon: 'hgi-blockchain-01', label: 'Shelbynet' },
                { icon: 'hgi-ai-brain-01', label: 'HuggingFace Hub' },
                { icon: 'hgi-shield-01', label: 'Aptos Move' },
                { icon: 'hgi-globe-02', label: 'Shelby Sites' },
                { icon: 'hgi-notification-02',label: 'Webhooks' },
                { icon: 'hgi-analytics-01', label: 'Prometheus' },
                { icon: 'hgi-database-01', label: 'Neon / Postgres' },
              ].map(({ icon, label }) => (
                <div className="lp-int-item" key={label}><i className={`hgi-stroke ${icon}`} /><span>{label}</span></div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-section lp-reveal" id="faq">
          <div className="lp-shell" style={{ maxWidth: 760 }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}><p className="lp-kicker" style={{ justifyContent: 'center' }}>FAQ</p><h2 className="lp-h2">Answers, not hand-waving.</h2></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FAQS.map((f, i) => (
                <div key={f.q} className="card" style={{ overflow: 'hidden' }}>
                  <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: faqOpen === i ? 'var(--text-primary)' : 'var(--bg)', color: faqOpen === i ? '#fff' : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, transition: 'all .2s' }}>{faqOpen === i ? '−' : '+'}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{f.q}</span>
                  </button>
                  {faqOpen === i && <div style={{ padding: '0 18px 16px 58px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65 }}>{f.a}</div>}
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
              <p>Deploy your first model — or your first site — in under 5 minutes. Free. Open source.</p>
              <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
                <Link to="/app/dashboard" className="lp-btn lp-btn-primary"><i className="hgi-stroke hgi-dashboard-square-01"/> Open console</Link>
                <Link to="/app/sites" className="lp-btn lp-btn-ghost" style={{background:'rgba(250,250,248,.08)',borderColor:'rgba(250,250,248,.22)',color:'#F2EFE9'}}><i className="hgi-stroke hgi-globe-02"/> Deploy a site</Link>
                <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-btn lp-btn-ghost" style={{background:'rgba(250,250,248,.08)',borderColor:'rgba(250,250,248,.22)',color:'#F2EFE9'}}><i className="hgi-stroke hgi-github"/> Star on GitHub</a>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer-inner">
          <div className="lp-footer-brand"><img src="/provenode-logo.svg" alt="Provenode" className="lp-footer-logo" /><b>Provenode</b></div>
          <span className="lp-footer-tag">Verified AI model delivery · Shelbynet + Aptos · Shelby Sites hosting</span>
          <div className="lp-footer-links">
            <a href="/docs/" target="_blank" rel="noreferrer"><i className="hgi-stroke hgi-book-open-01"/> Docs</a>
            <a href="https://x.com/provenode" target="_blank" rel="noreferrer"><i className="hgi-stroke hgi-twitter"/> X @provenode</a>
            <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer"><i className="hgi-stroke hgi-github"/> GitHub</a>
            <Link to="/app/sites">Sites</Link>
            <Link to="/app/dashboard">Console</Link>
            <a href="https://explorer.aptoslabs.com/account/0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18?network=custom&customNetworkUrl=https%3A%2F%2Fapi.shelbynet.shelby.xyz%2Fv1" target="_blank" rel="noreferrer">Contract</a>
          </div>
        </div>
      </footer>

    </div>
  );
}

