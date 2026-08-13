# Provenode MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
Provenode's core operations as tools, so AI agents can **deploy, verify,
passport-check, and pay** for models through the platform — no UI required.

## Quick start

```bash
cd mcp
npm install

# stdio transport (for Claude Desktop, Cursor, etc.)
PROVENODE_API_URL=https://your-app.vercel.app/api \
PROVENODE_TOKEN=your-deploy-secret \
node src/index.js

# HTTP transport (for remote agents) on :8937
PROVENODE_API_URL=http://localhost:4173/api npm run http
```

## Environment variables

| Variable            | Default                  | Purpose |
|---------------------|--------------------------|---------|
| `PROVENODE_API_URL` | `http://localhost:4173/api` | Base URL of the Provenode API (the Vercel app with `/api`). |
| `PROVENODE_TOKEN`   | *(none)*                 | The backend's `DEPLOY_SECRET`; sent as `X-Provenode-Token` on mutating calls (deploy, payments, verify-copy). |
| `PROVENODE_MCP_PORT`| `8937`                   | HTTP transport port. |

## Tools

| Tool | What it does |
|------|--------------|
| `list_models` | List registered models (SHA-256, Shelby object id, mode, passport status). |
| `deploy_model` | Deploy a registered model to the fleet — `modelId`, optional `version`/`region`/`canary` (staged rollout). Returns a manifest with a deployment id. |
| `deployment_status` | Poll a deployment by id, or list all. Live progress 0–100%, verified state. |
| `fleet_scan` | Full-fleet integrity scan — which devices are online vs. carrying tampered weights. |
| `verify_device` | Report a device's current SHA-256; auto-issues a heal command when tampered. |
| `passport_check` | Check a weights file (SHA-256 or base64) against the Model Passport registry → exact match + signature validity, or no-match warning. |
| `passport_get` | Fetch a model's signed ownership certificate (SHA, org, timestamp, anchor, tx link). |
| `verify_copy` | Behavioral canary comparison — catches edited copies that hash-checking misses. |
| `create_payment` | Create a ShelbyUSD micropayment intent (receiver, amount, token addresses, instructions). |
| `settle_payment` | Settle an intent on-chain with a `SenderBuiltMicropayment` BCS payload → tx hash + receipt. |

## Client configuration

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "provenode": {
      "command": "node",
      "args": ["/absolute/path/to/provenode/mcp/src/index.js"],
      "env": {
        "PROVENODE_API_URL": "https://your-app.vercel.app/api",
        "PROVENODE_TOKEN": "your-deploy-secret"
      }
    }
  }
}
```

### HTTP (streamable) — any MCP client

Point the client at `http://localhost:8937/mcp`. Example JSON-RPC:

```bash
curl -X POST http://localhost:8937/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Example agent flow

1. `list_models` → pick `modelId`
2. `passport_get` / `passport_check` → confirm provenance before spending
3. `create_payment` → get receiver + amount for a marketplace import
4. `settle_payment` → settle with the micropayment BCS
5. `deploy_model` → ship it to the fleet
6. `deployment_status` → watch the rollout
