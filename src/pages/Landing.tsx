import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import '../styles/landing.css';

// ── JSON syntax highlighter ───────────────────────────────────────────────
function highlight(json: string): string {
  return json
    .replace(/("[\w_]+")(?=\s*:)/g, '<span class="jk">$1</span>')
    .replace(/:\s*(".*?")/g, ': <span class="jv">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="jb">$1</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="jvn">$1</span>');
}

// ── Demo tab config ───────────────────────────────────────────────────────
const DEMOS = [
  {
    id: 'health',
    label: 'health',
    method: 'GET',
    url: '/api/health',
    body: null,
    description: 'Check service status',
  },
  {
    id: 'config',
    label: 'config',
    method: 'GET',
    url: '/api/config',
    body: null,
    description: 'List enabled features',
  },
  {
    id: 'models',
    label: 'models',
    method: 'GET',
    url: '/api/models',
    body: null,
    description: 'List registered models',
  },
  {
    id: 'verify',
    label: 'verify',
    method: 'GET',
    url: '/api/verify?id=demo',
    body: null,
    description: 'Verify model on-chain',
  },
  {
    id: 'selfheal',
    label: 'fleet health',
    method: 'GET',
    url: '/api/selfheal',
    body: null,
    description: 'Fleet health overview',
  },
  {
    id: 'datasets',
    label: 'datasets',
    method: 'GET',
    url: '/api/datasets',
    body: null,
    description: 'List training datasets',
  },
  {
    id: 'telemetry_post',
    label: 'telemetry',
    method: 'POST',
    url: '/api/telemetry',
    body: JSON.stringify([
      { deviceId: 'cam-001', modelId: 'demo', latencyMs: 48, confidence: 0.94, label: 'inference' },
      { deviceId: 'cam-002', modelId: 'demo', latencyMs: 52, confidence: 0.91, label: 'inference' },
    ], null, 2),
    description: 'Ingest inference events',
  },
  {
    id: 'provenance_post',
    label: 'provenance',
    method: 'POST',
    url: '/api/provenance',
    body: JSON.stringify({
      childModelId: 'model-v1.1',
      parentModelId: 'model-v1.0',
      operation: 'fine-tune',
      notes: 'Fine-tuned on COCO dataset',
    }, null, 2),
    description: 'Add provenance node',
  },
  {
    id: 'bridge',
    label: 'bridge',
    method: 'GET',
    url: '/api/bridge',
    body: null,
    description: 'Cross-chain attestations',
  },
  {
    id: 'audit',
    label: 'audit log',
    method: 'GET',
    url: '/api/audit',
    body: null,
    description: 'Immutable audit trail',
  },
];

// ── Live API Demo ─────────────────────────────────────────────────────────
function LiveDemo() {
  const [activeDemo, setActiveDemo] = useState(DEMOS[0]);
  const [body, setBody] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: number; data: unknown } | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    setBody(activeDemo.body || '');
    setResult(null);
    setElapsed(null);
  }, [activeDemo]);

  const run = useCallback(async () => {
    setLoading(true);
    setResult(null);
    const t0 = performance.now();
    try {
      const opts: RequestInit = { method: activeDemo.method, headers: { 'Content-Type': 'application/json' } };
      if (activeDemo.method !== 'GET' && body.trim()) opts.body = body;
      const res = await fetch(activeDemo.url, opts);
      const data = await res.json().catch(() => ({}));
      setResult({ status: res.status, data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setResult({ status: 0, data: { error: msg } });
    } finally {
      setElapsed(Math.round(performance.now() - t0));
      setLoading(false);
    }
  }, [activeDemo, body]);

  const statusClass = result
    ? result.status >= 200 && result.status < 300
      ? 's200'
      : result.status >= 400 ? 's400' : 's500'
    : '';

  return (
    <div className="lp-demo">
      {/* Left: request panel */}
      <div>
        <div className="lp-demo-tabs">
          {DEMOS.map(d => (
            <button
              key={d.id}
              className={`lp-demo-tab ${activeDemo.id === d.id ? 'active' : ''}`}
              onClick={() => setActiveDemo(d)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="lp-demo-panel">
          <div className="lp-demo-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`lp-demo-method ${activeDemo.method.toLowerCase()}`}>
                {activeDemo.method}
              </span>
              <span className="lp-demo-url">{activeDemo.url}</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--lp-muted2)' }}>{activeDemo.description}</span>
          </div>

          <div className="lp-demo-body">
            {activeDemo.body !== null ? (
              <textarea
                className="lp-demo-textarea"
                value={body}
                onChange={e => setBody(e.target.value)}
                spellCheck={false}
                rows={6}
              />
            ) : (
              <div style={{ fontSize: 12, color: 'var(--lp-muted2)', padding: '8px 0' }}>
                No request body — GET request
              </div>
            )}
          </div>

          <div className="lp-demo-run">
            <span style={{ fontSize: 11, fontFamily: 'var(--lp-mono)', color: 'var(--lp-muted2)' }}>
              {elapsed !== null ? `${elapsed}ms` : 'ready'}
            </span>
            <button className="lp-demo-run-btn" onClick={run} disabled={loading}>
              {loading ? <span className="lp-demo-loading" /> : '▶'}
              {loading ? 'Running...' : 'Run request'}
            </button>
          </div>
        </div>
      </div>

      {/* Right: response panel */}
      <div className="lp-demo-result">
        <div className="lp-demo-result-header">
          <span>Response</span>
          {result && (
            <span className={`lp-status-badge ${statusClass}`}>
              {result.status || 'ERR'}
            </span>
          )}
        </div>

        {result ? (
          <div
            className="lp-demo-json"
            dangerouslySetInnerHTML={{
              __html: highlight(JSON.stringify(result.data, null, 2)),
            }}
          />
        ) : (
          <div className="lp-demo-placeholder">
            <div className="lp-demo-placeholder-icon">⬡</div>
            <span>Run a request to see the response</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────
export default function Landing() {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.06, rootMargin: '0px 0px -20px 0px' }
    );
    ref.current?.querySelectorAll('.lp-reveal').forEach(el => io.observe(el));

    // Nav scroll glass effect
    const nav = document.querySelector('.lp-nav') as HTMLElement | null;
    const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Counter animation
    const counters = ref.current?.querySelectorAll('[data-count]') || [];
    const cio = new IntersectionObserver((es) => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        const target = parseFloat(el.dataset.count || '0');
        const suffix = el.dataset.suffix || '';
        const isFloat = el.dataset.count?.includes('.');
        let start: number | null = null;
        const dur = 1600;
        const step = (ts: number) => {
          if (!start) start = ts;
          const p = Math.min((ts - start) / dur, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          const val = ease * target;
          el.textContent = (isFloat ? val.toFixed(1) : Math.round(val).toLocaleString()) + suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        cio.unobserve(el);
      });
    }, { threshold: 0.5 });
    counters.forEach(c => cio.observe(c));

    return () => {
      io.disconnect();
      cio.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const copyAddress = () => {
    navigator.clipboard.writeText('0xcc19b66dd18fe15fe8e7f993d31a3feaac5cb17cebe33ff60641e783adcdb21f');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lp" ref={ref}>
      <div className="lp-blobs">
        <div className="lp-blob lp-blob-1" />
        <div className="lp-blob lp-blob-2" />
        <div className="lp-blob lp-blob-3" />
      </div>

      {/* Nav */}
      <nav className="lp-nav">
        <a href="/" className="lp-nav-logo">
          <svg viewBox="0 0 22 22" fill="none">
            <rect x="1" y="1" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M7 11l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Provenode
        </a>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#contract">Contract</a>
          <a href="#demo">API</a>
        </div>
        <Link to="/app" className="lp-nav-cta">Open dashboard →</Link>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-shell">
          <div className="lp-hero-inner">
            <div className="lp-hero-chip">
              <span className="lp-hero-chip-dot" />
              Built on Shelby Protocol + Aptos
            </div>
            <h1>
              Register. Sign.<br />
              Deploy. <em>Verify.</em>
            </h1>
            <p>
              Upload AI models to Shelby, register the SHA-256 on Aptos, deploy to edge devices over-the-air.
              Every device verifies the model hash before loading it. If it doesn't match the on-chain record, it rejects it.
            </p>
            <div className="lp-hero-actions">
              <Link to="/app" className="lp-btn-primary">
                Open dashboard
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              <a href="https://github.com/salch-cred/provenode" className="lp-btn-secondary" target="_blank" rel="noreferrer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.577v-2.17c-3.34.726-4.042-1.61-4.042-1.61-.546-1.386-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.204.085 1.838 1.237 1.838 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.42-1.305.762-1.604-2.665-.3-5.467-1.332-5.467-5.93 0-1.31.468-2.38 1.237-3.22-.124-.304-.536-1.524.117-3.176 0 0 1.008-.322 3.3 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.872.12 3.176.77.84 1.235 1.91 1.235 3.22 0 4.61-2.807 5.624-5.48 5.921.43.372.823 1.102.823 2.222v3.293c0 .32.22.694.825.576C20.565 21.796 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
                GitHub
              </a>
            </div>
          </div>

          {/* Terminal */}
          <div className="lp-terminal">
            <div className="lp-terminal-bar">
              <div className="lp-terminal-dot" />
              <div className="lp-terminal-dot" />
              <div className="lp-terminal-dot" />
              <span className="lp-terminal-title">provenode — api trace</span>
            </div>
            <div className="lp-terminal-body">
              <div><span className="lp-t-comment"># upload model to Shelby, register SHA-256 on Aptos</span></div>
              <div><span className="lp-t-cmd">POST</span> <span className="lp-t-arg">/api/upload</span> <span className="lp-t-dim">model.onnx (48.2 MB)</span></div>
              <div><span className="lp-t-ok">↳</span> <span className="lp-t-str">shelby://shelbynet/0x77f8c.../models/model-v1</span></div>
              <div><span className="lp-t-ok">↳</span> <span className="lp-t-dim">sha256: aabbccdd... registered on Aptos block 43978014</span></div>
              <div style={{marginTop: 8}}><span className="lp-t-comment"># deploy to fleet (248 devices)</span></div>
              <div><span className="lp-t-cmd">POST</span> <span className="lp-t-arg">/api/deploy</span> <span className="lp-t-dim">{'{modelId, region: "Global"}'}</span></div>
              <div><span className="lp-t-ok">↳</span> <span className="lp-t-dim">manifest: dep_8f3a... · 0 failures</span></div>
              <div style={{marginTop: 8}}><span className="lp-t-comment"># device verifies before loading</span></div>
              <div><span className="lp-t-cmd">device</span> <span className="lp-t-arg">cam-001</span> <span className="lp-t-dim">SHA-256 ✓ → model loaded</span></div>
              <div><span className="lp-t-cmd">device</span> <span className="lp-t-arg">cam-007</span> <span className="lp-t-dim">SHA-256 ✗ → rejected + heal queued</span></div>
              <div style={{marginTop: 8}}><span className="lp-t-ok">fleet</span> <span className="lp-t-dim">247/248 healthy · 1 healing</span> <span className="lp-t-cursor" /></div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-shell">
          <div className="lp-stats lp-reveal">
            <div className="lp-stat">
              <div className="lp-stat-val" data-count="25" data-suffix="+">0</div>
              <div className="lp-stat-label">API endpoints</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat-val" data-count="10">0</div>
              <div className="lp-stat-label">Shelby integrations</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat-val" data-count="7">0</div>
              <div className="lp-stat-label">On-chain transactions</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat-val" data-count="70" data-suffix="%">0</div>
              <div className="lp-stat-label">Lower egress vs cloud</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="lp-section" id="how">
        <div className="lp-shell">
          <div className="lp-section-header lp-reveal">
            <div className="lp-section-label">How it works</div>
            <h2 className="lp-section-title">From upload to verification</h2>
            <p className="lp-section-sub">Four steps. Model file in, cryptographic proof out.</p>
          </div>

          <div className="lp-reveal delay-1">
            <div className="lp-flow" style={{ marginBottom: 48 }}>
              {[
                { icon: '⬆', label: 'Upload\nto Shelby' },
                { icon: '⛓', label: 'Register SHA\non Aptos' },
                { icon: '✍', label: 'Sign with\nEd25519' },
                { icon: '📡', label: 'Deploy\nOTA' },
                { icon: '✓', label: 'Device\nverifies' },
              ].map((node, i) => (
                <React.Fragment key={node.label}>
                  <div className="lp-flow-node">
                    <div className="lp-flow-node-icon">{node.icon}</div>
                    <div className="lp-flow-node-label" style={{ whiteSpace: 'pre' }}>{node.label}</div>
                  </div>
                  {i < 4 && <div className="lp-flow-arrow">→</div>}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="lp-steps lp-reveal delay-2">
            {[
              {
                num: '01',
                title: 'Upload',
                body: 'POST a model file. It gets uploaded to Shelby Protocol decentralized storage. Returns a Shelby object ID.',
                icon: '⬆',
              },
              {
                num: '02',
                title: 'Register on-chain',
                body: "SHA-256 + Shelby object ID written to the ModelRegistry Move contract on Aptos. Permanent, immutable record.",
                icon: '⛓',
              },
              {
                num: '03',
                title: 'Sign',
                body: "Sign the model SHA-256 with your org's Ed25519 key. Devices reject unsigned models if signing is enforced.",
                icon: '✍',
              },
              {
                num: '04',
                title: 'Deploy + Verify',
                body: 'Push OTA to fleet. Each device fetches from Shelby, computes SHA-256, compares to on-chain value. Mismatch = reject + auto-heal.',
                icon: '✓',
              },
            ].map(step => (
              <div className="lp-step" key={step.num}>
                <div className="lp-step-icon">{step.icon}</div>
                <div className="lp-step-num">Step {step.num}</div>
                <div className="lp-step-title">{step.title}</div>
                <div className="lp-step-body">{step.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="lp-section" id="features">
        <div className="lp-shell">
          <div className="lp-section-header lp-reveal">
            <div className="lp-section-label">Features</div>
            <h2 className="lp-section-title">What's built</h2>
            <p className="lp-section-sub">All backed by Shelby blob storage + Aptos on-chain state.</p>
          </div>
          <div className="lp-features">
            {[
              {
                icon: '◈',
                color: 'purple',
                title: 'Model registry',
                body: 'Register any model file with its SHA-256 and Shelby object ID on Aptos. Verify by calling verify_model() on-chain.',
                code: 'POST /api/upload',
              },
              {
                icon: '⌁',
                color: 'cyan',
                title: 'Streaming inference',
                body: 'Splits model into 5MB chunks, each uploaded to Shelby separately. Devices fetch chunk-by-chunk while inferring.',
                code: 'POST /api/stream-inference',
              },
              {
                icon: '⊕',
                color: 'green',
                title: 'Fleet OTA + self-heal',
                body: 'Push models to devices. Heartbeat checks SHA-256. Tamper detected → fetch clean model from Shelby → heal.',
                code: 'POST /api/selfheal',
              },
              {
                icon: '⇄',
                color: 'amber',
                title: 'Federated learning',
                body: 'Devices upload gradient updates to Shelby. API runs FedAvg aggregation. Each device gets a contribution receipt.',
                code: 'PATCH /api/federated',
              },
              {
                icon: 'Δ',
                color: 'blue',
                title: 'Delta uploads',
                body: 'Only upload the binary diff between model versions. On-chain DAG tracks v1.0 → v1.1 → v1.2.',
                code: 'POST /api/delta',
              },
              {
                icon: '⬡',
                color: 'purple',
                title: 'Dataset registry',
                body: 'Register training datasets as Shelby shards with Merkle root on Aptos. Link datasets to model versions.',
                code: 'POST /api/datasets',
              },
              {
                icon: '◎',
                color: 'green',
                title: 'Provenance chain',
                body: 'Add lineage nodes: model B was fine-tuned from model A on dataset X. Full chain queryable via API.',
                code: 'POST /api/provenance',
              },
              {
                icon: '⊡',
                color: 'red',
                title: 'ZK commitment proofs',
                body: 'Generate commitment proofs (HMAC-SHA256) for model input→output behavior. Proof stored on Shelby, hash on Aptos.',
                code: 'POST /api/zkproof',
              },
              {
                icon: '⇡',
                color: 'cyan',
                title: 'Inference analytics',
                body: 'Batch inference events (latency, confidence, device ID) → JSONL blobs on Shelby. Queryable via DuckDB S3 gateway.',
                code: 'POST /api/telemetry',
              },
              {
                icon: '⊛',
                color: 'amber',
                title: 'Cross-chain attestation',
                body: 'Create attestations for Solana (via @shelby-protocol/solana-kit) or Ethereum. One Shelby blob, multiple chains.',
                code: 'POST /api/bridge',
              },
            ].map((f, i) => (
              <div
                key={f.title}
                className={`glass-card lp-feature-card lp-reveal delay-${Math.min((i % 3) + 1, 4)}`}
              >
                <div className={`lp-feature-icon ${f.color}`}>{f.icon}</div>
                <div>
                  <div className="lp-feature-title">{f.title}</div>
                  <div className="lp-feature-body" style={{ marginTop: 6 }}>{f.body}</div>
                </div>
                <div className="lp-feature-code">{f.code}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contract */}
      <section className="lp-section" id="contract">
        <div className="lp-shell">
          <div className="lp-section-header lp-reveal">
            <div className="lp-section-label">Smart contract</div>
            <h2 className="lp-section-title">ModelRegistry on Aptos</h2>
            <p className="lp-section-sub">Move contract managing models, datasets, provenance, and incidents.</p>
          </div>

          <div className="lp-reveal" style={{ marginBottom: 24 }}>
            <div className="lp-address-chip" onClick={copyAddress} title="Click to copy">
              <span>Contract:</span>
              <span>0xcc19b66dd18fe15fe8e7f993d31a3feaac5cb17cebe33ff60641e783adcdb21f</span>
              <span className="lp-copy-btn">{copied ? '✓' : 'copy'}</span>
            </div>
          </div>

          <div className="lp-contract-grid lp-reveal delay-1">
            <div className="lp-code-block">
              <div className="cm">// Model lifecycle</div>
              <div><span className="kw">public entry fun</span> <span className="fn">initialize</span>(<span className="arg">account</span>)</div>
              <div><span className="kw">public entry fun</span> <span className="fn">register_model</span>(</div>
              <div>  account, <span className="arg">sha256</span>, <span className="arg">shelby_object_id</span>,</div>
              <div>  <span className="arg">name</span>, <span className="arg">version</span>, <span className="arg">id</span></div>
              <div>)</div>
              <div><span className="kw">public entry fun</span> <span className="fn">mark_signed</span>(account, <span className="arg">sha256</span>)</div>
              <div><span className="kw">public entry fun</span> <span className="fn">deactivate_model</span>(account, <span className="arg">sha256</span>)</div>
              <br/>
              <div className="cm">// Datasets</div>
              <div><span className="kw">public entry fun</span> <span className="fn">register_dataset</span>(</div>
              <div>  account, <span className="arg">id</span>, <span className="arg">name</span>, <span className="arg">merkle_root</span>,</div>
              <div>  <span className="arg">shard_count</span>, <span className="arg">total_bytes</span>, <span className="arg">license</span>, <span className="arg">source</span></div>
              <div>)</div>
              <br/>
              <div className="cm">// Lineage + incidents</div>
              <div><span className="kw">public entry fun</span> <span className="fn">log_provenance</span>(</div>
              <div>  account, <span className="arg">child_model_id</span>, <span className="arg">parent_model_id</span>,</div>
              <div>  <span className="arg">operation</span>, <span className="arg">node_hash</span></div>
              <div>)</div>
              <div><span className="kw">public entry fun</span> <span className="fn">log_incident</span>(</div>
              <div>  account, <span className="arg">id</span>, <span className="arg">device_id</span>, <span className="arg">model_id</span>,</div>
              <div>  <span className="arg">old_sha256</span>, <span className="arg">new_sha256</span></div>
              <div>)</div>
            </div>

            <div className="lp-code-block">
              <div className="cm">// View functions (read-only, free)</div>
              <div><span className="kw">#[view]</span></div>
              <div><span className="kw">public fun</span> <span className="fn">verify_model</span>(</div>
              <div>  <span className="arg">registry_address</span>: address,</div>
              <div>  <span className="arg">sha256</span>: vector&lt;u8&gt;</div>
              <div>): bool</div>
              <br/>
              <div><span className="kw">#[view]</span></div>
              <div><span className="kw">public fun</span> <span className="fn">model_count</span>(<span className="arg">address</span>): u64</div>
              <br/>
              <div><span className="kw">#[view]</span></div>
              <div><span className="kw">public fun</span> <span className="fn">dataset_count</span>(<span className="arg">address</span>): u64</div>
              <br/>
              <div><span className="kw">#[view]</span></div>
              <div><span className="kw">public fun</span> <span className="fn">incident_count</span>(<span className="arg">address</span>): u64</div>
              <br/>
              <div className="cm">// Network: Aptos Devnet</div>
              <div className="cm">// Explorer: aptoslabs.com → devnet</div>
              <br/>
              <div><a
                href="https://explorer.aptoslabs.com/account/0xcc19b66dd18fe15fe8e7f993d31a3feaac5cb17cebe33ff60641e783adcdb21f?network=devnet"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--lp-accent2)', textDecoration: 'none', fontSize: 12 }}
              >→ View on Explorer ↗</a></div>
            </div>
          </div>
        </div>
      </section>

      {/* Live API demo */}
      <section className="lp-section" id="demo">
        <div className="lp-shell">
          <div className="lp-section-header lp-reveal">
            <div className="lp-section-label">Live API</div>
            <h2 className="lp-section-title">Test it right here</h2>
            <p className="lp-section-sub">
              Real requests against the live API. Select an endpoint, edit the body, hit Run.
            </p>
          </div>
          <div className="lp-reveal delay-1">
            <LiveDemo />
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="lp-shell">
        <footer className="lp-footer">
          <div className="lp-footer-brand">Provenode</div>
          <div className="lp-footer-links">
            <a href="https://github.com/salch-cred/provenode" target="_blank" rel="noreferrer">GitHub</a>
            <a href="https://shelby.xyz" target="_blank" rel="noreferrer">Shelby Protocol</a>
            <a href="https://explorer.aptoslabs.com/account/0xcc19b66dd18fe15fe8e7f993d31a3feaac5cb17cebe33ff60641e783adcdb21f?network=devnet" target="_blank" rel="noreferrer">Contract</a>
            <Link to="/app">Dashboard</Link>
          </div>
          <div className="lp-footer-meta">Aptos Devnet · Shelbynet</div>
        </footer>
      </div>
    </div>
  );
}
