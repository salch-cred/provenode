---
sidebar_position: 7
id: self-healing
slug: /self-healing
---

# Autonomous Self-Healing

Edge devices attest the SHA-256 of the model they are **actually running**. On mismatch, Provenode halts activation, writes an incident record, and issues a heal command pointing at the clean Shelby object — with no human in the loop.

## Why this exists

A deployment record in a database says what *should* be running. It cannot prove what *is* running. Filenames get swapped, CDN caches corrupt, downloads truncate, and a compromised device will happily report success. Self-healing closes that gap by making the device prove its digest before activation.

## Flow

```
device boots ──▶ hashes its model ──▶ POST /api/selfheal
                                            │
                            ┌───────────────┴───────────────┐
                       digest matches                  digest differs
                            │                               │
                     activate normally         halt · incident record ·
                                               heal command → clean Shelby object
                                                            │
                                               device re-downloads, re-hashes
                                                            │
                                               PATCH /api/selfheal (confirm)
```

## API

### Report a digest (device → Provenode)

```bash
curl -X POST https://your-app.vercel.app/api/selfheal \
  -H "Content-Type: application/json" \
  -H "X-Provenode-Token: $TOKEN" \
  -d '{
    "deviceId": "CAM-SIN-042",
    "modelId": "model_abc123",
    "reportedSha256": "9e4a7c81d2bf..."
  }'
```

Clean response:
```json
{ "success": true, "tampered": false, "message": "Device integrity verified." }
```

Tamper response — activation must be refused and the heal command executed:
```json
{
  "success": true,
  "tampered": true,
  "healCommand": {
    "deviceId": "CAM-SIN-042",
    "modelId": "model_abc123",
    "shelbyObjectId": "shelby://shelbynet/models/...",
    "cleanSha256": "9e4a7c81d2bf..."
  },
  "incident": { "id": "a3f9c21b04e7", "status": "heal_issued" }
}
```

### Confirm the heal (device → Provenode)

```bash
curl -X PATCH https://your-app.vercel.app/api/selfheal \
  -H "Content-Type: application/json" \
  -H "X-Provenode-Token: $TOKEN" \
  -d '{ "incidentId": "a3f9c21b04e7", "verifiedSha256": "9e4a7c81d2bf..." }'
```

This stamps `healedAt`, computes `healDurationMs`, and logs `selfheal.healed`.

### Fleet health + incident history

```bash
curl https://your-app.vercel.app/api/selfheal
```

```json
{
  "health": {
    "total": 248, "healthy": 247, "tampered": 1,
    "healthPercent": "99.6", "needsHealing": [ ... ]
  },
  "incidents": [ ... ],
  "stats": { "incidents": 12, "healed": 11, "open": 1, "avgHealMs": 4300 }
}
```

## Console

The **Self-Healing** page (Fleet → Self-Healing) shows:

- Fleet integrity percentage, devices needing heal, incidents healed, and average heal time
- A tamper incident timeline with the rejected digest, the clean digest, the Shelby heal source, and a "Mark healed" action for open incidents
- An attestation tester — pick a device and model, and the clean digest is prefilled; change one character to simulate tampering and watch enforcement fire

## Events

| Event | When |
|---|---|
| `device.tamper_detected` | Webhook dispatched the moment a mismatch is found |
| `selfheal.tamper_detected` | Audit log entry with the rejected digest prefix |
| `selfheal.healed` | Audit log entry with the heal duration |

Wire `device.tamper_detected` to your on-call channel via [Webhooks](/) so a compromised device pages a human even though the fix is automatic.
