# provenode-sdk

Python SDK for [Provenode](https://github.com/salch-cred/provenode) — verified AI model deployment on Shelby testnet.

## Install

```bash
pip install provenode-sdk
```

## Quickstart

```python
from provenode import ProvenodeClient

client = ProvenodeClient("https://provenode.vercel.app")

# Upload a model
model = client.upload("./vision_edge.onnx", name="Vision Edge v3", tags=["onnx", "arm64"])
print(f"Registered: {model.sha256}")
print(f"Mode: {model.mode}")  # "shelby" or "demo"

# Deploy to fleet
deployment = client.deploy(model.id, region="Asia-Pacific", canary=True)
print(f"Deployment: {deployment.id}")

# Wait for completion
deployment = client.wait(deployment.id, on_progress=lambda d: print(f"  {d.progress}%"))
print(f"Status: {deployment.status}")

# Import from HuggingFace
model = client.import_huggingface("ultralytics/yolov8n", "yolov8n.onnx")
deployment = client.deploy(model.id, region="Global")

# Schedule for 2am
client.schedule(model.id, "2026-08-03T02:00:00Z", label="Off-hours deploy")

# Compliance report
report = client.compliance_report(from_date="2026-01-01")
print(f"Models: {report['report']['summary']['models']}")
```

## All methods

| Method | Description |
|--------|-------------|
| `upload(path, name, tags, parent_id)` | Upload + hash + register model |
| `deploy(model_id, region, canary)` | Deploy to fleet |
| `wait(deployment_id)` | Block until verified |
| `rollback(deployment_id)` | Emergency rollback |
| `schedule(model_id, scheduled_for)` | Schedule future deployment |
| `status(deployment_id)` | Get deployment status |
| `deployments()` | List all deployments |
| `models()` | List all models |
| `sign(model_id)` | Sign model with org key |
| `lineage(model_id)` | Get lineage graph |
| `import_huggingface(repo, filename)` | Import from HF Hub |
| `marketplace()` | Browse community models |
| `publish(model_id)` | Publish to marketplace |
| `register_device(id, type, arch)` | Register edge device |
| `report_health(device_id, ...)` | Report device health |
| `submit_metric(device_id, metric, value)` | Submit analytics metric |
| `analytics(device_id, metric, days)` | Get time series |
| `compliance_report(from, to)` | Compliance audit |
| `audit_log()` | Immutable audit log |
| `identity()` | Org on-chain identity |

## License

MIT
