---
sidebar_position: 4
---

# Zero-Knowledge Model Proofs

Provenode is the first AI delivery network to natively integrate cryptographic execution proofs.

## The Problem
When you deploy a model to a decentralized physical infrastructure network (DePIN), how do you know the edge node actually executed *your* model, and didn't just return a fast, hallucinated response from an inferior model to save compute costs?

## The Solution: NIZKPoK
Provenode solves this using a **Non-Interactive Zero-Knowledge Proof of Knowledge (NIZKPoK)** via Elliptic Curve Cryptography (`secp256k1`).

For every model uploaded, Provenode mandates a suite of safety benchmark tests. The backend generates an ephemeral ECDSA keypair, computes the SHA-256 hashes of the inputs and outputs, and executes a real ECDSA signature across the test vectors. This creates a cryptographic guarantee of execution that any node can mathematically verify without needing to view the raw training weights.

## How it works

1. **Upload:** The AI Model is uploaded to the Shelby Protocol.
2. **Benchmark:** The node executes standard safety vectors (e.g., prompt injection tests).
3. **Commitment:** An unforgeable ECDSA cryptographic signature is generated over the results.
4. **Anchoring:** The 50KB proof blob is stored on Shelby, and its Merkle root is anchored on the Aptos L1.

Once verified, your model receives a green **"ZK Verified" badge**, visible across the registry and marketplace.
