/* ================================================================
   Provenode Console — app.js
   Real API-wired dashboard for Shelby testnet model deployment.
   ================================================================ */

'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  page: 'dashboard',
  models: [],
  deployments: [],
  shelbyConnected: false,
  shelbyMode: 'demo',
  deploymentPollTimers: {},
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body, isForm = false) {
  try {
    const opts = { method, headers: {} };
    if (body) {
      if (isForm) {
        opts.body = body;
      } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(path, opts);
    const json = await res.json();
    return { ok: res.ok, status: res.status, data: json };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

// ── Toast system ──────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 4000) {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  state.page = page;
  // Update topbar title
  const titles = {
    dashboard: 'Dashboard',
    deploy: 'Deploy Model',
    registry: 'Model Registry',
    fleet: 'Edge Fleet',
    shelby: 'Shelby Delivery Layer',
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const [statusRes, modelsRes, shelbyRes] = await Promise.all([
    api('GET', '/api/status'),
    api('GET', '/api/models'),
    api('GET', '/api/shelby-status'),
  ]);

  // Stats
  const models   = modelsRes.ok ? (modelsRes.data.models || []) : [];
  const deploys  = statusRes.ok ? (statusRes.data.deployments || []) : [];
  const shelby   = shelbyRes.ok ? shelbyRes.data : {};

  state.models = models;
  state.deployments = deploys;
  state.shelbyConnected = shelby.connected ?? false;
  state.shelbyMode = shelby.mode || 'demo';

  // Update sidebar badge
  const badge = document.getElementById('shelby-badge-text');
  if (badge) {
    badge.textContent = state.shelbyConnected ? 'SHELBY · LIVE' : 'SHELBY · DEMO';
    badge.closest('.shelby-badge').style.borderColor = state.shelbyConnected ? 'var(--shelby)' : 'var(--text-muted)';
  }

  // Stat cards
  set('stat-models',  models.length);
  set('stat-deploys', deploys.length);

  const verified = deploys.filter(d => d.status === 'verified').length;
  const inFlight = deploys.filter(d => d.status === 'deploying').length;
  set('stat-verified', verified);
  set('stat-inflight', inFlight);

  // Recent deployments
  renderDeploymentFeed(deploys.slice(0, 5));

  // Recent models
  renderRecentModels(models.slice(0, 4));
}

function renderDeploymentFeed(deploys) {
  const el = document.getElementById('deploy-feed');
  if (!el) return;
  if (!deploys.length) {
    el.innerHTML = `<div class="text-muted text-sm" style="padding:16px">No deployments yet. <a href="#" onclick="navigate('deploy')">Deploy your first model →</a></div>`;
    return;
  }
  el.innerHTML = deploys.map(d => {
    const dot = d.status === 'verified' ? 'green' : d.status === 'deploying' ? 'coral' : 'amber';
    const badge = d.status === 'verified' ? 'badge-green' : d.status === 'deploying' ? 'badge-blue' : 'badge-amber';
    const age = timeAgo(d.createdAt);
    return `
      <div class="feed-item">
        <div class="feed-dot ${dot}"></div>
        <div style="flex:1">
          <div class="fw-700">${escHtml(d.model)} <span style="font-weight:400;color:var(--text-muted)">v${escHtml(d.version)}</span></div>
          <div class="flex gap-2 mb-2" style="margin-top:4px">
            <span class="badge ${badge}">${d.status}</span>
            <span class="badge badge-demo">${d.mode}</span>
            ${d.region ? `<span class="text-muted text-sm">${escHtml(d.region)}</span>` : ''}
          </div>
          <div class="progress-track" style="width:180px">
            <div class="progress-bar ${d.status === 'verified' ? 'green' : ''}" style="width:${d.progress||0}%"></div>
          </div>
        </div>
        <div class="feed-time">${age}</div>
      </div>`;
  }).join('');
}

function renderRecentModels(models) {
  const el = document.getElementById('recent-models');
  if (!el) return;
  if (!models.length) {
    el.innerHTML = `<div class="text-muted text-sm" style="padding:16px">No models registered. <a href="#" onclick="navigate('deploy')">Upload one →</a></div>`;
    return;
  }
  el.innerHTML = models.map(m => `
    <tr>
      <td><strong>${escHtml(m.model)}</strong></td>
      <td><span class="badge ${m.mode === 'shelby' ? 'badge-shelby' : 'badge-demo'}">${m.mode}</span></td>
      <td class="mono">${m.sha256 ? m.sha256.slice(0,8) + '…' + m.sha256.slice(-4) : '—'}</td>
      <td>${formatBytes(m.size)}</td>
      <td>
        <a href="/verify.html?id=${m.id}&name=${encodeURIComponent(m.model)}&hash=${m.sha256}" target="_blank" class="btn btn-sm">Proof ↗</a>
      </td>
    </tr>`).join('');
}

// ── Deploy page ───────────────────────────────────────────────────────────────
function initDeployPage() {
  const dropzone  = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-btn');
  const deployBtn = document.getElementById('deploy-btn');

  // Drop zone wiring
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFileSelected(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFileSelected(fileInput.files[0]); });

  uploadBtn.addEventListener('click', doUpload);
  deployBtn.addEventListener('click', doDeploy);
}

let selectedFile = null;
let uploadedRecord = null;

function handleFileSelected(file) {
  selectedFile = file;
  uploadedRecord = null;
  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = formatBytes(file.size);
  document.getElementById('file-info').classList.remove('hidden');
  document.getElementById('upload-result').classList.add('hidden');
  document.getElementById('upload-btn').disabled = false;
  document.getElementById('deploy-btn').disabled = true;
  document.getElementById('dropzone-text').textContent = file.name;
}

async function doUpload() {
  if (!selectedFile) return;
  const btn = document.getElementById('upload-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spin"></span> Hashing & uploading…';

  const formData = new FormData();
  formData.append('file', selectedFile);
  const nameVal = document.getElementById('model-name-input').value.trim();
  if (nameVal) formData.append('name', nameVal);

  const { ok, data } = await api('POST', '/api/upload', formData, true);

  btn.innerHTML = 'Hash & Register';
  btn.disabled = false;

  if (!ok || !data.success) {
    toast(data.error || 'Upload failed.', 'error');
    return;
  }

  uploadedRecord = data;
  if (data.warning) toast(data.warning, 'warning');

  // Show result
  document.getElementById('upload-result').classList.remove('hidden');
  set('res-model', nameVal || selectedFile.name);
  set('res-hash', data.hash ? data.hash.slice(0,16) + '…' : '—');
  set('res-size', formatBytes(data.size));
  set('res-id', data.id ? data.id.slice(0,8) + '…' : '—');
  document.getElementById('res-mode').className = `badge ${data.mode === 'shelby' ? 'badge-shelby' : 'badge-demo'}`;
  document.getElementById('res-mode').textContent = data.mode;
  document.getElementById('res-proof-link').href = `/verify.html?id=${data.id}&name=${encodeURIComponent(nameVal || selectedFile.name)}&hash=${data.hash}`;

  document.getElementById('deploy-btn').disabled = false;
  toast(`Model registered in ${data.mode} mode.`, 'success');

  // Refresh state
  await loadRegistryPage();
}

async function doDeploy() {
  if (!uploadedRecord) return;
  const btn = document.getElementById('deploy-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spin"></span> Deploying…';

  const { ok, data } = await api('POST', '/api/deploy', {
    modelId: uploadedRecord.id,
    region: document.getElementById('deploy-region').value || 'Global',
  });

  btn.innerHTML = 'Deploy to Fleet';
  btn.disabled = false;

  if (!ok || !data.success) {
    toast(data.error || 'Deploy failed.', 'error');
    return;
  }

  if (data.warning) toast(data.warning, 'warning');
  toast(`Deployment started — ID ${data.manifest.id.slice(0,8)}`, 'success');

  // Start polling this deployment
  pollDeployment(data.manifest.id);
  navigate('dashboard');
  await loadDashboard();
}

// ── Registry page ─────────────────────────────────────────────────────────────
async function loadRegistryPage() {
  const { ok, data } = await api('GET', '/api/models');
  if (!ok) { toast('Failed to load models.', 'error'); return; }
  state.models = data.models || [];
  renderRegistryTable(state.models);
}

function renderRegistryTable(models) {
  const el = document.getElementById('registry-tbody');
  if (!el) return;
  if (!models.length) {
    el.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No models registered yet.</td></tr>`;
    return;
  }
  el.innerHTML = models.map(m => `
    <tr>
      <td><strong>${escHtml(m.model)}</strong><br><span class="text-muted text-sm">${timeAgo(m.createdAt)}</span></td>
      <td><span class="badge ${m.mode === 'shelby' ? 'badge-shelby' : 'badge-demo'}">${m.mode}</span></td>
      <td class="mono">${m.sha256 ? m.sha256.slice(0,12) + '…' : '—'}</td>
      <td>${formatBytes(m.size)}</td>
      <td class="mono text-muted" style="font-size:10px">${escHtml(m.objectId || '—')}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-primary" onclick="deployModel('${m.id}','${escHtml(m.model)}')">Deploy</button>
          <a href="/verify.html?id=${m.id}&name=${encodeURIComponent(m.model)}&hash=${m.sha256}" target="_blank" class="btn btn-sm">Proof ↗</a>
        </div>
      </td>
    </tr>`).join('');
}

async function deployModel(modelId, modelName) {
  const { ok, data } = await api('POST', '/api/deploy', { modelId });
  if (!ok || !data.success) { toast(data.error || 'Deploy failed.', 'error'); return; }
  if (data.warning) toast(data.warning, 'warning');
  toast(`Deployment started for ${modelName}`, 'success');
  pollDeployment(data.manifest.id);
}

// ── Shelby page ───────────────────────────────────────────────────────────────
async function loadShelbyPage() {
  const [shelbyRes, modelsRes] = await Promise.all([
    api('GET', '/api/shelby-status'),
    api('GET', '/api/models'),
  ]);

  const shelby = shelbyRes.ok ? shelbyRes.data : {};
  const models = modelsRes.ok ? (modelsRes.data.models || []) : [];

  // Connection status banner
  const banner = document.getElementById('shelby-status-banner');
  if (banner) {
    if (shelby.connected) {
      banner.className = 'shelby-panel';
      banner.innerHTML = `
        <div class="shelby-panel-title"><span>●</span> SHELBY TESTNET · PRODUCTION</div>
        <div class="flex gap-2">
          <span class="badge badge-shelby">Live</span>
          <span class="badge badge-green">Connected</span>
          <span class="text-muted text-sm">Network: ${shelby.network || 'testnet'}</span>
        </div>`;
    } else {
      banner.className = 'card card-sm';
      banner.style.padding = '14px 18px';
      banner.innerHTML = `
        <div class="flex items-center gap-2 mb-2">
          <span class="badge badge-demo">Demo Mode</span>
          <strong>Shelby not configured</strong>
        </div>
        <div class="text-muted text-sm">Set <code>SHELBY_API_KEY</code> in Vercel environment variables to enable real on-chain uploads. All uploads are hashed &amp; KV-stored in demo mode.</div>`;
    }
  }

  // Proof list
  const proofsEl = document.getElementById('shelby-proofs');
  if (proofsEl) {
    if (!models.length) {
      proofsEl.innerHTML = `<div class="text-muted text-sm" style="padding:12px">No registered models yet.</div>`;
    } else {
      proofsEl.innerHTML = models.map(m => `
        <div class="proof-card">
          <div class="flex items-center gap-2 mb-2">
            <span class="badge ${m.mode === 'shelby' ? 'badge-shelby' : 'badge-demo'}">${m.mode}</span>
            <strong>${escHtml(m.model)}</strong>
            <span class="ml-auto text-muted text-sm">${formatBytes(m.size)}</span>
          </div>
          <div class="proof-hash mb-2">${m.objectId || '—'}</div>
          <div class="flex gap-2 items-center">
            <span class="proof-hash">sha256: ${m.sha256 ? m.sha256.slice(0,16)+'…' : '—'}</span>
            <a href="/verify.html?id=${m.id}&name=${encodeURIComponent(m.model)}&hash=${m.sha256}" target="_blank" class="btn btn-sm ml-auto">Public proof ↗</a>
          </div>
        </div>`).join('');
    }
  }

  // Stats
  const shelbyModels = models.filter(m => m.mode === 'shelby');
  set('shelby-stat-objects', shelbyModels.length);
  set('shelby-stat-total',   models.length);
}

// ── Deployment polling ────────────────────────────────────────────────────────
function pollDeployment(id) {
  if (state.deploymentPollTimers[id]) return;
  state.deploymentPollTimers[id] = setInterval(async () => {
    const { ok, data } = await api('GET', `/api/status?id=${id}`);
    if (!ok) return;
    const m = data.manifest;
    if (m.status === 'verified' || m.progress >= 100) {
      clearInterval(state.deploymentPollTimers[id]);
      delete state.deploymentPollTimers[id];
      toast(`Deployment ${id.slice(0,8)} verified at 100%!`, 'success');
      if (state.page === 'dashboard') loadDashboard();
    }
  }, 5000);
}

// ── Utility helpers ───────────────────────────────────────────────────────────
function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(b) {
  if (!b) return '0 B';
  if (b < 1024)       return `${b} B`;
  if (b < 1048576)    return `${(b/1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b/1048576).toFixed(1)} MB`;
  return `${(b/1073741824).toFixed(2)} GB`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Nav clicks
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', async () => {
      const page = el.dataset.page;
      navigate(page);
      if (page === 'dashboard') await loadDashboard();
      if (page === 'registry')  await loadRegistryPage();
      if (page === 'shelby')    await loadShelbyPage();
      if (page === 'deploy')    initDeployPage();
    });
  });

  // Init deploy page (it's the default first click target too)
  initDeployPage();

  // Boot on dashboard
  navigate('dashboard');
  await loadDashboard();
});
