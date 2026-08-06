---
sidebar_position: 5
---

# Live Integrity Monitor

When deploying AI models to hundreds or thousands of edge devices, ensuring that every device is running the authentic model is a massive security challenge. Provenode solves this with the **Live Integrity Monitor**.

## Autonomous Fleet Security

The Integrity Monitor continuously scans all devices connected to your Provenode fleet. It compares the in-memory SHA-256 hash of the model currently loaded on the device against the immutable hash registered on the Shelby Protocol.

### Self-Healing Capabilities

If a device is compromised (e.g., malware alters the model weights on disk), the Integrity Monitor immediately flags the device as **Tampered**. 

You can configure Provenode to automatically **Heal** the device. When triggered, the platform sends a secure WebSocket command to the device, forcing it to purge the tampered model and stream a clean, verified copy directly from the Shelby Protocol. An incident report is then logged on-chain for auditing.
