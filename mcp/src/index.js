#!/usr/bin/env node
/**
 * Provenode MCP Server
 * ---------------------
 * Exposes Provenode's deploy / verify / passport-check / pay capabilities as
 * Model Context Protocol tools so AI agents can operate models through the
 * platform.
 *
 * Transports:
 *   stdio  (default)  — for local MCP clients (Claude Desktop, Cursor, etc.)
 *   HTTP   (--http)   — Streamable HTTP transport for remote agents
 *
 * Environment:
 *   PROVENODE_API_URL  Base URL of the Provenode API, e.g.
 *                      https://your-app.vercel.app/api   (default http://localhost:4173/api)
 *   PROVENODE_TOKEN    DEPLOY_SECRET value; sent as X-Provenode-Token on
 *                      mutating calls (POST /api/deploy, payments, passport issue…).
 *   PROVENODE_MCP_PORT HTTP transport port (default 8937).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import http from 'node:http';

const API_URL = (process.env.PROVENODE_API_URL || 'http://localhost:4173/api').replace(/\/$/, '');
const TOKEN = process.env.PROVENODE_TOKEN || '';
const MCP_PORT = Number(process.env.PROVENODE_MCP_PORT || 8937);
const USE_HTTP = process.argv.includes('--http') || process.env.PROVENODE_MCP_HTTP === '1';

/* ── Low-level API caller ─────────────────────────────────────────────── */
async function api(method, path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && TOKEN) headers['X-Provenode-Token'] = TOKEN;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

function ok(text) {
  return { content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) }] };
}

function fail(err) {
  return {
    isError: true,
    content: [{ type: 'text', text: err.detail
      ? `${err.message}\n${JSON.stringify(err.detail, null, 2)}`
      : err.message }],
  };
}

/* ── Transports ───────────────────────────────────────────────────────── */

// The SDK allows only one connect() per server instance, so build a fresh
// server per HTTP request (stateless mode) and reuse one for stdio.
function createServer() {
  const server = new McpServer({ name: 'provenode', version: '1.0.0' });

  server.tool('deploy_model',
    'Deploy a registered Provenode model to the device fleet. Returns the deployment manifest with an id you can poll via deployment_status.',
    {
      modelId: z.string().describe('ID of the registered model to deploy (list_models first).'),
      version: z.string().optional().describe('Version tag, defaults to the model\'s version or "latest".'),
      region: z.string().optional().describe('Target region, defaults to Global.'),
      canary: z.boolean().optional().describe('Enable staged canary rollout (10/25/50/100%).'),
    },
    async ({ modelId, version, region, canary }) => {
      try {
        const data = await api('POST', '/deploy', { modelId, version, region, canary });
        return ok(data);
      } catch (e) { return fail(e); }
    });

  server.tool('deployment_status',
    'Check deployment progress. Without deploymentId lists all deployments; with it returns the manifest with live progress (0-100%).',
    { deploymentId: z.string().optional().describe('Deployment id from deploy_model.') },
    async ({ deploymentId }) => {
      try {
        const data = await api('GET', `/status${deploymentId ? `?id=${encodeURIComponent(deploymentId)}` : ''}`);
        return ok(data);
      } catch (e) { return fail(e); }
    });

  server.tool('list_models',
    'List all models registered on Provenode with their SHA-256, Shelby object id, mode, and passport status.',
    {},
    async () => {
      try {
        const data = await api('GET', '/models');
        return ok(data);
      } catch (e) { return fail(e); }
    });

  server.tool('fleet_scan',
    'Run an integrity scan of the whole fleet. Returns per-device health: which devices are online and which carry tampered model weights.',
    {},
    async () => {
      try {
        const data = await api('POST', '/integrity/scan');
        return ok(data);
      } catch (e) { return fail(e); }
    });

  server.tool('verify_device',
    'Report a device\'s current model SHA-256. If it differs from the registered weights, Provenode auto-issues a heal command (verified vs tampered).',
    {
      deviceId: z.string().describe('Device id reporting in.'),
      modelId: z.string().describe('Model id the device claims to run.'),
      reportedSha256: z.string().describe('SHA-256 of the weights the device actually has (64 hex chars).'),
    },
    async ({ deviceId, modelId, reportedSha256 }) => {
      try {
        const data = await api('POST', '/selfheal', { deviceId, modelId, reportedSha256 });
        return ok(data);
      } catch (e) { return fail(e); }
    });

  server.tool('passport_check',
    'Verify the provenance of a weights file: pass its SHA-256 or base64-encoded bytes. Returns exact-match + certificate validity, or a no-match warning with registered models.',
    {
      sha256: z.string().optional().describe('64-char SHA-256 of the weights file.'),
      dataBase64: z.string().optional().describe('Base64-encoded weights file bytes (hashed server-side).'),
    },
    async ({ sha256, dataBase64 }) => {
      try {
        if (!sha256 && !dataBase64) return fail(new Error('Provide either sha256 or dataBase64.'));
        const data = await api('POST', '/passport/check', { sha256, dataBase64 });
        return ok(data);
      } catch (e) { return fail(e); }
    });

  server.tool('passport_get',
    'Fetch the signed Model Passport (ownership certificate) for a model: SHA-256, org address, registration time, signature validity, on-chain anchor.',
    { modelId: z.string().describe('Model id to look up.') },
    async ({ modelId }) => {
      try {
        const data = await api('GET', `/passport/${encodeURIComponent(modelId)}`);
        return ok(data);
      } catch (e) { return fail(e); }
    });

  server.tool('verify_copy',
    'Compare behavioral canary outputs from a suspected copied/edited deployment against the registered fingerprint of a model. Catches edited copies that hash-checking misses.',
    {
      modelId: z.string().describe('Model id of the original.'),
      outputs: z.array(z.object({
        canaryId: z.string().describe('Canary input id.'),
        output: z.any().describe('The model\'s output for that canary input.'),
      })).describe('Canary outputs captured from the suspect deployment.'),
    },
    async ({ modelId, outputs }) => {
      try {
        const data = await api('POST', `/passport/${encodeURIComponent(modelId)}/verify-copy`, { outputs });
        return ok(data);
      } catch (e) { return fail(e); }
    });

  server.tool('create_payment',
    'Create a ShelbyUSD micropayment intent. Returns the receiver address, amount (ShelbyUSD + micro), token addresses, and instructions for the payer to build and settle a SenderBuiltMicropayment.',
    {
      item: z.string().describe('What is being paid for, e.g. marketplace_import or dataset_stream.'),
      itemId: z.string().describe('Id of the item (marketplace listing id, dataset id, …).'),
      payer: z.string().optional().describe('Payer address label.'),
      description: z.string().optional().describe('Human-readable note.'),
    },
    async ({ item, itemId, payer, description }) => {
      try {
        const data = await api('POST', '/payments', { item, itemId, payer, description });
        return ok(data);
      } catch (e) { return fail(e); }
    });

  server.tool('settle_payment',
    'Settle a ShelbyUSD payment intent on-chain using a SenderBuiltMicropayment BCS payload. Returns the tx hash + receipt hash, or a 402 with the shortfall if underpaid.',
    {
      intentId: z.string().describe('Intent id from create_payment.'),
      micropaymentBcs: z.string().describe('BCS-serialized SenderBuiltMicropayment from the payer (hex).'),
      sender: z.string().optional().describe('Sender address label for the audit log.'),
    },
    async ({ intentId, micropaymentBcs, sender }) => {
      try {
        const data = await api('POST', '/payments', { action: 'verify', intentId, micropaymentBcs, sender });
        return ok(data);
      } catch (e) { return fail(e); }
    });

  return server;
}

async function main() {
  if (!USE_HTTP) {
    const transport = new StdioServerTransport();
    await createServer().connect(transport);
    console.error(`[provenode-mcp] stdio transport — API: ${API_URL}${TOKEN ? ' (authed)' : ' (unauthenticated; set PROVENODE_TOKEN)'}`);
    return;
  }

  const httpServer = http.createServer(async (req, res) => {
    // CORS for browser-based MCP clients.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Protocol-Version, Mcp-Session-Id');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      // Stateless: one transport + server per request. handleRequest drives the
      // Node req/res through the SDK's Web-Standard bridge (reads the body itself).
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await createServer().connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: err.message }, id: null }));
      } else res.end();
    }
  });
  httpServer.listen(MCP_PORT, () => {
    console.error(`[provenode-mcp] HTTP transport on http://localhost:${MCP_PORT}/mcp — API: ${API_URL}`);
  });
}

main().catch((err) => { console.error('[provenode-mcp] fatal:', err); process.exit(1); });
