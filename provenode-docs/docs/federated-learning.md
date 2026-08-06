---
sidebar_position: 11
---

## Decentralized Aggregation
When edge devices finish their local training epochs, they encode their gradient updates and upload them to the Shelby Protocol via **Erasure Coding (Clay Codes)**.

Provenode's backend then kicks off the **FedAvg** algorithm. Using pure-JS `Float32Array` tensor mathematics, it decodes the 5,000-parameter arrays from the network and precisely calculates the aggregated gradient matrix in real-time. The new global model is then securely anchored back onto the Aptos L1.

## Privacy-Preserving AI
In highly regulated industries (healthcare, finance), raw data cannot leave the edge device. Provenode solves this by coordinating decentralized training across the Shelby DePIN layer.

### The Federated Process
1. **Local Training**: Edge nodes (e.g., hospital servers) train the model on their local, private data.
2. **Checkpoint Upload**: Nodes push their encrypted weight updates to the Shelby network.
3. **Erasure Coding Merge**: Shelby uses *Minimum Storage Regenerating (MSR) Clay Codes* to distribute these weights efficiently. Provenode triggers a global merge of these checkpoints, producing a smarter overarching model.
4. **On-Chain Anchor**: The new global model state is anchored to the Aptos L1 blockchain for auditability.

## Coordinator Dashboard
Navigate to **Intelligence -> Federated** to view a live map of participating edge nodes, monitor their local loss metrics, and trigger global model merges.
