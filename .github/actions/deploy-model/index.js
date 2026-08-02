const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Polyfill fetch for older Node versions
const nodeFetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fetch = globalThis.fetch || nodeFetch;

async function run() {
  try {
    const modelPath   = core.getInput('model-path', { required: true });
    const modelName   = core.getInput('model-name') || path.basename(modelPath);
    const baseUrl     = core.getInput('provenode-url', { required: true }).replace(/\/$/, '');
    const region      = core.getInput('region') || 'Global';
    const canary      = core.getInput('canary') === 'true';
    const tags        = core.getInput('tags');
    const waitForDone = core.getInput('wait-for-completion') !== 'false';

    if (!fs.existsSync(modelPath)) {
      core.setFailed(`Model file not found: ${modelPath}`);
      return;
    }

    const stats = fs.statSync(modelPath);
    core.info(`📦 Uploading ${modelName} (${(stats.size/1048576).toFixed(1)} MB)…`);

    // Upload
    const form = new FormData();
    form.append('file', fs.createReadStream(modelPath), path.basename(modelPath));
    form.append('name', modelName);
    if (tags) form.append('tags', tags);

    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    const upload = await uploadRes.json();
    if (!uploadRes.ok || !upload.success) {
      core.setFailed(`Upload failed: ${upload.error || uploadRes.statusText}`);
      return;
    }

    core.info(`✅ Registered — SHA-256: ${upload.hash.slice(0,16)}… Mode: ${upload.mode}`);
    core.setOutput('model-id', upload.id);
    core.setOutput('sha256', upload.hash);
    core.setOutput('shelby-object-id', upload.objectId);
    core.setOutput('mode', upload.mode);
    core.setOutput('proof-url', `${baseUrl}/verify.html?id=${upload.id}&name=${encodeURIComponent(modelName)}&hash=${upload.hash}`);

    if (upload.warning) core.warning(upload.warning);

    // Deploy
    core.info(`🚀 Deploying to ${region}${canary ? ' (canary)' : ''}…`);
    const deployRes = await fetch(`${baseUrl}/api/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: upload.id, region, canary }),
    });

    const deploy = await deployRes.json();
    if (!deployRes.ok || !deploy.success) {
      core.setFailed(`Deploy failed: ${deploy.error || deployRes.statusText}`);
      return;
    }

    const depId = deploy.manifest.id;
    core.setOutput('deployment-id', depId);
    core.info(`✅ Deployment started — ${depId.slice(0,8)}`);
    core.info(`   Manifest object: ${deploy.manifest.manifestObjectId || 'N/A'}`);

    if (waitForDone) {
      core.info('⏳ Waiting for fleet verification…');
      const maxWait = 300000; // 5 min
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, 5000));
        const statusRes = await fetch(`${baseUrl}/api/status?id=${depId}`);
        const status = await statusRes.json();
        const m = status.manifest;
        if (!m) break;
        core.info(`   Progress: ${m.progress}% — ${m.status}`);
        if (m.status === 'verified') {
          core.info('🎉 Deployment verified!');
          break;
        }
        if (m.status === 'rolled_back') {
          core.setFailed('Deployment was rolled back.');
          return;
        }
      }
    }

    core.info(`🔗 Proof: ${baseUrl}/verify.html?id=${upload.id}&name=${encodeURIComponent(modelName)}&hash=${upload.hash}`);

  } catch (err) {
    core.setFailed(err.message);
  }
}

run();
