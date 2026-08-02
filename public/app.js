'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const S = { page:'dashboard', models:[], deployments:[], shelbyConnected:false, shelbyMode:'demo', features:{}, pollTimers:{} };

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, path, body, isForm=false) {
  try {
    const opts = { method, headers:{} };
    if (body) { if (isForm) { opts.body=body; } else { opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); } }
    const res = await fetch(path, opts);
    const json = await res.json().catch(()=>({}));
    return { ok:res.ok, status:res.status, data:json };
  } catch(err) { return { ok:false, status:0, data:{ error:err.message } }; }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type='info', dur=5000) {
  const icons={success:'✓',error:'✕',warning:'⚠',info:'ℹ'};
  const el=document.createElement('div');
  el.className=`toast toast-${type}`;
  el.innerHTML=`<span>${icons[type]}</span><span>${esc(msg)}</span><span class="toast-close" onclick="this.parentElement.remove()">×</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(()=>el.remove(), dur);
}

// ── Nav ───────────────────────────────────────────────────────────────────────
async function navigate(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  S.page=page;
  const titles={dashboard:'Dashboard',deploy:'Deploy Model',import:'Import from HuggingFace',registry:'Model Registry',lineage:'Lineage Graph',abtest:'A/B Tests',devices:'Device Registry',fleet:'OTA Fleet',webhooks:'Webhooks',objects:'Shelby Objects',compliance:'Compliance',shelby:'Shelby Layer'};
  document.getElementById('topbar-title').textContent=titles[page]||page;
  const loaders={dashboard:loadDashboard,registry:loadRegistry,lineage:loadLineage,abtest:loadABTest,devices:loadDevices,fleet:loadFleet,webhooks:loadWebhooks,objects:loadObjects,compliance:loadCompliance,shelby:loadShelby};
  if (loaders[page]) await loaders[page]();
  if (page==='deploy') initDeploy();
  if (page==='import') initImport();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function set(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }
function fmt(n){ if(!n) return '0 B'; if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(1)+' KB'; return (n/1048576).toFixed(1)+' MB'; }
function ago(iso){ if(!iso) return ''; const d=Date.now()-new Date(iso).getTime(),m=Math.floor(d/60000); if(m<1) return 'just now'; if(m<60) return m+'m ago'; const h=Math.floor(m/60); if(h<24) return h+'h ago'; return Math.floor(h/24)+'d ago'; }
function modeBadge(m){ return m==='shelby'?'<span class="badge badge-shelby">shelby</span>':'<span class="badge badge-demo">demo</span>'; }

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const [sR,mR,shR,oR] = await Promise.all([api('GET','/api/status'),api('GET','/api/models'),api('GET','/api/shelby-status'),api('GET','/api/objects')]);
  const models=mR.data?.models||[]; const deps=sR.data?.deployments||[]; const sh=shR.data||{}; const objs=oR.data||{};
  S.models=models; S.deployments=deps; S.shelbyConnected=sh.connected; S.shelbyMode=sh.mode;
  const b=document.getElementById('sb-badge');
  if(b){ b.textContent=sh.connected?'SHELBY · LIVE':'SHELBY · DEMO'; b.closest('.shelby-badge').style.opacity=sh.connected?'1':'0.7'; }
  set('stat-models',models.length); set('stat-deploys',deps.length);
  set('stat-verified',deps.filter(d=>d.status==='verified').length);
  set('stat-inflight',deps.filter(d=>d.status==='deploying').length);
  set('stat-shelby-objects',objs.stats?.total||0);
  set('stat-expiring',objs.stats?.expiringSoon||0);
  renderFeed(deps.slice(0,6)); renderRecentModels(models.slice(0,5));
}

function renderFeed(deps) {
  const el=document.getElementById('deploy-feed'); if(!el) return;
  if(!deps.length){ el.innerHTML='<div class="empty">No deployments yet. <a href="#" onclick="navigate(\'deploy\')">Deploy a model →</a></div>'; return; }
  el.innerHTML=deps.map(d=>{
    const dot=d.status==='verified'?'green':d.status==='deploying'?'coral':d.status==='rolled_back'?'red':'amber';
    const bCls=d.status==='verified'?'badge-green':d.status==='deploying'?'badge-blue':d.status==='rolled_back'?'badge-red':'badge-amber';
    return `<div class="feed-item"><div class="feed-dot ${dot}"></div><div style="flex:1"><div class="fw-700">${esc(d.model)} <span class="text-muted">v${esc(d.version)}</span>${d.canary?'<span class="badge badge-blue" style="margin-left:6px">canary</span>':''}</div><div class="flex gap-2" style="margin:4px 0"><span class="badge ${bCls}">${d.status}</span>${modeBadge(d.mode)}<span class="text-muted text-sm">${esc(d.region||'Global')}</span></div><div class="progress-track" style="width:160px"><div class="progress-bar ${d.status==='verified'?'green':''}" style="width:${d.progress||0}%"></div></div></div><div class="feed-time">${ago(d.createdAt)}</div></div>`;
  }).join('');
}

function renderRecentModels(models) {
  const el=document.getElementById('recent-models'); if(!el) return;
  if(!models.length){ el.innerHTML='<tr><td colspan="5" class="empty">No models yet.</td></tr>'; return; }
  el.innerHTML=models.map(m=>`<tr><td><strong>${esc(m.model)}</strong>${m.tags?.length?'<br>'+m.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(''):''}</td><td>${modeBadge(m.mode)}</td><td class="mono">${m.sha256?m.sha256.slice(0,10)+'…':'—'}</td><td>${fmt(m.size)}</td><td><a href="/verify.html?id=${m.id}&name=${encodeURIComponent(m.model)}&hash=${m.sha256}" target="_blank" class="btn btn-sm">Proof ↗</a></td></tr>`).join('');
}

// ── Deploy ────────────────────────────────────────────────────────────────────
function initDeploy() {
  const dz=document.getElementById('dropzone'), fi=document.getElementById('file-input');
  if(dz._init) return; dz._init=true;
  dz.addEventListener('click',()=>fi.click());
  dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over');});
  dz.addEventListener('dragleave',()=>dz.classList.remove('drag-over'));
  dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag-over');if(e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);});
  fi.addEventListener('change',()=>fi.files[0]&&setFile(fi.files[0]));
  document.getElementById('upload-btn').addEventListener('click',doUpload);
  document.getElementById('deploy-btn').addEventListener('click',doDeploy);
}

let selFile=null, uploadedRec=null;
function setFile(f){ selFile=f; uploadedRec=null; set('file-name',f.name); set('file-size',fmt(f.size)); document.getElementById('file-info').classList.remove('hidden'); document.getElementById('upload-result').classList.add('hidden'); document.getElementById('upload-btn').disabled=false; document.getElementById('deploy-btn').disabled=true; set('dz-text',f.name); }

async function doUpload() {
  if(!selFile) return;
  const btn=document.getElementById('upload-btn'); btn.disabled=true; btn.innerHTML='<span class="spin"></span> Hashing & uploading…';
  const fd=new FormData(); fd.append('file',selFile);
  const n=document.getElementById('model-name-input').value.trim();
  if(n) fd.append('name',n);
  const pid=document.getElementById('parent-id-input')?.value.trim();
  if(pid) fd.append('parentId',pid);
  const tags=document.getElementById('tags-input')?.value.trim();
  if(tags) fd.append('tags',tags);
  const {ok,data}=await api('POST','/api/upload',fd,true);
  btn.innerHTML='Hash & Register'; btn.disabled=false;
  if(!ok||!data.success){ toast(data.error||'Upload failed.','error'); return; }
  uploadedRec=data;
  if(data.warning) toast(data.warning,'warning');
  document.getElementById('upload-result').classList.remove('hidden');
  set('res-model',n||selFile.name); set('res-hash',data.hash?data.hash.slice(0,16)+'…':'—');
  set('res-size',fmt(data.size)); set('res-id',data.id?data.id.slice(0,8)+'…':'—');
  set('res-expires',data.expiresAt?new Date(data.expiresAt).toLocaleDateString():'N/A');
  const mb=document.getElementById('res-mode'); mb.className='badge '+(data.mode==='shelby'?'badge-shelby':'badge-demo'); mb.textContent=data.mode;
  document.getElementById('res-proof-link').href=`/verify.html?id=${data.id}&name=${encodeURIComponent(n||selFile.name)}&hash=${data.hash}`;
  document.getElementById('deploy-btn').disabled=false;
  toast(`Registered in ${data.mode} mode.`,'success');
}

async function doDeploy() {
  if(!uploadedRec) return;
  const btn=document.getElementById('deploy-btn'); btn.disabled=true; btn.innerHTML='<span class="spin"></span> Deploying…';
  const canary=document.getElementById('canary-toggle')?.checked;
  const {ok,data}=await api('POST','/api/deploy',{modelId:uploadedRec.id,region:document.getElementById('deploy-region').value||'Global',canary});
  btn.innerHTML='Deploy to Fleet'; btn.disabled=false;
  if(!ok||!data.success){ toast(data.error||'Deploy failed.','error'); return; }
  if(data.warning) toast(data.warning,'warning');
  toast(`Deployment started${canary?' (canary mode)':''} — ${data.manifest.id.slice(0,8)}`,'success');
  navigate('dashboard');
}

// ── Import ────────────────────────────────────────────────────────────────────
function initImport() {
  const btn=document.getElementById('hf-import-btn');
  if(btn._init) return; btn._init=true;
  btn.addEventListener('click',doHFImport);
}

async function doHFImport() {
  const repo=document.getElementById('hf-repo').value.trim();
  const file=document.getElementById('hf-file').value.trim();
  const name=document.getElementById('hf-name').value.trim();
  if(!repo||!file){ toast('Repo and filename required.','error'); return; }
  const btn=document.getElementById('hf-import-btn'); btn.disabled=true; btn.innerHTML='<span class="spin"></span> Fetching from HuggingFace…';
  const {ok,data}=await api('POST','/api/import',{source:'huggingface',repo,filename:file,name:name||undefined});
  btn.innerHTML='Import Model'; btn.disabled=false;
  if(!ok||!data.success){ toast(data.error||'Import failed.','error'); return; }
  toast(`Imported ${repo}/${file} — ${fmt(data.size)}`,'success');
  document.getElementById('import-result').classList.remove('hidden');
  set('imp-model',data.job?.name); set('imp-hash',data.hash?data.hash.slice(0,16)+'…':'—');
  set('imp-size',fmt(data.size)); set('imp-mode',data.mode);
  document.getElementById('imp-deploy-btn').onclick=()=>api('POST','/api/deploy',{modelId:data.modelId}).then(()=>{ toast('Deployment started!','success'); navigate('dashboard'); });
}

async function loadImportJobs() {
  const {data}=await api('GET','/api/import');
  const el=document.getElementById('import-history'); if(!el) return;
  const jobs=data?.jobs||[];
  if(!jobs.length){ el.innerHTML='<tr><td colspan="5" class="empty">No imports yet.</td></tr>'; return; }
  el.innerHTML=jobs.map(j=>`<tr><td>${esc(j.repo||j.name)}</td><td>${esc(j.filename||'—')}</td><td><span class="badge ${j.status==='complete'?'badge-green':j.status==='failed'?'badge-red':'badge-amber'}">${j.status}</span></td><td>${j.size?fmt(j.size):'—'}</td><td>${ago(j.createdAt)}</td></tr>`).join('');
}

// ── Registry ──────────────────────────────────────────────────────────────────
async function loadRegistry() {
  const {data}=await api('GET','/api/models');
  S.models=data?.models||[];
  const el=document.getElementById('registry-tbody'); if(!el) return;
  if(!S.models.length){ el.innerHTML='<tr><td colspan="7" class="empty">No models yet.</td></tr>'; return; }
  el.innerHTML=S.models.map(m=>`<tr><td><strong>${esc(m.model)}</strong><br><span class="text-sm text-muted">${ago(m.createdAt)}</span>${m.tags?.length?'<br>'+m.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(''):''}</td><td>${modeBadge(m.mode)}</td><td class="mono">${m.sha256?m.sha256.slice(0,12)+'…':'—'}</td><td>${fmt(m.size)}</td><td class="mono text-sm text-muted">${esc((m.objectId||'').slice(0,30))}…</td><td>${m.expiresAt?new Date(m.expiresAt).toLocaleDateString():'—'}</td><td><div class="flex gap-1"><button class="btn btn-sm btn-primary" onclick="deployModel('${m.id}','${esc(m.model)}')">Deploy</button><button class="btn btn-sm" onclick="showLineage('${m.id}')">Tree</button><a href="/verify.html?id=${m.id}&name=${encodeURIComponent(m.model)}&hash=${m.sha256}" target="_blank" class="btn btn-sm">Proof ↗</a></div></td></tr>`).join('');
}

async function deployModel(modelId, modelName) {
  const {ok,data}=await api('POST','/api/deploy',{modelId});
  if(!ok||!data.success){ toast(data.error||'Deploy failed.','error'); return; }
  toast(`Deployment started for ${modelName}`,'success');
}

async function showLineage(modelId) { navigate('lineage'); await loadLineage(modelId); }

// ── Lineage ───────────────────────────────────────────────────────────────────
async function loadLineage(focusId) {
  const id=focusId||document.getElementById('lineage-model-select')?.value;
  if(!id) {
    const {data}=await api('GET','/api/models');
    const sel=document.getElementById('lineage-model-select'); if(!sel) return;
    sel.innerHTML=(data?.models||[]).map(m=>`<option value="${m.id}">${esc(m.model)}</option>`).join('');
    return;
  }
  const {ok,data}=await api('GET',`/api/lineage?modelId=${id}`);
  if(!ok){ toast(data.error||'Failed','error'); return; }
  const el=document.getElementById('lineage-graph'); if(!el) return;
  const { root, ancestors, descendants } = data;
  const nodeHtml=(n,cls='')=>`<div class="lineage-node ${cls}"><div class="fw-700">${esc(n.model)}</div><div class="mono text-sm">${n.sha256?n.sha256.slice(0,8)+'…':'—'}</div><div>${modeBadge(n.mode)}</div><div class="text-sm text-muted">${ago(n.createdAt)}</div></div>`;
  let html='<div class="lineage-tree">';
  if(ancestors.length){ html+=ancestors.map(a=>nodeHtml(a,'ancestor')+`<div class="lineage-arrow">↓</div>`).join(''); }
  html+=nodeHtml(root,'root');
  if(descendants.length){ html+=descendants.map(d=>`<div class="lineage-arrow">↓</div>`+nodeHtml(d,'descendant')).join(''); }
  html+='</div>';
  html+=`<div style="margin-top:16px;font-size:12px;color:var(--text-muted)">Depth: ${data.depth} · ${ancestors.length} ancestor(s) · ${descendants.length} descendant(s)</div>`;
  el.innerHTML=html;
}

// ── A/B Tests ─────────────────────────────────────────────────────────────────
async function loadABTest() {
  const [{data:mData},{data:tData}]=await Promise.all([api('GET','/api/models'),api('GET','/api/abtest')]);
  const models=mData?.models||[]; const tests=tData?.tests||[];
  const selA=document.getElementById('ab-model-a'),selB=document.getElementById('ab-model-b');
  if(selA&&selB){const opts=models.map(m=>`<option value="${m.id}">${esc(m.model)}</option>`).join('');selA.innerHTML=opts;selB.innerHTML=opts;}
  const el=document.getElementById('abtest-list'); if(!el) return;
  if(!tests.length){el.innerHTML='<div class="empty">No A/B tests yet.</div>';return;}
  el.innerHTML=tests.map(t=>`<div class="card card-sm" style="margin-bottom:12px"><div class="card-header"><span class="card-title">${esc(t.name)}</span><span class="badge ${t.status==='running'?'badge-green':t.status==='ended'?'badge-demo':'badge-amber'}">${t.status}</span></div><div class="card-body" style="padding:12px"><div class="flex gap-4 text-sm"><div><span class="form-label">Model A</span>${esc(models.find(m=>m.id===t.modelAId)?.model||t.modelAId.slice(0,8))}</div><div><span class="form-label">Model B</span>${esc(models.find(m=>m.id===t.modelBId)?.model||t.modelBId.slice(0,8))}</div><div><span class="form-label">Split</span>${t.splitPercent}/${100-t.splitPercent}</div><div><span class="form-label">Ends</span>${new Date(t.endsAt).toLocaleDateString()}</div></div><div class="flex gap-2" style="margin-top:10px"><button class="btn btn-sm" onclick="viewABTest('${t.id}')">Results</button>${t.status==='running'?`<button class="btn btn-sm btn-danger" onclick="endABTest('${t.id}')">End test</button>`:''}</div></div></div>`).join('');
}

async function createABTest() {
  const name=document.getElementById('ab-name')?.value.trim();
  const modelAId=document.getElementById('ab-model-a')?.value;
  const modelBId=document.getElementById('ab-model-b')?.value;
  const split=parseInt(document.getElementById('ab-split')?.value||'50');
  const hours=parseInt(document.getElementById('ab-hours')?.value||'24');
  if(!name||!modelAId||!modelBId){ toast('Name and both models required.','error'); return; }
  if(modelAId===modelBId){ toast('Models must be different.','error'); return; }
  const {ok,data}=await api('POST','/api/abtest',{name,modelAId,modelBId,splitPercent:split,durationHours:hours});
  if(!ok){ toast(data.error||'Failed','error'); return; }
  toast(`A/B test "${name}" created!`,'success'); await loadABTest();
}

async function viewABTest(id) {
  const {ok,data}=await api('GET',`/api/abtest?id=${id}`);
  if(!ok){ toast(data.error||'Failed','error'); return; }
  const t=data.test,r=data.results;
  toast(`A: ${r.a.count} runs, ${r.a.avgLatency}ms avg · B: ${r.b.count} runs, ${r.b.avgLatency}ms avg`,'info',8000);
}

async function endABTest(id) {
  const {ok,data}=await api('DELETE',`/api/abtest?id=${id}`);
  if(!ok){ toast(data.error||'Failed','error'); return; }
  toast('Test ended.','success'); await loadABTest();
}

// ── Devices ───────────────────────────────────────────────────────────────────
async function loadDevices() {
  const {ok,data}=await api('GET','/api/devices');
  const devices=data?.devices||[];
  set('stat-device-total',devices.length);
  set('stat-device-online',devices.filter(d=>d.status==='online').length);
  const el=document.getElementById('devices-tbody'); if(!el) return;
  if(!devices.length){el.innerHTML='<tr><td colspan="7" class="empty">No devices registered.</td></tr>';return;}
  el.innerHTML=devices.map(d=>`<tr><td class="mono fw-700">${esc(d.id)}</td><td>${esc(d.type)}</td><td>${esc(d.arch)}</td><td>${esc(d.location)}</td><td>${esc(d.fleet)}</td><td><span class="badge ${d.status==='online'?'badge-green':'badge-amber'}">${d.status}</span></td><td>${ago(d.lastSeenAt)}</td></tr>`).join('');
}

async function registerDevice() {
  const id=document.getElementById('dev-id')?.value.trim();
  const type=document.getElementById('dev-type')?.value;
  const arch=document.getElementById('dev-arch')?.value;
  const loc=document.getElementById('dev-loc')?.value.trim();
  const fleet=document.getElementById('dev-fleet')?.value.trim();
  if(!id){ toast('Device ID required.','error'); return; }
  const {ok,data}=await api('POST','/api/devices',{deviceId:id,type,arch,location:loc,fleet});
  if(!ok){ toast(data.error||'Failed','error'); return; }
  toast(`Device ${id} registered!`,'success'); await loadDevices();
  document.getElementById('register-device-form').classList.add('hidden');
}

// ── Fleet / OTA ───────────────────────────────────────────────────────────────
async function loadFleet() {
  const [{data:devData},{data:depData}]=await Promise.all([api('GET','/api/devices'),api('GET','/api/status')]);
  const devices=devData?.devices||[]; const deps=depData?.deployments||[];
  const el=document.getElementById('fleet-tbody'); if(!el) return;
  if(!devices.length){el.innerHTML='<tr><td colspan="6" class="empty">No devices.</td></tr>';return;}
  el.innerHTML=devices.map(d=>`<tr><td class="mono fw-700">${esc(d.id)}</td><td>${esc(d.type)}</td><td>${esc(d.location)}</td><td><span class="badge ${d.status==='online'?'badge-green':'badge-amber'}">${d.status}</span></td><td class="text-sm mono">${d.currentModelId?d.currentModelId.slice(0,8)+'…':'Not deployed'}</td><td>${ago(d.lastSeenAt)}</td></tr>`).join('');

  const canaryDeps=deps.filter(d=>d.canary&&d.status!=='verified'&&d.status!=='rolled_back');
  const ce=document.getElementById('canary-list'); if(ce){
    if(!canaryDeps.length){ce.innerHTML='<div class="empty">No active canary deployments.</div>';return;}
    ce.innerHTML=canaryDeps.map(d=>{
      const stages=d.canary.stages; const cur=d.canary.currentStage; const curPct=stages[cur];
      return `<div class="card card-sm" style="margin-bottom:12px"><div class="card-header"><span class="card-title">${esc(d.model)} v${esc(d.version)}</span><span class="badge badge-blue">canary ${curPct}%</span></div><div class="card-body" style="padding:12px"><div class="flex gap-2 mb-2">${stages.map((s,i)=>`<span class="badge ${i<cur?'badge-green':i===cur?'badge-blue':'badge-demo'}">${s}%</span>`).join('→')}</div><div class="flex gap-2"><button class="btn btn-sm btn-primary" onclick="advanceCanary('${d.id}')">Advance →</button><button class="btn btn-sm btn-danger" onclick="rollbackCanary('${d.id}')">Rollback</button></div></div></div>`;
    }).join('');
  }
}

async function advanceCanary(id){ const {ok,data}=await api('POST',`/api/fleet/canary/${id}/advance`); if(!ok){toast(data.error||'Failed','error');return;} toast('Advanced to next canary stage!','success'); await loadFleet(); }
async function rollbackCanary(id){ const {ok,data}=await api('POST',`/api/fleet/canary/${id}/rollback`); if(!ok){toast(data.error||'Failed','error');return;} toast('Deployment rolled back.','warning'); await loadFleet(); }

// ── Webhooks ──────────────────────────────────────────────────────────────────
async function loadWebhooks() {
  const {ok,data}=await api('GET','/api/webhooks');
  const hooks=data?.webhooks||[];
  const el=document.getElementById('webhooks-list'); if(!el) return;
  if(!hooks.length){el.innerHTML='<div class="empty">No webhooks registered yet.</div>';return;}
  el.innerHTML=hooks.map(h=>`<div class="card card-sm mb-2"><div class="card-header"><span class="card-title">${esc(h.name||h.url)}</span><span class="badge ${h.enabled?'badge-green':'badge-demo'}">${h.enabled?'enabled':'disabled'}</span></div><div class="card-body" style="padding:10px 14px"><div class="mono text-sm mb-2">${esc(h.url)}</div><div class="flex gap-2 mb-2">${(h.events||[]).map(e=>`<span class="tag">${esc(e)}</span>`).join('')}</div>${h.lastFiredAt?`<div class="text-sm text-muted">Last fired: ${ago(h.lastFiredAt)} · Status: ${h.lastStatus}</div>`:''}<div class="flex gap-2" style="margin-top:8px"><button class="btn btn-sm btn-danger" onclick="deleteWebhook('${h.id}')">Delete</button></div></div></div>`).join('');
}

async function createWebhook() {
  const url=document.getElementById('wh-url')?.value.trim();
  const events=document.getElementById('wh-events')?.value.trim().split(',').map(e=>e.trim()).filter(Boolean);
  const secret=document.getElementById('wh-secret')?.value.trim();
  const name=document.getElementById('wh-name')?.value.trim();
  if(!url){ toast('URL required.','error'); return; }
  const {ok,data}=await api('POST','/api/webhooks',{url,events:events.length?events:['*'],secret:secret||undefined,name:name||undefined});
  if(!ok){ toast(data.error||'Failed','error'); return; }
  toast('Webhook registered!','success'); await loadWebhooks();
}

async function deleteWebhook(id){ await api('DELETE',`/api/webhooks?id=${id}`); toast('Webhook deleted.','info'); await loadWebhooks(); }
async function testWebhook(){ await api('POST','/api/webhooks',{action:'test'}); toast('Test event dispatched to all webhooks!','success'); }

// ── Objects ───────────────────────────────────────────────────────────────────
async function loadObjects() {
  const {ok,data}=await api('GET','/api/objects');
  if(!ok){ toast(data.error||'Failed','error'); return; }
  const objs=data?.objects||[]; const stats=data?.stats||{};
  set('obj-total',stats.total||0); set('obj-healthy',stats.healthy||0); set('obj-expiring',stats.expiringSoon||0); set('obj-expired',stats.expired||0);
  const el=document.getElementById('objects-tbody'); if(!el) return;
  if(!objs.length){el.innerHTML='<tr><td colspan="6" class="empty">No Shelby objects yet. Upload a model with SHELBY_API_KEY configured.</td></tr>';return;}
  el.innerHTML=objs.map(o=>`<tr><td><strong>${esc(o.model)}</strong></td><td class="mono text-sm">${esc((o.objectId||'').replace('shelby://shelbynet/','…'))}</td><td class="mono text-sm">${o.sha256?o.sha256.slice(0,12)+'…':'—'}</td><td>${fmt(o.size)}</td><td><span class="badge ${o.status==='healthy'?'badge-green':o.status==='expiring_soon'?'badge-amber':'badge-red'}">${o.daysLeft!=null?o.daysLeft+'d left':'unknown'}</span></td><td>${ago(o.createdAt)}</td></tr>`).join('');
}

// ── Compliance ────────────────────────────────────────────────────────────────
async function loadCompliance() {
  const from=document.getElementById('comp-from')?.value;
  const to=document.getElementById('comp-to')?.value;
  const qs=new URLSearchParams(); if(from) qs.set('from',from); if(to) qs.set('to',to);
  const {ok,data}=await api('GET',`/api/compliance/report?${qs}`);
  if(!ok){ toast(data.error||'Failed','error'); return; }
  const r=data.report;
  set('comp-models',r.summary?.models||0); set('comp-deploys',r.summary?.deployments||0);
  set('comp-devices',r.summary?.devices||0); set('comp-shelby',r.summary?.shelbyMode||0);
  const el=document.getElementById('comp-tbody'); if(!el) return;
  el.innerHTML=(r.models||[]).map(m=>`<tr><td class="mono text-sm">${m.id.slice(0,8)}…</td><td>${esc(m.model)}</td><td class="mono text-sm">${m.sha256?m.sha256.slice(0,12)+'…':'—'}</td><td>${modeBadge(m.mode)}</td><td>${ago(m.createdAt)}</td></tr>`).join('');
}

async function exportCSV(){const from=document.getElementById('comp-from')?.value,to=document.getElementById('comp-to')?.value;const qs=new URLSearchParams({format:'csv'});if(from)qs.set('from',from);if(to)qs.set('to',to);window.open(`/api/compliance/report?${qs}`);}

// ── Shelby Layer ──────────────────────────────────────────────────────────────
async function loadShelby() {
  const [{data:sh},{data:id},{data:m}]=await Promise.all([api('GET','/api/shelby-status'),api('GET','/api/identity'),api('GET','/api/models')]);
  const banner=document.getElementById('shelby-status-banner');
  if(banner){
    if(sh.connected){
      banner.className='shelby-panel';
      banner.innerHTML=`<div class="shelby-panel-title"><span class="dot-live"></span> SHELBY TESTNET · PRODUCTION · ${esc(sh.network)}</div><div class="flex gap-2 flex-wrap">${id.configured?`<span class="badge badge-shelby">Persistent Identity</span><span class="mono text-sm" style="margin-left:4px">${(id.address||'').slice(0,12)}…</span>`:'<span class="badge badge-demo">Ephemeral Keys</span>'}</div>${id.explorerUrl?`<div style="margin-top:8px"><a href="${id.explorerUrl}" target="_blank" class="btn btn-sm btn-shelby">Explorer ↗</a></div>`:''}`;
    } else {
      banner.className='card card-sm'; banner.style.padding='14px 18px';
      banner.innerHTML=`<div class="flex gap-2 mb-2"><span class="badge badge-demo">Demo Mode</span><strong>Shelby not configured</strong></div><div class="text-muted text-sm">Set <code>SHELBY_API_KEY</code> and <code>SHELBY_PRIVATE_KEY</code> in Vercel env vars.</div>`;
    }
  }
  const models=m?.models||[]; const shelbyModels=models.filter(x=>x.mode==='shelby');
  set('shelby-stat-objects',shelbyModels.length); set('shelby-stat-total',models.length);
  const proofsEl=document.getElementById('shelby-proofs');
  if(proofsEl) proofsEl.innerHTML=models.length?models.map(x=>`<div class="proof-card"><div class="flex items-center gap-2 mb-2">${modeBadge(x.mode)}<strong>${esc(x.model)}</strong><span class="ml-auto text-muted text-sm">${fmt(x.size)}</span></div><div class="proof-hash mb-2">${esc(x.objectId||'—')}</div><div class="flex gap-2 items-center"><span class="proof-hash">sha256: ${x.sha256?x.sha256.slice(0,16)+'…':'—'}</span><a href="/verify.html?id=${x.id}&name=${encodeURIComponent(x.model)}&hash=${x.sha256}" target="_blank" class="btn btn-sm ml-auto">Proof ↗</a></div></div>`).join(''):'<div class="empty">No models yet.</div>';
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async ()=>{
  document.querySelectorAll('.nav-item[data-page]').forEach(el=>{
    el.addEventListener('click', ()=>navigate(el.dataset.page));
  });
  navigate('dashboard');
  await loadDashboard();
});


// ══════════════════════════════════════════════════════════════
// NEW FEATURES — v3.1
// ══════════════════════════════════════════════════════════════

// ── Marketplace ───────────────────────────────────────────────
async function loadMarketplace() {
  const {ok,data}=await api('GET','/api/marketplace');
  const listings=data?.listings||[];
  set('mp-total',listings.length);
  const el=document.getElementById('marketplace-grid'); if(!el) return;
  if(!listings.length){el.innerHTML='<div class="empty">No models published yet. Be the first!</div>';return;}
  el.innerHTML=listings.map(l=>`<div class="card card-sm" style="margin-bottom:12px"><div class="card-header"><span class="card-title">${esc(l.name)}</span><span class="badge badge-demo">${l.license||'MIT'}</span></div><div class="card-body" style="padding:12px"><div class="text-muted text-sm mb-2">${esc(l.description||'No description')}</div><div class="flex gap-2 mb-2">${(l.tags||[]).map(t=>'<span class="tag">'+esc(t)+'</span>').join('')}</div><div class="flex gap-2 items-center text-sm"><span>${fmt(l.size)}</span><span class="text-muted">${modeBadge(l.mode)}</span><span class="ml-auto text-muted">⬇ ${l.downloads||0}</span></div><div style="margin-top:10px"><button class="btn btn-sm btn-primary" onclick="importMarketplace('${l.id}','${esc(l.name)}')">Import</button></div></div></div>`).join('');
}

async function importMarketplace(listingId,name){
  const {ok,data}=await api('POST','/api/marketplace',{action:'import',listingId});
  if(!ok){toast(data.error||'Failed','error');return;}
  toast(`Imported ${name} → registry!`,'success'); await loadMarketplace();
}

async function publishToMarketplace(){
  const modelId=document.getElementById('mp-model-select')?.value;
  const desc=document.getElementById('mp-description')?.value.trim();
  const tags=document.getElementById('mp-tags')?.value.trim().split(',').map(t=>t.trim()).filter(Boolean);
  if(!modelId){toast('Select a model first','error');return;}
  const {ok,data}=await api('POST','/api/marketplace',{modelId,description:desc,tags});
  if(!ok){toast(data.error||'Failed','error');return;}
  toast('Published to marketplace!','success'); await loadMarketplace();
}

// ── Analytics ─────────────────────────────────────────────────
async function loadAnalyticsPage(){
  const {ok,data}=await api('GET','/api/analytics');
  if(!ok) return;
  const s=data?.summary||{};
  set('an-total',s.total||0); set('an-online',s.online||0);
  const byCls=['byType','byLocation','byFleet'];
  for(const k of byCls){
    const el=document.getElementById('an-'+k); if(!el) continue;
    const obj=s[k]||{};
    el.innerHTML=Object.entries(obj).map(([k2,v])=>`<div class="flex items-center gap-2 mb-1"><span class="text-sm fw-700">${esc(k2)}</span><span class="ml-auto badge badge-demo">${v}</span></div>`).join('');
  }
}

async function loadDeviceMetrics(){
  const id=document.getElementById('an-device-id')?.value.trim();
  const metric=document.getElementById('an-metric')?.value||'latency';
  const days=document.getElementById('an-days')?.value||'7';
  if(!id){toast('Enter a device ID','error');return;}
  const {ok,data}=await api('GET',`/api/analytics?deviceId=${id}&metric=${metric}&days=${days}`);
  if(!ok){toast(data.error||'Failed','error');return;}
  const el=document.getElementById('an-chart'); if(!el) return;
  const pts=data.points||[]; const stats=data.stats;
  if(!pts.length){el.innerHTML='<div class="empty">No data for this device/metric.</div>';return;}
  const maxVal=Math.max(...pts.map(p=>p.value),1);
  el.innerHTML=`<div style="display:flex;align-items:flex-end;gap:2px;height:80px;margin-bottom:8px">${pts.slice(-40).map(p=>`<div title="${p.value}" style="flex:1;background:var(--coral);height:${Math.round(p.value/maxVal*100)}%;min-height:2px;border-radius:2px 2px 0 0"></div>`).join('')}</div>${stats?`<div class="flex gap-4 text-sm"><span>min:<strong>${stats.min}</strong></span><span>avg:<strong>${stats.avg}</strong></span><span>max:<strong>${stats.max}</strong></span><span>p95:<strong>${stats.p95}</strong></span></div>`:''}`;
}

// ── Scheduled Deployments ─────────────────────────────────────
async function loadSchedule(){
  const {ok,data}=await api('GET','/api/schedule');
  const jobs=data?.jobs||[];
  const el=document.getElementById('schedule-list'); if(!el) return;
  if(!jobs.length){el.innerHTML='<div class="empty">No scheduled deployments.</div>';return;}
  el.innerHTML=jobs.map(j=>`<div class="card card-sm mb-2"><div class="card-header"><span class="card-title">${esc(j.label||j.id.slice(0,8))}</span><span class="badge ${j.status==='pending'?'badge-blue':j.status==='triggered'?'badge-green':'badge-red'}">${j.status}</span></div><div class="card-body" style="padding:10px 14px"><div class="text-sm">📅 ${new Date(j.scheduledFor).toLocaleString()} · ${esc(j.region)}${j.canary?' · canary':''}</div><div style="margin-top:8px"><button class="btn btn-sm btn-danger" onclick="cancelSchedule('${j.id}')">Cancel</button></div></div></div>`).join('');
}

async function createScheduledDeploy(){
  const modelId=document.getElementById('sched-model')?.value;
  const when=document.getElementById('sched-when')?.value;
  const region=document.getElementById('sched-region')?.value||'Global';
  const canary=document.getElementById('sched-canary')?.checked;
  const label=document.getElementById('sched-label')?.value.trim();
  if(!modelId||!when){toast('Model and date/time required','error');return;}
  const scheduledFor=new Date(when).toISOString();
  const {ok,data}=await api('POST','/api/schedule',{modelId,scheduledFor,region,canary,label});
  if(!ok){toast(data.error||'Failed','error');return;}
  toast('Deployment scheduled!','success'); await loadSchedule();
}

async function cancelSchedule(id){
  await api('DELETE',`/api/schedule?id=${id}`);
  toast('Scheduled deployment cancelled.','info'); await loadSchedule();
}

// ── Fleet Groups ──────────────────────────────────────────────
async function loadGroups(){
  const {ok,data}=await api('GET','/api/groups');
  const groups=data?.groups||[];
  const el=document.getElementById('groups-list'); if(!el) return;
  if(!groups.length){el.innerHTML='<div class="empty">No fleet groups yet.</div>';return;}
  el.innerHTML=groups.map(g=>`<div class="card card-sm mb-2" style="border-left:4px solid ${g.color||'var(--shelby)'}"><div class="card-header"><span class="card-title">${esc(g.name)}</span></div><div class="card-body" style="padding:10px 14px"><div class="text-muted text-sm mb-2">${esc(g.description||'No description')}</div>${g.selector?.tags?`<div>${g.selector.tags.map(t=>'<span class="tag">'+esc(t)+'</span>').join('')}</div>`:''}<div style="margin-top:8px"><button class="btn btn-sm" onclick="viewGroup('${g.id}')">View devices</button> <button class="btn btn-sm btn-danger" onclick="deleteGroup('${g.id}')">Delete</button></div></div></div>`).join('');
}

async function createGroup(){
  const name=document.getElementById('grp-name')?.value.trim();
  const desc=document.getElementById('grp-desc')?.value.trim();
  const tags=document.getElementById('grp-tags')?.value.trim().split(',').map(t=>t.trim()).filter(Boolean);
  const color=document.getElementById('grp-color')?.value||'#6366f1';
  if(!name){toast('Name required','error');return;}
  const {ok,data}=await api('POST','/api/groups',{name,description:desc,selector:tags.length?{tags}:null,color});
  if(!ok){toast(data.error||'Failed','error');return;}
  toast('Group created!','success'); await loadGroups();
}

async function viewGroup(id){
  const {ok,data}=await api('GET',`/api/groups?id=${id}`);
  if(!ok){toast('Failed','error');return;}
  toast(`${data.group.name}: ${data.memberCount} matching devices`,'info',5000);
}

async function deleteGroup(id){ await api('DELETE',`/api/groups?id=${id}`); toast('Deleted','info'); await loadGroups(); }

// ── Blue-Green ────────────────────────────────────────────────
async function loadBluegreenPage(){
  const {ok,data}=await api('GET','/api/bluegreen');
  const configs=data?.configs||[];
  const [{data:deps}]=await Promise.all([api('GET','/api/status')]);
  const depList=deps?.deployments||[];
  const sel=document.getElementById('bg-dep-select');
  if(sel) sel.innerHTML=depList.map(d=>`<option value="${d.id}">${esc(d.model)} v${esc(d.version)}</option>`).join('');
  const el=document.getElementById('bluegreen-list'); if(!el) return;
  if(!configs.length){el.innerHTML='<div class="empty">No blue-green configs.</div>';return;}
  el.innerHTML=configs.map(c=>`<div class="card card-sm mb-3"><div class="card-header"><span class="card-title">${esc(c.name)}</span><span class="badge ${c.activeSlot==='blue'?'badge-blue':'badge-green'}">ACTIVE: ${c.activeSlot.toUpperCase()}</span></div><div class="card-body" style="padding:12px"><div class="flex gap-4 text-sm mb-3"><div><span class="form-label">Blue slot</span><div class="mono">${(c.blueDeploymentId||'—').slice(0,12)}…</div></div><div><span class="form-label">Green slot</span><div class="mono">${(c.greenDeploymentId||'—').slice(0,12)}…</div></div></div><div class="flex gap-2"><button class="btn btn-sm btn-primary" onclick="switchBlueGreen('${c.projectId}')">⇄ Switch Active Slot</button></div>${c.history?.length?'<div class="text-muted text-sm" style="margin-top:8px">Last switch: '+ago(c.history[0]?.at)+'</div>':''}</div></div>`).join('');
}

async function createBluegreenConfig(){
  const projectId=document.getElementById('bg-project-id')?.value.trim();
  const name=document.getElementById('bg-name')?.value.trim();
  const blueId=document.getElementById('bg-blue-id')?.value;
  const greenId=document.getElementById('bg-green-id')?.value;
  if(!projectId||!name){toast('Project ID and name required','error');return;}
  const {ok,data}=await api('POST','/api/bluegreen',{projectId,name,blueDeploymentId:blueId,greenDeploymentId:greenId});
  if(!ok){toast(data.error||'Failed','error');return;}
  toast('Blue-green config created!','success'); await loadBluegreenPage();
}

async function switchBlueGreen(projectId){
  const {ok,data}=await api('POST','/api/bluegreen/switch',{projectId});
  if(!ok){toast(data.error||'Failed','error');return;}
  toast(`Switched to ${data.switched.to.toUpperCase()} slot! ✅`,'success'); await loadBluegreenPage();
}

// ── Audit Log ─────────────────────────────────────────────────
async function loadAuditPage(){
  const action=document.getElementById('audit-filter')?.value||'';
  const limit=document.getElementById('audit-limit')?.value||'100';
  const qs=new URLSearchParams({limit});
  if(action) qs.set('action',action);
  const {ok,data}=await api('GET',`/api/audit?${qs}`);
  const records=data?.records||[];
  const el=document.getElementById('audit-tbody'); if(!el) return;
  if(!records.length){el.innerHTML='<tr><td colspan="5" class="empty">No audit records yet.</td></tr>';return;}
  el.innerHTML=records.map(r=>`<tr><td class="mono text-sm">${new Date(r.timestamp).toLocaleString()}</td><td><span class="tag">${esc(r.action)}</span></td><td class="text-sm">${esc(r.actor)}</td><td class="mono text-sm">${esc(r.target||'—')}</td><td class="text-sm text-muted">${esc(JSON.stringify(r.details||{}).slice(0,60))}</td></tr>`).join('');
}

// ── Sign ──────────────────────────────────────────────────────
async function signModel(modelId, modelName){
  const {ok,data}=await api('POST','/api/sign',{modelId});
  if(!ok){toast(data.error||'Failed','error');return;}
  toast(`${modelName} signed with org key ✅`,'success');
}

// ── Live Stream (SSE) ─────────────────────────────────────────
function startLiveStream(deploymentId){
  const el=document.getElementById('stream-output');
  if(el) el.innerHTML='<div class="empty">Connecting to live stream…</div>';
  const es=new EventSource(`/api/stream?deploymentId=${deploymentId}`);
  es.addEventListener('progress',e=>{
    const d=JSON.parse(e.data);
    if(el) el.innerHTML=`<div class="progress-track mb-2"><div class="progress-bar ${d.status==='verified'?'green':''}" style="width:${d.progress}%"></div></div><div class="text-sm">${d.progress}% — ${d.verified}/${d.target} devices — ${d.status}</div>`;
  });
  es.addEventListener('complete',e=>{
    const d=JSON.parse(e.data);
    if(el) el.innerHTML=`<div class="badge ${d.status==='verified'?'badge-green':'badge-red'}" style="font-size:13px">${d.status==='verified'?'✅ Deployment Verified!':'⚠️ '+d.status}</div>`;
    es.close(); toast('Deployment stream ended: '+d.status,'success');
  });
  es.addEventListener('error',()=>{ if(el) el.innerHTML='<div class="empty text-muted">Stream closed.</div>'; es.close(); });
  return es;
}

// ── Docs page ─────────────────────────────────────────────────
async function loadDocsPage(){
  const {ok,data}=await api('GET','/api/docs');
  if(!ok) return;
  const el=document.getElementById('docs-endpoints'); if(!el) return;
  const paths=data.paths||{};
  const byTag={};
  for(const [path,methods] of Object.entries(paths)){
    for(const [method,op] of Object.entries(methods)){
      const tag=(op.tags||['Other'])[0];
      if(!byTag[tag]) byTag[tag]=[];
      byTag[tag].push({path,method:method.toUpperCase(),summary:op.summary||''});
    }
  }
  el.innerHTML=Object.entries(byTag).map(([tag,eps])=>`<div class="mb-4"><div class="form-label mb-2">${esc(tag)}</div>${eps.map(e=>`<div class="flex gap-3 items-center mb-1" style="padding:6px 10px;background:var(--bg);border-radius:4px"><span class="badge ${e.method==='GET'?'badge-green':e.method==='POST'?'badge-blue':e.method==='DELETE'?'badge-red':'badge-amber'}">${e.method}</span><span class="mono text-sm">${esc(e.path)}</span><span class="text-muted text-sm ml-auto">${esc(e.summary)}</span></div>`).join('')}</div>`).join('');
}

// Extended navigation handler
const _origNavigate = navigate;
window.navigateExtended = async function(page){
  await _origNavigate(page);
  if(page==='marketplace') { await loadMarketplace(); const {data}=await api('GET','/api/models'); const sel=document.getElementById('mp-model-select'); if(sel&&data?.models) sel.innerHTML=data.models.map(m=>`<option value="${m.id}">${esc(m.model)}</option>`).join(''); }
  if(page==='analytics')   await loadAnalyticsPage();
  if(page==='schedule')    { await loadSchedule(); const {data}=await api('GET','/api/models'); const sel=document.getElementById('sched-model'); if(sel&&data?.models) sel.innerHTML=data.models.map(m=>`<option value="${m.id}">${esc(m.model)}</option>`).join(''); }
  if(page==='groups')      await loadGroups();
  if(page==='bluegreen')   await loadBluegreenPage();
  if(page==='audit')       await loadAuditPage();
  if(page==='docs')        await loadDocsPage();
};

// Re-wire nav items on load (extend the existing DOMContentLoaded)
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.nav-item[data-page]').forEach(el=>{
    el.onclick = () => window.navigateExtended(el.dataset.page);
  });
});
