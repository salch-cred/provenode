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

## Reference

Review the technical implementation of [Zero-Knowledge Integrity Verification](/zk-proofs) and [Dataset Merkle Roots](/datasets).
