---
sidebar_position: 2
---

# Security

Security is the foundational pillar of Provenode. We assume that edge environments and traditional cloud providers are untrusted. 

## On-Chain Anchoring

Unlike traditional AI deployment platforms that rely solely on central databases, Provenode anchors critical model metadata to the **Aptos Blockchain** via the **Shelby Protocol**.

This provides:
* **Tamper-Evident Storage**: Model weights are hashed (SHA-256) and anchored on-chain.
* **Censorship Resistance**: Provenance certificates cannot be altered or removed by a central authority.
* **Verifiable Lineage**: The complete history of a model (from base model to fine-tuned variant) is tracked transparently.

## Cryptographic Signatures

Every deployment generates a unique signature. When an edge device pulls a model, it must verify the signature against the on-chain registry. If a man-in-the-middle attack alters the model file, the signature verification fails, and the **Live Integrity Monitor** is alerted.
