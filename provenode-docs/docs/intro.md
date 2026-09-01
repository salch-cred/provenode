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

## Core Capabilities

- **Shelby Sites**: Deploy entire static websites to immutable Shelby blobs with a Vercel-like ZIP flow or GitHub push-to-deploy — every file content-addressed and publicly verifiable at `/s/<slug>`.
- **Model Passports & Registry**: Every model gets a SHA-256 identity, a signed passport, and an on-chain registry entry on Shelbynet.
- **Integrity Enforcement**: Edge devices re-hash payloads against the signed manifest before activation — a mismatch halts the load, logs the incident, and requests a clean payload. See [Autonomous Self-Healing](/self-healing).
- **Zero-Knowledge Verification**: NIZKPoK proofs verify that a model executed correctly without exposing proprietary weights.
- **Fleet Rollouts**: Canary staging (10% → 50% → 100%) with automatic rollback, plus blue-green atomic cutover for zero-downtime swaps.
- **EU AI Act Compliance**: Exportable audit trails, lineage graphs, and provenance records built for Article 13 transparency requirements.

## Reference

Review the technical implementation of [Shelby Sites](/sites), [Zero-Knowledge Integrity Verification](/zk-proofs) and [Dataset Merkle Roots](/datasets).
