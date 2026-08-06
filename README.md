# Provenode

An enterprise-grade AI model registry and decentralized fleet manager. Provenode ensures cryptographic integrity of artificial intelligence deployments across edge devices. By leveraging the Shelby Protocol for immutable object storage and the Aptos blockchain for state management, Provenode guarantees that edge environments execute verified models exclusively.

## Architecture Overview

Deploying AI models to decentralized edge infrastructure (cameras, autonomous vehicles, embedded systems) introduces critical security vectors. Standard orchestrators rely on mutable databases that cannot definitively prove the integrity of the executing model.

Provenode solves this through cryptographic provenance:
1. **Immutable Storage**: Models are uploaded to the Shelby Protocol.
2. **On-Chain Registry**: The SHA-256 hash and storage object ID are anchored on the Aptos L1 via a Move smart contract.
3. **Cryptographic Signatures**: Deployments are signed with Ed25519 keys.
4. **Edge Enforcement**: Devices mathematically verify the SHA-256 digest against the on-chain registry prior to initialization. Any mismatch triggers a deployment rejection and fallback sequence.

## Core Features

- **Non-Interactive Zero-Knowledge Proofs (NIZKPoK)**: Ephemeral ECDSA signatures generated across benchmark test vectors to guarantee mathematical proof of execution.
- **Federated Learning Merging**: Real-time `Float32Array` tensor aggregation (`FedAvg`) running on serverless architecture.
- **Dataset Sharding & Merkle Trees**: Dynamic binary dataset chunking and native `SHA-256` Merkle Root generation for EU AI Act compliance.
- **Canary Deployments & OTA**: Phased fleet rollouts with automated rollback thresholds.

## Technology Stack

- **Blockchain**: Aptos (Move Smart Contracts)
- **Decentralized Storage**: Shelby Protocol (Shelbynet)
- **Backend Services**: Node.js, Vercel Serverless Functions
- **Frontend Dashboard**: React, TypeScript, Docusaurus
- **State Management**: Upstash Redis

## Smart Contract Integration

Network: `Aptos Testnet`
Module: `ModelRegistry`

The Move contract manages the immutable state of all models, datasets, and federated learning rounds.

```bash
# Compile the contract
cd contract
aptos move compile --named-addresses provenode_addr=<your_address>

# Publish to network
aptos move publish --profile default --named-addresses provenode_addr=<your_address>
```

## Local Development

```bash
git clone https://github.com/salch-cred/provenode.git
cd provenode
npm install
cp .env.example .env.local
npm run dev
```

### Environment Configuration

Minimum required variables for local execution:

```env
KV_REST_API_URL=<upstash_url>
KV_REST_API_TOKEN=<upstash_token>
DEPLOY_SECRET=<authentication_secret>
CRON_SECRET=<cron_secret>
```

To enable real-time Shelby Protocol uploading and cryptographic features, configure your network keys:

```env
SHELBY_API_KEY=<shelby_api_key>
SHELBY_PRIVATE_KEY=<ed25519_private_key_hex>
```

## API Reference

The backend exposes a comprehensive REST API for CI/CD integration and edge device communication. All administrative endpoints require the `X-Provenode-Token` authentication header.

**Model Lifecycle**
- `POST /api/upload` - Secure model ingestion and Aptos anchoring
- `POST /api/deploy` - Initiate fleet OTA distribution
- `GET /api/verify` - Cryptographic verification endpoint

**Advanced Features**
- `POST /api/federated` - Submit gradient updates
- `PATCH /api/federated` - Execute multi-dimensional tensor merging
- `POST /api/datasets` - Register dataset sharding and Merkle roots
- `POST /api/zkproof` - Generate ECDSA benchmark proofs

## Documentation

Comprehensive architecture documentation and integration guides are available at [provenodes.xyz/docs](https://www.provenodes.xyz/docs).
