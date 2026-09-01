---
sidebar_position: 1
id: intro
slug: /
---

# Introduction

**Provenode** is an AI infrastructure orchestration platform built for cryptographic model verification and decentralized fleet management. It uses the Shelby Protocol for immutable object storage and the Aptos blockchain to anchor model states, ensuring edge device execution complies with strict regulatory frameworks like the **EU AI Act**.

## System Architecture

1. **Serverless Orchestration**: Manages model uploads, OTA deployments, and dataset sharding via Vercel Edge functions.
2. **Cryptographic Verification**: Models and datasets are hashed using SHA-256 and anchored to Shelby objects.
3. **On-Chain State**: Deployment manifests are written to Aptos smart contracts to create an unforgeable public ledger of what is running in production.
4. **Autonomous Edge Security**: Devices mathematically verify payload digests against the on-chain manifest before execution, rejecting tampered models.

## Tier-1 Enterprise Capabilities

Provenode is distinguished by advanced capabilities previously unseen on decentralized infrastructure:
- **Shelby Sites**: Deploy entire static websites to immutable Shelby blobs with a Vercel-like ZIP flow — every file content-addressed and publicly verifiable at `/s/<slug>`.
- **Autonomous Agent Swarms**: Intelligent nodes that autonomously provision and expand Shelby L1 storage via Aptos micro-transactions when global capacity hits thresholds.
- **FHE & Global Replication**: Fully Homomorphic Encryption enclaves are mirrored across a visualized global Shelby node network for ultimate uptime and privacy.
- **ZK-Distillation Engine**: Compresses massive gigabyte-scale datasets on Shelby into tiny Zero-Knowledge verifiable student models without transferring raw data off-chain.

## Reference

Review the technical implementation of [Shelby Sites](/sites), [Zero-Knowledge Integrity Verification](/zk-proofs) and [Dataset Merkle Roots](/datasets).
