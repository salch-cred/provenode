/**
 * Provenode — 500 concurrent user load test
 * Tests all API endpoints + measures response times, errors, throughput
 */

const BASE = 'https://www.provenodes.xyz';
const USERS = 500;
const results = { pass: 0, fail: 0, times: [], errors: [] };

const ENDPOINTS = [
  { method: 'GET',  path: '/api/health',        label: 'Health check',     auth: false },
  { method: 'GET',  path: '/api/config',         label: 'Config',           auth: false },
  { method: 'GET',  path: '/api/shelby-status',  label: 'Shelby status',    auth: false },
  { method: 'GET',  path: '/api/models',          label: 'List models',      auth: false },
  { method: 'GET',  path: '/api/status',          label: 'Deployments list', auth: false },
  { method: 'GET',  path: '/api/webhooks',        label: 'Webhooks list',    auth: false },
  { method: 'GET',  path: '/api/devices',         label: 'Devices list',     auth: false },
  { method: 'GET',  path: '/api/analytics',       label: 'Analytics',        auth: false },
  { method: 'GET',  path: '/api/audit-log',       label: 'Audit log',        auth: false },
  { method: 'GET',  path: '/',                    label: 'Landing page',     auth: false },
];

async function hit(endpoint, userId) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${endpoint.path}`, {
      method: endpoint.method,
      headers: { 
        'Content-Type': 'application/json',
        'X-Test-User': `user-${userId}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    const ms = Date.now() - t0;
    const ok = res.status < 500;
    return { ok, status: res.status, ms, label: endpoint.label };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, label: endpoint.label, err: e.message };
  }
}

async function runBatch(batchSize, batchNum) {
  const batch = [];
  for (let i = 0; i < batchSize; i++) {
    const userId = batchNum * batchSize + i;
    // Each user hits a random endpoint
    const ep = ENDPOINTS[userId % ENDPOINTS.length];
    batch.push(hit(ep, userId));
  }
  return Promise.all(batch);
}

async function main() {
  console.log(`\n🧪 Provenode Load Test — ${USERS} concurrent users`);
  console.log(`🌐 Target: ${BASE}`);
  console.log(`📋 Endpoints: ${ENDPOINTS.length} routes\n`);
  console.log('─'.repeat(60));

  const t0 = Date.now();
  // Run in 5 batches of 100 to avoid OS socket limits
  const BATCH_SIZE = 100;
  const BATCHES = USERS / BATCH_SIZE;
  const allResults = [];

  for (let b = 0; b < BATCHES; b++) {
    process.stdout.write(`  Batch ${b+1}/${BATCHES} (${BATCH_SIZE} users)... `);
    const batchResults = await runBatch(BATCH_SIZE, b);
    allResults.push(...batchResults);
    const batchPass = batchResults.filter(r => r.ok).length;
    console.log(`✅ ${batchPass}/${BATCH_SIZE} passed`);
  }

  const totalMs = Date.now() - t0;

  // Aggregate per-endpoint
  const byEndpoint = {};
  for (const r of allResults) {
    if (!byEndpoint[r.label]) byEndpoint[r.label] = { pass: 0, fail: 0, times: [], statuses: {} };
    const e = byEndpoint[r.label];
    r.ok ? e.pass++ : e.fail++;
    e.times.push(r.ms);
    e.statuses[r.status] = (e.statuses[r.status] || 0) + 1;
    if (!r.ok && r.err) e.lastErr = r.err;
  }

  console.log('\n' + '─'.repeat(60));
  console.log('📊 RESULTS BY ENDPOINT\n');

  for (const [label, data] of Object.entries(byEndpoint)) {
    const times = data.times.sort((a,b) => a-b);
    const avg = Math.round(times.reduce((s,t) => s+t, 0) / times.length);
    const p95 = times[Math.floor(times.length * 0.95)];
    const p99 = times[Math.floor(times.length * 0.99)];
    const icon = data.fail === 0 ? '✅' : data.fail < data.pass ? '⚠️' : '❌';
    const statStr = Object.entries(data.statuses).map(([s,c]) => `${s}×${c}`).join(' ');
    console.log(`${icon} ${label}`);
    console.log(`   Pass: ${data.pass} | Fail: ${data.fail} | Statuses: ${statStr}`);
    console.log(`   Avg: ${avg}ms | p95: ${p95}ms | p99: ${p99}ms`);
    if (data.lastErr) console.log(`   ⚠️  Error: ${data.lastErr}`);
    console.log();
  }

  const totalPass = allResults.filter(r => r.ok).length;
  const totalFail = allResults.length - totalPass;
  const allTimes = allResults.map(r => r.ms).sort((a,b) => a-b);
  const overallAvg = Math.round(allTimes.reduce((s,t) => s+t, 0) / allTimes.length);
  const p95 = allTimes[Math.floor(allTimes.length * 0.95)];
  const p99 = allTimes[Math.floor(allTimes.length * 0.99)];
  const rps = Math.round(USERS / (totalMs / 1000));

  console.log('─'.repeat(60));
  console.log('🏁 OVERALL SUMMARY\n');
  console.log(`  Total requests : ${USERS}`);
  console.log(`  Passed         : ${totalPass} (${((totalPass/USERS)*100).toFixed(1)}%)`);
  console.log(`  Failed         : ${totalFail}`);
  console.log(`  Total time     : ${totalMs}ms`);
  console.log(`  Throughput     : ~${rps} req/s`);
  console.log(`  Avg latency    : ${overallAvg}ms`);
  console.log(`  p95 latency    : ${p95}ms`);
  console.log(`  p99 latency    : ${p99}ms`);

  const grade = totalPass / USERS;
  if (grade === 1)        console.log('\n🟢 ALL SYSTEMS GO — 100% pass rate');
  else if (grade >= 0.95) console.log('\n🟡 MOSTLY PASSING — minor issues');
  else if (grade >= 0.80) console.log('\n🟠 DEGRADED — some endpoints failing');
  else                    console.log('\n🔴 CRITICAL — major failures detected');

  console.log('─'.repeat(60));
}

main().catch(console.error);
