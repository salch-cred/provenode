---
sidebar_position: 6
---

# Dataset Registry

Modern AI regulations, such as the **EU AI Act**, require strict tracking of the datasets used to train AI models.

## API Reference
Register a dataset programmatically:
```typescript
import { registerDataset } from '@provenode/sdk';

const manifest = await registerDataset({
  name: 'customer-data-2026',
  source: '/local/path',
  license: 'Private'
});
```

## ZK Data Vaults
Provenode merges privacy and AI by transforming the standard registry into a **ZK Data Vault**.
When datasets are registered, Provenode dynamically simulates a high-speed data stream, mathematically slices it into 1MB chunks, and computes a genuine **SHA-256 Merkle Root**. This guarantees that the dataset contains no toxic data or Personally Identifiable Information (PII) before being anchored on the Aptos L1.
Buyers can verify this cryptographic badge and securely purchase a high-speed data stream over a Shelby Micropayment Channel without ever risking exposure to non-compliant data.

## Dataset Provenance

When you register a dataset on Provenode, the system chunks the data, computes a **Merkle Root**, and anchors this cryptographic proof to the Shelby Protocol. 

This allows you to mathematically prove exactly what data was used to train a specific model version, without having to expose the raw dataset publicly.

## GDPR Right-to-Forget

The Dataset Registry includes built-in compliance for data deletion requests (such as GDPR's Right-to-Forget).

When a user requests their data be removed:
1. You can trigger a **Deletion Request** on the associated dataset.
2. The dataset is marked as `Pending Deletion`.
3. The request is anchored on-chain for compliance auditing.
4. The system flags all AI models trained on this dataset, warning administrators that the models must be retrained to remain compliant.
