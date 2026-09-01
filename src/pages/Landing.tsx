import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LatticeBackground from '../components/LatticeBackground';

const CODE_SAMPLE = `from provenode import ProvenodeClient

client = ProvenodeClient(api_url="https://provenode.app")

# Upload to Shelbynet, SHA-256 registered on Aptos
model = client.upload("model.onnx", name="ResNet-v2")
print(model.sha256)

# Deploy to fleet — devices verify before loading
dep = client.deploy(model.id, region="Global")
print(dep.status)  # "verified"

# Deploy a website to Shelby — like Vercel, decentralized
site = client.sites.create("my-portfolio")
client.sites.deploy(site.id, "./dist.zip")
print(f"Live at /s/{site.slug}")`;

const FAQS = [
  { q: 'How is Shelby Sites different from Vercel or Netlify?', a: 'Vercel and Netlify store your files on centralized S3/GCS buckets. Shelby Sites stores every file as an immutable Shelby blob on Aptos — content-addressed and anchored for 90 days. Your site is verifiable: anyone can fetch the manifest blob and check SHA-256s. Same ZIP-in deploy flow, fundamentally different trust model.' },
  { q: 'Can I deploy a Next.js, Vite, or Astro site?', a: 'Yes. Run your static export (next build, vite build, astro build), ZIP the output folder (dist/, out/, build/), and upload it. We auto-detect index.html, set correct MIME types per file, and fall back to index.html for SPA routing.' },
  { q: 'Is this a Neon replacement?', a: 'No — and that is the point. Shelby is blob storage, not Postgres. Use Shelby Sites for your frontend and immutable assets, and pair it with Neon or Upstash for mutable state. The Sites console explains exactly where each piece belongs.' },
  { q: 'How long do sites stay live?', a: 'Every Shelby blob is anchored for 90 days. A cron re-anchors manifests before expiry and you get an email warning a week ahead. Sites with traffic renew automatically — no manual work.' },
  { q: 'How do custom domains work?', a: 'Today every site gets a public /s/your-slug URL. Custom domains via a CNAME + automatic TLS are on the roadmap — join the waitlist from the Sites console.' },
  { q: 'Is it really on-chain verifiable?', a: 'Yes. Every deployment manifest is itself a Shelby blob. Fetch it and you get the full file list with SHA-256s and objectIds. Compare the hash of any served file against the manifest — a mismatch means tampering. The manifest blobId is also written to your audit log.' },
];

const AVATARS = [
  { icon: 'hgi-ai-brain-01',  label: 'Vision models' },
  { icon: 'hgi-drone',        label: 'Drones' },
  { icon: 'hgi-cpu',          label: 'Edge devices' },
  { icon: 'hgi-video-01',     label: 'Cameras' },
  { icon: 'hgi-robotic',     label: 'Robotics' },
  { icon: 'hgi-shield-02',    label: 'Verification' },
  { icon: 'hgi-globe-02',     label: 'Shelby Sites' },
];

export default function Landing() {
  const ref = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    ref.current?.querySelectorAll('.lp-reveal').forEach(el => io.observe(el));

    const nav = document.querySelector('.lp-nav') as HTMLElement | null;
    const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 8);
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
        const dur = 1400;
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
        '  ok  SHA-256: 9e4a7c81d2bf..b82f',
        '  ok  Shelby object: shelby://shelbynet/models/resnet-v2',
        '  ok  Registered on Shelbynet - block 10356365905',
        '',
        '$ provenode deploy --model resnet-v2 --region Global',
        '  ..  pushing to 248 devices',
        '  ok  248/248 verified',
        '',
        '$ provenode site deploy --site my-portfolio --zip ./dist.zip',
        '  ok  42 files -> Shelby blobs',
        '  ok  live at /s/my-portfolio',
      ];
      let li = 0, ci = 0;
      terminal.textContent = '';
      const type = () => {
        if (li >= lines.length) return;
        const line = lines[li];
        if (ci <= line.length) {
          terminal.textContent = lines.slice(0, li).join('\n') + (li > 0 ? '\n' : '') + line.slice(0, ci);
          ci++;
          setTimeout(type, ci === 1 && li > 0 ? 160 : 20);
        } else { li++; ci = 0; setTimeout(type, 300); }
      };
      const tio = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { type(); tio.disconnect(); }
      }, { threshold: 0.4 });
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
      <LatticeBackground />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand">
            <span className="lp-mark"><img src="/provenode-logo.svg" alt="" /></span>
            Provenode
          </Link>
          <nav className="lp-nav-links">
            <a href="#features" className="lp-navlink">Features</a>
            <a href="#sites" className="lp-navlink">Sites</a>
            <a href="#faq" className="lp-navlink">FAQ</a>
            <a href="/docs/" target="_blank" rel="noreferrer" className="lp-navlink">Docs</a>
            <a href="https://x.com/provenode" target="_blank" rel="noreferrer" className="lp-navlink lp-gh" aria-label="X (Twitter)"><i className="hgi-stroke hgi-twitter" /></a>
            <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-navlink lp-gh" aria-label="GitHub"><i className="hgi-stroke hgi-github" /></a>
            <span className="lp-nav-sep" aria-hidden="true" />
            <Link to="/login" className="lp-btn lp-btn-outline">Log in</Link>
            <Link to="/app/dashboard" className="lp-btn lp-btn-primary">Get started <i className="hgi-stroke hgi-arrow-right-01" /></Link>
          </nav>
          <button className={`lp-hamburger${menuOpen ? ' open' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <span /><span /><span />
          </button>
        </div>
      </header>

      {/* Mobile menu — full sheet */}
      <div className={`lp-mobile-nav${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
        <a href="#features" onClick={() => setMenuOpen(false)}><i className="hgi-stroke hgi-dashboard-square-01" /> Features</a>
        <a href="#sites" onClick={() => setMenuOpen(false)}><i className="hgi-stroke hgi-globe-02" /> Shelby Sites</a>
        <a href="#faq" onClick={() => setMenuOpen(false)}><i className="hgi-stroke hgi-information-circle" /> FAQ</a>
        <a href="/docs/" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}><i className="hgi-stroke hgi-book-open-01" /> Docs</a>
        <a href="https://x.com/provenode" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}><i className="hgi-stroke hgi-twitter" /> X @provenode</a>
        <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}><i className="hgi-stroke hgi-github" /> GitHub</a>
        <div className="lp-mobile-divider" />
        <div className="lp-mobile-ctas">
          <Link to="/login" className="lp-btn lp-btn-outline" onClick={() => setMenuOpen(false)}>Log in</Link>
          <Link to="/app/dashboard" className="lp-btn lp-btn-primary" onClick={() => setMenuOpen(false)}>Get started <i className="hgi-stroke hgi-arrow-right-01" /></Link>
        </div>
      </div>

      <main>

        {/* ── Hero — avatars → headline w/ pill → serif subhead → CTAs → mockup ── */}
        <section className="lp-hero">
          <div className="lp-shell">
            <div className="lp-avatars lp-anim-fade-up">
              {AVATARS.map((a, i) => (
                <span className="lp-avatar" key={i} style={{ ['--i' as string]: i } as React.CSSProperties} title={a.label} aria-label={a.label}>
                  <i className={`hgi-stroke ${a.icon}`} style={{ fontSize: 19 }} />
                </span>
              ))}
            </div>

            <h1 className="lp-h1 lp-anim-fade-up" style={{ animationDelay: '60ms' }}>
              Your fleet runs what you <span className="lp-hl">approved</span> — <span className="lp-hl lp-hl--blue">provably.</span>
            </h1>

            <p className="lp-sub lp-anim-fade-up" style={{ animationDelay: '120ms' }}>
              Provenode gives every AI model a SHA-256 identity, publishes it as an
              immutable Shelby object, and enforces hash verification on every device
              before activation. Now you can deploy whole websites to Shelby too.
            </p>

            <div className="lp-hero-cta lp-anim-fade-up" style={{ animationDelay: '180ms' }}>
              <Link to="/app/dashboard" className="lp-btn lp-btn-primary">
                Start deploying <i className="hgi-stroke hgi-arrow-right-01" />
              </Link>
              <Link to="/app/sites" className="lp-btn lp-btn-ghost">
                <i className="hgi-stroke hgi-globe-02" /> Deploy a site
              </Link>
            </div>
            <div className="lp-hero-note lp-anim-fade-up" style={{ animationDelay: '240ms' }}>
              <i className="hgi-stroke hgi-shield-01" /> Free to start · No credit card · EU AI Act ready
            </div>

            {/* Product mockup — the one shadowed surface */}
            <div className="lp-mockup-wrap lp-reveal">
              <div className="lp-mockup">
                <div className="lp-wbar">
                  <div className="lp-dots"><span /><span /><span /></div>
                  <span className="lp-wtitle">Production rollout · Vision Edge v2.4.1 · Global camera fleet</span>
                  <span className="lp-live">Live</span>
                </div>
                <div className="lp-scroll">
                  <div className="lp-grid-6">
                    {['#', 'Model', 'Shelby object', 'Region', 'Verification', 'Rollout'].map(h => <div key={h} className="lp-th">{h}</div>)}
                    {[
                      { n: 1, name: 'Vision Edge v2.4.1', obj: '0x73ab..20f1', region: 'Singapore', icon: 'hgi-ai-brain-01', verified: true, rollout: '64%' },
                      { n: 2, name: 'Drone Nav v3.2', obj: '0xe871..b019', region: 'Bengaluru', icon: 'hgi-drone', verified: true, rollout: 'Done' },
                      { n: 3, name: 'Safety Adapter v0.9', obj: 'Pending', region: 'Frankfurt', icon: 'hgi-machine-robot', verified: false, rollout: '—' },
                    ].map(row => (
                      <React.Fragment key={row.n}>
                        <div className="lp-td lp-num">{row.n}</div>
                        <div className="lp-td"><span className="lp-mico"><i className={`hgi-stroke ${row.icon}`} /></span><strong>{row.name}</strong></div>
                        <div className="lp-td lp-mono">{row.obj}</div>
                        <div className="lp-td">{row.region}</div>
                        <div className="lp-td">
                          {row.verified
                            ? <span className="lp-tag lp-tag-green"><i className="hgi-stroke hgi-tick-01" /> Verified</span>
                            : <span className="lp-tag lp-tag-yellow">Staged</span>}
                        </div>
                        <div className="lp-td">
                          {row.rollout === '64%'
                            ? <><div className="lp-bar"><div className="lp-fill" /></div><span style={{ fontSize: 11, marginLeft: 4 }}>64%</span></>
                            : <span style={{ fontSize: 12, color: 'var(--nt-stone)' }}>{row.rollout}</span>}
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
          </div>
        </section>

        {/* ── Marquee ─────────────────────────────────────────── */}
        <section className="lp-marquee-container" aria-hidden="true">
          <div className="lp-marquee-content">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="lp-marquee-track">
                <span>Powered by Aptos</span>
                <span>Secured by Shelby Protocol</span>
                <span>Built for EU AI Act</span>
                <span>Zero-knowledge verified</span>
                <span>Autonomous edge healing</span>
                <span>Shelby Sites static hosting</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Logo wall ──────────────────────────────────────── */}
        <section className="lp-logos lp-reveal">
          <div className="lp-shell">
            <p className="lp-int-label">Trusted by teams building on Aptos & Shelby</p>
            <div className="lp-grid-6logos">
              {['APTOS LABS', 'SHELBY', 'AETHER', 'NOVA FLEET', 'EDGEWORKS', 'CIPHER AI'].map(l => <div key={l}>{l}</div>)}
            </div>
          </div>
        </section>

        {/* ── Stats strip ─────────────────────────────────────── */}
        <section className="lp-section" style={{ paddingTop: 8 }}>
          <div className="lp-shell lp-reveal">
            <div className="lp-stats">
              <div className="lp-stat"><span className="lp-stat-n" data-count="248">0</span><span className="lp-stat-l">edge devices</span></div>
              <div className="lp-stat-div" />
              <div className="lp-stat"><span className="lp-stat-n" data-count="99.99" data-suffix="%" data-float="1">0%</span><span className="lp-stat-l">integrity rate</span></div>
              <div className="lp-stat-div" />
              <div className="lp-stat"><span className="lp-stat-n" data-count="4">0</span><span className="lp-stat-l">global regions</span></div>
              <div className="lp-stat-div" />
              <div className="lp-stat"><span className="lp-stat-n" data-count="25">0</span><span className="lp-stat-l">API endpoints</span></div>
            </div>
          </div>
        </section>

        {/* ── How it works — accent sticky notes ──────────────── */}
        <section className="lp-section lp-reveal" id="how">
          <div className="lp-shell">
            <div className="lp-sec-head">
              <p className="lp-kicker">How it works</p>
              <h2 className="lp-h2">Three steps to <span className="lp-hl">provable</span> delivery.</h2>
              <p className="lp-sub-intro">From upload to on-device verification — every step leaves a cryptographic trail on Shelbynet.</p>
            </div>
            <div className="lp-grid-3">
              {[
                { cls: 'lp-card--marigold', n: '01', icon: 'hgi-fingerprint-scan', title: 'Hash & anchor', desc: 'Upload your model or site ZIP. We SHA-256 every byte and publish it as an immutable Shelby blob, anchored on Aptos.' },
                { cls: 'lp-card--coral', n: '02', icon: 'hgi-rocket-01', title: 'Deploy with proof', desc: 'Canary rollout 10% → 50% → 100% with automatic rollback. Sites go live instantly at /s/your-slug.' },
                { cls: 'lp-card--sky', n: '03', icon: 'hgi-shield-02', title: 'Verify at the edge', desc: 'Devices re-hash before activation. Mismatch = no load, incident logged, heal command issued automatically.' },
              ].map(s => (
                <div key={s.n} className={`lp-card ${s.cls}`}>
                  <span className="lp-step-num" style={{ color: 'inherit', opacity: 0.6 }}>{s.n}</span>
                  <div className="lp-card-icon" style={{ background: 'rgba(255,255,255,0.45)' }}><i className={`hgi-stroke ${s.icon}`} /></div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Shelby Sites split — white card, marigold terminal ── */}
        <section className="lp-section lp-reveal" id="sites">
          <div className="lp-shell">
            <div className="lp-sites-split">
              <div className="lp-sites-copy">
                <p className="lp-kicker">New · Shelby Sites</p>
                <h2 className="lp-h2">Deploy websites to <span className="lp-hl">Shelby</span>.</h2>
                <p className="lp-sub-intro" style={{ margin: 0 }}>
                  ZIP your dist/ folder and every file becomes an immutable Shelby blob.
                  Preview at /s/your-site with SPA fallback, 60-second edge cache, and
                  audit-logged manifests. Pair with Neon for your database — Shelby for
                  assets, Postgres for state.
                </p>
                <div className="lp-check-list">
                  <div><i className="hgi-stroke hgi-tick-01" /> ZIP → Shelby blobs · 200 files, 40MB per deploy</div>
                  <div><i className="hgi-stroke hgi-tick-01" /> Content-addressed — SHA-256 per file, manifest blob per deploy</div>
                  <div><i className="hgi-stroke hgi-tick-01" /> 90-day anchored with automatic renewal</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to="/app/sites" className="lp-btn lp-btn-primary"><i className="hgi-stroke hgi-globe-02" /> Deploy a site</Link>
                  <a href="/api/docs" target="_blank" rel="noreferrer" className="lp-btn lp-btn-outline">API docs</a>
                </div>
              </div>
              <div className="lp-sites-terminal">
                <div className="lp-code-panel">
                  <pre>{`$ zip -r site.zip dist/
$ curl -F file=@site.zip \\
  api/sites/\$SITE/deploy

ok  42 files -> Shelby blobs
ok  live at /s/my-portfolio
ok  manifest anchored on-chain`}</pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features — white sticky notes ───────────────────── */}
        <section className="lp-section lp-reveal" id="features">
          <div className="lp-shell">
            <div className="lp-sec-head">
              <p className="lp-kicker">Everything included</p>
              <h2 className="lp-h2">One platform for verified edge AI.</h2>
              <p className="lp-sub-intro">Nine systems that would each be a vendor on their own — shipped together, anchored together.</p>
            </div>
            <div className="lp-grid-3">
              {[
                { icon: 'hgi-fingerprint-scan', title: 'SHA-256 identity', desc: 'Every model is content-addressed. The hash is the identity — not the filename.' },
                { icon: 'hgi-route-01', title: 'Canary rollouts', desc: '10% → 50% → 100% with automatic rollback past your error threshold.' },
                { icon: 'hgi-shield-energy', title: 'Activation enforcement', desc: 'Devices re-hash downloads against the signed manifest. No match, no load.' },
                { icon: 'hgi-blockchain-01', title: 'On-chain manifests', desc: 'Deployment decisions live as immutable Shelby objects. Auditors go to the chain.' },
                { icon: 'hgi-analytics-01', title: 'A/B model testing', desc: 'Split fleet traffic between versions with cryptographically locked results.' },
                { icon: 'hgi-git-branch', title: 'Model lineage', desc: 'Track parent → child. Catch a recalled base model still serving in prod.' },
                { icon: 'hgi-shield-02', title: 'ZK execution proofs', desc: 'NIZKPoK benchmarks verify execution without exposing proprietary weights.' },
                { icon: 'hgi-cpu', title: 'Autonomous self-healing', desc: 'Tamper detected → halt, log the breach, request a clean OTA payload.' },
                { icon: 'hgi-globe-02', title: 'Shelby Sites hosting', desc: 'Ship static sites to immutable blobs — push to GitHub, every file verifiable.' },
              ].map((f, i) => (
                <article className={`lp-card lp-reveal lp-d${i % 3}`} key={f.title}>
                  <div className="lp-card-icon lp-card-icon--tint"><i className={`hgi-stroke ${f.icon}`} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Terminal ───────────────────────────────────────── */}
        <section className="lp-terminal-section lp-reveal" id="terminal">
          <div className="lp-shell">
            <div className="lp-terminal-wrap">
              <div className="lp-terminal-bar">
                <div className="lp-dots lp-dots-dark"><span /><span /><span /></div>
                <span className="lp-terminal-title">provenode cli</span>
              </div>
              <pre className="lp-terminal-body"><code className="lp-terminal-text"></code><span className="lp-cursor">_</span></pre>
            </div>
          </div>
        </section>

        {/* ── Use cases ───────────────────────────────────────── */}
        <section className="lp-section lp-reveal">
          <div className="lp-shell">
            <div className="lp-sec-head">
              <p className="lp-kicker">Use cases</p>
              <h2 className="lp-h2">One platform, three fleets.</h2>
            </div>
            <div className="lp-grid-3">
              {[
                { icon: 'hgi-robotic', title: 'Robotics', desc: 'Push perception models to warehouse AMRs. Verify on-device before navigation starts. Roll back fleet-wide in seconds.', stat: '12k robots' },
                { icon: 'hgi-video-01', title: 'Smart cameras', desc: 'City-scale camera fleets with EU AI Act audit trails. Every model version anchored, every device attested.', stat: '248 cameras' },
                { icon: 'hgi-drone', title: 'Drones & UAVs', desc: 'Safety-critical navigation updates with autonomous self-healing. Tamper triggers auto-heal from Shelby.', stat: '4 regions' },
              ].map(u => (
                <div key={u.title} className="lp-card">
                  <div className="lp-card-icon lp-card-icon--tint"><i className={`hgi-stroke ${u.icon}`} /></div>
                  <h3>{u.title}</h3>
                  <p>{u.desc}</p>
                  <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 600, color: 'var(--nt-blue)' }}>{u.stat} →</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Code demo — midnight band ──────────────────────── */}
        <section className="lp-section lp-section-dark" id="code">
          <div className="lp-shell">
            <div className="lp-code-inner lp-reveal">
              <div>
                <p className="lp-kicker">Python SDK</p>
                <h2 className="lp-h2">Deploy from your CI pipeline.</h2>
                <p className="lp-code-p">
                  Three lines to upload, deploy, and wait for verification. The SDK handles
                  SHA-256, Shelby upload, canary rollout, and device polling — sites included.
                </p>
                <div className="lp-code-bullets">
                  {['pip install provenode-sdk', 'HuggingFace Hub import support', 'GitHub Action included'].map(b => (
                    <div className="lp-code-bullet" key={b}><i className="hgi-stroke hgi-tick-01" /><span>{b}</span></div>
                  ))}
                </div>
              </div>
              <div className="lp-code-block">
                <div className="lp-code-top">
                  <div className="lp-dots lp-dots-dark"><span /><span /><span /></div>
                  <span className="lp-code-lang">Python</span>
                </div>
                <pre className="lp-pre"><code>{CODE_SAMPLE}</code></pre>
              </div>
            </div>
          </div>
        </section>

        {/* ── Free for now ────────────────────────────────────── */}
        <section className="lp-section lp-reveal" id="pricing">
          <div className="lp-shell">
            <div className="lp-free-banner">
              <div className="lp-free-pill"><i className="hgi-stroke hgi-gift" /> Free while we build</div>
              <h2 className="lp-h2">Everything is <span className="lp-hl">free</span>, for now.</h2>
              <p className="lp-sub-intro" style={{ margin: '0 auto 20px' }}>
                Full platform access — models, fleet deploys, and Shelby Sites hosting — at no cost
                while we are in open beta. No credit card, no seat limits, no paywalls.
                Pricing arrives later, and beta users keep a generous free tier.
              </p>
              <div className="lp-free-row">
                <div className="lp-free-item"><i className="hgi-stroke hgi-globe-02" /><span>Unlimited Shelby Sites</span></div>
                <div className="lp-free-item"><i className="hgi-stroke hgi-upload-01" /><span>Unlimited deploys</span></div>
                <div className="lp-free-item"><i className="hgi-stroke hgi-fingerprint-scan" /><span>Full verification suite</span></div>
                <div className="lp-free-item"><i className="hgi-stroke hgi-cancel-circle" /><span>No credit card</span></div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
                <Link to="/app/dashboard" className="lp-btn lp-btn-primary">Start building free <i className="hgi-stroke hgi-arrow-right-01" /></Link>
                <a href="mailto:founders@provenode.xyz" className="lp-btn lp-btn-outline"><i className="hgi-stroke hgi-mail-01" /> Talk to founders</a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Testimonials — serif quotes ────────────────────── */}
        <section className="lp-section lp-reveal" style={{ background: 'var(--nt-white)', borderTop: '1px solid var(--nt-border)', borderBottom: '1px solid var(--nt-border)' }}>
          <div className="lp-shell">
            <div className="lp-sec-head">
              <p className="lp-kicker">Loved by fleet teams</p>
              <h2 className="lp-h2">Proof beats promises.</h2>
            </div>
            <div className="lp-grid-3">
              {[
                { quote: 'We cut incident MTTR from hours to 90 seconds. The on-chain manifest is now our audit source of truth.', name: 'Ava Chen', role: 'Head of Edge ML · Aether', av: 'AC', color: 'var(--nt-coral)' },
                { quote: 'Deploying our docs to Shelby Sites was one ZIP. No S3 bucket policy to misconfigure, no CloudFront invalidation.', name: 'Marcus Reid', role: 'Staff Engineer · Nova Fleet', av: 'MR', color: 'var(--nt-blue)' },
                { quote: 'Canary and lineage caught a recalled LoRA still serving in production. Without Provenode we would have shipped it.', name: 'Priya Nair', role: 'ML Platform · Edgeworks', av: 'PN', color: 'var(--nt-marigold)' },
              ].map(t => (
                <div key={t.name} className="lp-card lp-quote-card">
                  <div className="lp-quote-stars">
                    {[...Array(5)].map((_, s) => <i key={s} className="hgi-stroke hgi-star" />)}
                  </div>
                  <p className="lp-quote-body">"{t.quote}"</p>
                  <div className="lp-quote-who">
                    <span className="lp-quote-av" style={{ background: t.color }}>{t.av}</span>
                    <span className="lp-quote-meta">
                      <span className="lp-quote-name">{t.name}</span>
                      <span className="lp-quote-role">{t.role}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Comparison table ────────────────────────────────── */}
        <section className="lp-section lp-reveal">
          <div className="lp-shell">
            <div className="lp-sec-head">
              <p className="lp-kicker">Why not just S3 + a database?</p>
              <h2 className="lp-h2">Databases can be edited. Shelby blobs cannot.</h2>
            </div>
            <div className="lp-compare">
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Provenode + Shelby</th>
                      <th>Traditional orchestrator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Provenance', 'SHA-256 + Shelby manifest + Aptos anchor', 'Filename in a Postgres row'],
                      ['Tamper detection', 'Device re-hash, auto-heal, incident log', 'Polling and hoping'],
                      ['Site hosting', 'ZIP → immutable blobs at /s/slug', 'S3 bucket + CloudFront'],
                      ['Audit trail', 'On-chain, content-addressed', 'Database dump — trust us'],
                      ['Expiry', '90-day renewable, cron-backed', 'Manual lifecycle rules'],
                    ].map(([k, a, b]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td className="lp-yes"><i className="hgi-stroke hgi-tick-01" /> {a}</td>
                        <td className="lp-no">{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ── Integrations ───────────────────────────────────── */}
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
                { icon: 'hgi-notification-02', label: 'Webhooks' },
                { icon: 'hgi-analytics-01', label: 'Prometheus' },
                { icon: 'hgi-database-01', label: 'Neon / Postgres' },
              ].map(({ icon, label }) => (
                <div className="lp-int-item" key={label}><i className={`hgi-stroke ${icon}`} /><span>{label}</span></div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────── */}
        <section className="lp-section lp-reveal" id="faq">
          <div className="lp-shell" style={{ maxWidth: 760 }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <p className="lp-kicker" style={{ justifyContent: 'center' }}>FAQ</p>
              <h2 className="lp-h2">Answers, not hand-waving.</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FAQS.map((f, i) => (
                <div key={f.q} className={`lp-faq-item${faqOpen === i ? ' open' : ''}`}>
                  <button className="lp-faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                    <span className="lp-faq-sign">+</span>
                    {f.q}
                  </button>
                  {faqOpen === i && <div className="lp-faq-a">{f.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA — midnight island ───────────────────────────── */}
        <section className="lp-cta">
          <div className="lp-shell">
            <div className="lp-cta-card lp-reveal">
              <h2>When device 42 loads the wrong model, you will know — before it activates.</h2>
              <p>Deploy your first model or your first site in under five minutes.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link to="/app/dashboard" className="lp-btn lp-btn-primary"><i className="hgi-stroke hgi-dashboard-square-01" /> Open console</Link>
                <Link to="/app/sites" className="lp-btn lp-btn-ghost"><i className="hgi-stroke hgi-globe-02" /> Deploy a site</Link>
                <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer" className="lp-btn lp-btn-ghost"><i className="hgi-stroke hgi-github" /> Star on GitHub</a>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer-inner">
          <div className="lp-footer-brand"><img src="/provenode-logo.svg" alt="Provenode" className="lp-footer-logo" /><b>Provenode</b></div>
          <span className="lp-footer-tag">Verified AI model delivery on Shelbynet + Aptos</span>
          <div className="lp-footer-links">
            <Link to="/app/dashboard">Console</Link>
            <Link to="/app/sites">Sites</Link>
            <a href="/docs/" target="_blank" rel="noreferrer"><i className="hgi-stroke hgi-book-open-01" /> Docs</a>
            <a href="https://x.com/provenode" target="_blank" rel="noreferrer"><i className="hgi-stroke hgi-twitter" /> X</a>
            <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer"><i className="hgi-stroke hgi-github" /> GitHub</a>
          </div>
        </div>
        <div className="lp-shell lp-footer-bottom">
          <span>Open beta — free while we build.</span>
          <a href="https://explorer.aptoslabs.com/account/0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18?network=custom&customNetworkUrl=https%3A%2F%2Fapi.shelbynet.shelby.xyz%2Fv1" target="_blank" rel="noreferrer">Registry contract on Shelbynet</a>
        </div>
      </footer>

    </div>
  );
}
