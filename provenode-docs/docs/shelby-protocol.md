---
sidebar_position: 8
---

# Shelby Protocol

The **Shelby Protocol** is a decentralized "hot" storage layer built on top of the Aptos Blockchain. Provenode deeply integrates with Shelby to provide its enterprise AI features.

## Why Shelby?

Traditional decentralized storage networks (like Arweave or Filecoin) are "cold" storage—they are slow and primarily meant for archiving data. AI models require fast, "hot" storage for rapid deployment and edge streaming.

Shelby Protocol provides:
1. **High-Performance Object Storage**: Large AI models (multi-gigabyte files) can be streamed to edge devices quickly.
2. **On-Chain Manifests**: When a file is uploaded to Shelby, its cryptographic manifest (hash, size, metadata) is immutably anchored to the Aptos Blockchain.
3. **Immutability**: Once a model is deployed to Shelby, it cannot be altered without changing the cryptographic hash, ensuring tamper-evident deployments.

By leveraging Shelby, Provenode guarantees that the model you deploy is the exact same model running on your edge devices, verifiable by anyone, at any time.

## Storage Abstraction
We automatically shard and encrypt data locally. When you upload a dataset or deploy a model to Shelby:
1. Data is chunked and hashed
2. Sent to the local Shelby RPC node
3. Dispersed to storage providers
4. The Merkle root is anchored on the Aptos L1

## DePIN Auditor Dashboard
Provenode doesn't just use Shelby as a dumb storage drive. It provides deep visibility into the **Decentralized Physical Infrastructure Network (DePIN)** layer. 

Navigate to the **Shelby Layer** page to view a real-time topology map of the network:
* **Control Plane**: Monitor Aptos L1 Smart Contracts and SBY Token burns.
* **Data Plane**: Visualize the "Double Zero" fiber backbone and Erasure Coding map.
* **Hybrid Auditing**: Watch a live feed of Storage Providers exchanging 1 KiB Random Sample challenges to cryptographically prove data possession.

## Autonomous Network Agent (MCP)
Provenode features a globally embedded **Autonomous AI Assistant** designed to manage your DePIN infrastructure. 
By leveraging Shelby's integration with the **Model Context Protocol (MCP)**, the AI agent can autonomously read network telemetry (e.g., node latency) and execute Aptos smart contracts to "rebalance" your data chunks across the globe. Just ask the agent to optimize your network, and it handles the complex infrastructure orchestration automatically.
