---
sidebar_position: 9
---

# Dynamic Model Streaming

Provenode leverages the Shelby Protocol's **"Hot" Storage** and **Byte-Range Reads** to completely eliminate the traditional "cold start" latency for AI agents.

## The Problem
Traditionally, edge devices or inference servers must download an entire 50GB Large Language Model (LLM) before they can begin processing data. This introduces massive latency.

## The Shelby Solution
Shelby is built on a dedicated "Double Zero" fiber backbone. Provenode uses this to establish a **Streaming CDN** for your AI models.

### How it Works
1. **Initialize Session**: The edge device requests a model from Provenode.
2. **Byte-Range Reads**: Provenode instructs the Shelby RPC nodes to stream only the specific chunks (layers) of the AI model currently needed into the edge device's GPU memory.
3. **Instant Inference**: The AI agent can begin inference almost instantly, while the rest of the model streams in the background at speeds exceeding 100 Gbps.

## Using the Streaming CDN
Navigate to **Intelligence -> Streaming CDN** in the Provenode dashboard to initialize a live session and monitor the real-time byte-range transmission blocks.
