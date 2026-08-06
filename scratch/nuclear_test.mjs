/**
 * Provenode — HARDEST LOAD TEST EVER
 * ─────────────────────────────────────────────────────────────
 * Phases:
 *  1. SPIKE      — 1000 simultaneous hits (cold start murder)
 *  2. SUSTAINED  — 200 req/s for 10 seconds (warm throughput)
 *  3. CHAOS      — Malformed, oversized, invalid requests
 *  4. SECURITY   — Auth bypass, injection, header smuggling
 *  5. RATE LIMIT — Hammer until 429s kick in
 *  6. CONCURRENCY— Simultaneous read+write on same resources
 *  7. ENDURANCE  — 2000 total requests, all endpoints, random order
 */

const BASE = 'https://www.provenodes.xyz';

const colours = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

function bar(pass, fail, total, width = 30) {
  const p = Math.round((pass / total) * width);
  const f = Math.round((fail / total) * width);
  return colours.green('█'.repeat(p)) + colours.red('█'.repeat(f)) + colours.dim('░'.repeat(width - p - f));
}

async function req(path, { method = 'GET', body, headers = {}, label = path, expectStatus } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
    const ms = Date.now() - t0;
    const expected = expectStatus ? [].concat(expectStatus).includes(r.status) : r.status < 500;
    return { ok: expected, status: r.status, ms, label };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, label, err: e.message };
  }
}

function stats(results) {
  const times = results.map(r => r.ms).sort((a, b) => a - b);
  const pass = results.filter(r => r.ok).length;
  const avg = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
  const p50 = times[Math.floor(times.length * 0.50)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const max = times[times.length - 1];
  return { pass, fail: results.length - pass, total: results.length, avg, p50, p95, p99, max };
}

function printStats(label, s) {
  const pct = ((s.pass / s.total) * 100).toFixed(1);
  const icon = s.fail === 0 ? colours.green('✅') : s.fail < s.pass * 0.1 ? colours.yellow('⚠️') : colours.red('❌');
  console.log(`${icon} ${colours.bold(label)}`);
  console.log(`   ${bar(s.pass, s.fail, s.total)}  ${pct}% (${s.pass}/${s.total})`);
  console.log(`   avg:${s.avg}ms  p50:${s.p50}ms  p95:${s.p95}ms  p99:${s.p99}ms  max:${s.max}ms`);
  console.log();
}

// ── PHASE 1: SPIKE — 1000 simultaneous ──────────────────────────────────────
async function phaseSpike() {
  console.log(colours.bold(colours.cyan('\n⚡ PHASE 1 — SPIKE: 1000 simultaneous requests\n')));
  const reqs = Array.from({ length: 1000 }, (_, i) => {
    const ep = ['/api/health', '/api/config', '/api/shelby-status', '/api/models', '/'][i % 5];
    return req(ep, { label: ep });
  });
  const t0 = Date.now();
  const results = await Promise.all(reqs);
  const elapsed = Date.now() - t0;
  const s = stats(results);
  printStats(`1000 simultaneous (${elapsed}ms total, ~${Math.round(1000/(elapsed/1000))} rps)`, s);
  return s;
}

// ── PHASE 2: SUSTAINED — waves of 200 req/s for 10s ─────────────────────────
async function phaseSustained() {
  console.log(colours.bold(colours.cyan('\n🔥 PHASE 2 — SUSTAINED: 10 waves × 200 req/wave\n')));
  const all = [];
  for (let wave = 0; wave < 10; wave++) {
    const t0 = Date.now();
    const reqs = Array.from({ length: 200 }, (_, i) => {
      const ep = ['/api/health', '/api/models', '/api/status', '/api/devices', '/api/config'][i % 5];
      return req(ep, { label: ep });
    });
    const results = await Promise.all(reqs);
    const elapsed = Date.now() - t0;
    const pass = results.filter(r => r.ok).length;
    process.stdout.write(`  Wave ${wave + 1}/10: ${pass}/200 pass — ${elapsed}ms\n`);
    all.push(...results);
    await new Promise(r => setTimeout(r, 200));
  }
  const s = stats(all);
  console.log();
  printStats('Sustained 2000 req (10 waves)', s);
  return s;
}

// ── PHASE 3: CHAOS — invalid, malformed, edge-case requests ─────────────────
async function phaseChaos() {
  console.log(colours.bold(colours.cyan('\n💥 PHASE 3 — CHAOS: Malformed & edge-case attacks\n')));
  const attacks = [
    // Oversized JSON payload (10KB)
    req('/api/deploy', { method: 'POST', body: { junk: 'x'.repeat(10000) }, label: 'Oversized payload', expectStatus: [400, 401, 413, 429] }),
    // Invalid JSON (raw string, not object)
    req('/api/upload', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, label: 'Invalid content-type', expectStatus: [400, 401, 415, 429] }),
    // Path traversal attempt
    req('/api/../../../etc/passwd', { label: 'Path traversal', expectStatus: [400, 403, 404] }),
    // Null bytes in path
    req('/api/models%00.json', { label: 'Null byte injection', expectStatus: [400, 403, 404] }),
    // Extremely long path
    req('/api/' + 'a'.repeat(2000), { label: 'URL too long', expectStatus: [400, 404, 414] }),
    // SQL injection in query
    req('/api/models?id=1%27%20OR%20%271%27%3D%271', { label: 'SQL injection attempt', expectStatus: [200, 400, 404] }),
    // XSS in header
    req('/api/health', { headers: { 'X-Custom': '<script>alert(1)</script>' }, label: 'XSS in header', expectStatus: [200] }),
    // TRACE method (should be blocked)
    req('/api/health', { method: 'TRACE', label: 'TRACE method blocked', expectStatus: [405] }),
    // DELETE without auth
    req('/api/models/fake-id', { method: 'DELETE', label: 'Unauthed DELETE', expectStatus: [401, 404, 405, 429] }),
    // Deeply nested JSON bomb (small but deep)
    req('/api/deploy', { method: 'POST', body: { a: { b: { c: { d: { e: { f: { g: 'bomb' } } } } } } }, label: 'Nested JSON bomb', expectStatus: [400, 401, 429] }),
    // Empty body POST
    req('/api/upload', { method: 'POST', body: null, label: 'Empty POST body', expectStatus: [400, 401, 429] }),
    // CORS preflight
    req('/api/health', { method: 'OPTIONS', headers: { 'Origin': 'https://evil.com', 'Access-Control-Request-Method': 'POST' }, label: 'CORS preflight', expectStatus: [204, 200] }),
    // Non-existent endpoint
    req('/api/doesnotexist', { label: 'Unknown endpoint', expectStatus: [404] }),
    // Unicode in path
    req('/api/模型/上传', { label: 'Unicode path', expectStatus: [400, 404] }),
    // Host header injection
    req('/api/health', { headers: { 'Host': 'evil.com' }, label: 'Host header injection', expectStatus: [200] }),
  ];

  const results = await Promise.all(attacks);
  for (const r of results) {
    const icon = r.ok ? colours.green('✅') : colours.red('❌');
    console.log(`  ${icon} ${r.label.padEnd(35)} → HTTP ${r.status || 'ERR'} in ${r.ms}ms`);
  }
  const s = stats(results);
  console.log();
  printStats('Chaos / attack resistance', s);
  return s;
}

// ── PHASE 4: SECURITY — auth bypass attempts ─────────────────────────────────
async function phaseSecurity() {
  console.log(colours.bold(colours.cyan('\n🔐 PHASE 4 — SECURITY: Auth bypass & injection\n')));
  const checks = [
    // Try to POST status without token (should fail if DEPLOY_SECRET set)
    req('/api/status', { method: 'POST', body: { id: 'fake', status: 'verified', count: 248 }, label: 'Status POST no token', expectStatus: [401, 429] }),
    // Wrong token
    req('/api/status', { method: 'POST', body: { id: 'x', status: 'verified' }, headers: { 'X-Provenode-Token': 'wrong-token' }, label: 'Status POST wrong token', expectStatus: [401, 429] }),
    // JWT-style forged token
    req('/api/status', { method: 'POST', body: {}, headers: { 'X-Provenode-Token': 'eyJhbGciOiJub25lIn0.eyJhZG1pbiI6dHJ1ZX0.' }, label: 'Forged JWT token', expectStatus: [401, 429] }),
    // Privy admin route (should not exist)
    req('/api/admin', { label: 'Admin route', expectStatus: [401, 403, 404] }),
    // Direct KV access attempt
    req('/api/kv', { label: 'KV direct access', expectStatus: [401, 403, 404] }),
    // Identity endpoint (requires auth)
    req('/api/identity', { label: 'Identity without auth', expectStatus: [401, 404, 429] }),
    // Webhook secret bypass
    req('/api/webhooks', { method: 'POST', body: { url: 'https://evil.com', events: ['*'] }, label: 'Webhook create no auth', expectStatus: [400, 401, 429] }),
    // Mass delete attempt
    req('/api/models', { method: 'DELETE', label: 'Mass delete attempt', expectStatus: [401, 404, 405, 429] }),
    // Server-side request forgery
    req('/api/deploy', { method: 'POST', body: { modelUrl: 'http://169.254.169.254/latest/meta-data/' }, label: 'SSRF attempt', expectStatus: [400, 401, 429] }),
    // Prototype pollution
    req('/api/deploy', { method: 'POST', body: { '__proto__': { admin: true }, modelId: 'x' }, label: 'Prototype pollution', expectStatus: [400, 401, 429] }),
  ];

  const results = await Promise.all(checks);
  for (const r of results) {
    const icon = r.ok ? colours.green('✅') : colours.red('❌');
    console.log(`  ${icon} ${r.label.padEnd(35)} → HTTP ${r.status || 'ERR'} in ${r.ms}ms`);
  }
  const s = stats(results);
  console.log();
  printStats('Security / auth checks', s);
  return s;
}

// ── PHASE 5: RATE LIMIT — hammer until 429s ──────────────────────────────────
async function phaseRateLimit() {
  console.log(colours.bold(colours.cyan('\n🚦 PHASE 5 — RATE LIMIT: 200 rapid POST to trigger 429\n')));
  const reqs = Array.from({ length: 200 }, () =>
    req('/api/deploy', { method: 'POST', body: { test: true }, label: 'rate-limit-test', expectStatus: [400, 401, 429] })
  );
  const results = await Promise.all(reqs);
  const by429 = results.filter(r => r.status === 429).length;
  const byOther = results.filter(r => r.status !== 429).length;
  console.log(`  Rate limited (429): ${colours.green(by429)}`);
  console.log(`  Other (4xx/2xx):    ${colours.yellow(byOther)}`);
  const rateLimitWorks = by429 > 0;
  console.log(`  Rate limiter: ${rateLimitWorks ? colours.green('✅ WORKING') : colours.yellow('⚠️  Not triggered (may need DEPLOY_SECRET set)')}`);
  const s = stats(results);
  console.log();
  printStats('Rate limit stress', s);
  return s;
}

// ── PHASE 6: ENDURANCE — 2000 requests, all routes, random order ─────────────
async function phaseEndurance() {
  console.log(colours.bold(colours.cyan('\n🏃 PHASE 6 — ENDURANCE: 2000 random requests across all routes\n')));
  const endpoints = [
    '/api/health', '/api/config', '/api/shelby-status', '/api/models',
    '/api/status', '/api/devices', '/api/analytics', '/api/webhooks',
    '/api/fleet', '/api/groups', '/api/marketplace', '/',
  ];

  const all = [];
  const BATCH = 200;
  for (let b = 0; b < 10; b++) {
    const batch = Array.from({ length: BATCH }, (_, i) => {
      const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
      return req(ep, { label: ep });
    });
    const results = await Promise.all(batch);
    const pass = results.filter(r => r.ok).length;
    all.push(...results);
    process.stdout.write(`  Batch ${b + 1}/10: ${pass}/${BATCH} ✅\n`);
  }

  const s = stats(all);
  console.log();
  printStats('Endurance (2000 req)', s);
  return s;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const testStart = Date.now();
  console.log(colours.bold('\n' + '═'.repeat(62)));
  console.log(colours.bold('  🧨 PROVENODE — HARDEST LOAD TEST EVER'));
  console.log(colours.bold('  🌐 Target: ' + BASE));
  console.log(colours.bold('  📅 ' + new Date().toISOString()));
  console.log(colours.bold('═'.repeat(62)));

  const phases = [
    { name: 'Spike (1000 simultaneous)', fn: phaseSpike },
    { name: 'Sustained (2000 warm)',     fn: phaseSustained },
    { name: 'Chaos (attack resistance)', fn: phaseChaos },
    { name: 'Security (auth bypass)',    fn: phaseSecurity },
    { name: 'Rate limit (200 rapid)',    fn: phaseRateLimit },
    { name: 'Endurance (2000 random)',   fn: phaseEndurance },
  ];

  const phaseStats = [];
  for (const phase of phases) {
    const s = await phase.fn();
    phaseStats.push({ name: phase.name, ...s });
  }

  // ── FINAL REPORT ────────────────────────────────────────────
  const totalMs = Date.now() - testStart;
  console.log('\n' + colours.bold('═'.repeat(62)));
  console.log(colours.bold('  🏆 FINAL REPORT'));
  console.log(colours.bold('═'.repeat(62)) + '\n');

  let grandTotal = 0, grandPass = 0;
  for (const s of phaseStats) {
    grandTotal += s.total;
    grandPass  += s.pass;
    const pct = ((s.pass / s.total) * 100).toFixed(1);
    const icon = s.fail === 0 ? '✅' : s.fail < s.total * 0.1 ? '⚠️' : '❌';
    console.log(`  ${icon}  ${s.name.padEnd(30)} ${pct.padStart(6)}%  (${s.pass}/${s.total})`);
  }

  const overallPct = ((grandPass / grandTotal) * 100).toFixed(2);
  console.log('\n' + colours.bold('─'.repeat(62)));
  console.log(colours.bold(`  Total requests : ${grandTotal}`));
  console.log(colours.bold(`  Passed         : ${grandPass} (${overallPct}%)`));
  console.log(colours.bold(`  Failed         : ${grandTotal - grandPass}`));
  console.log(colours.bold(`  Total time     : ${(totalMs / 1000).toFixed(1)}s`));

  const grade = grandPass / grandTotal;
  console.log();
  if      (grade >= 0.99) console.log(colours.green(colours.bold('  🟢 GRADE: S+  — PRODUCTION BULLETPROOF')));
  else if (grade >= 0.97) console.log(colours.green(colours.bold('  🟢 GRADE: A   — EXCELLENT')));
  else if (grade >= 0.95) console.log(colours.yellow(colours.bold('  🟡 GRADE: B   — GOOD, minor issues')));
  else if (grade >= 0.90) console.log(colours.yellow(colours.bold('  🟡 GRADE: C   — ACCEPTABLE')));
  else                    console.log(colours.red(colours.bold('  🔴 GRADE: F   — NEEDS FIXING')));

  console.log(colours.bold('\n' + '═'.repeat(62) + '\n'));
}

main().catch(console.error);
