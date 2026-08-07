---
sidebar_position: 12
id: billing
---

# Billing & Account Abstraction

Provenode utilizes a decentralized architecture powered by the **Aptos Blockchain** and the **Shelby Protocol** for immutable model storage. However, we have designed the platform so that enterprise clients and edge devices never need to manage cryptographic wallets or transaction fees.

## Account Abstraction Model

Currently, Provenode operates on a fully abstracted payment model:

1. **Zero User Friction**: Edge devices and client SDKs do not require wallets.
2. **Centralized Gas Station**: When a model is deployed, the Provenode backend orchestrator automatically signs the transaction and pays the required Aptos gas fees (`APT`) and Shelby storage fees (`ShelbyUSD`) using an administrative treasury wallet.
3. **Transparent Execution**: This allows traditional Web2 enterprises to utilize Web3 cryptographic provenance without the compliance and accounting overhead of holding cryptocurrency on their balance sheets.

## Coming Soon: Fiat Payment Gateway

We are actively developing a unified billing system for our enterprise clients. In an upcoming release, Provenode will introduce a **SaaS Payment System** (via Stripe integration):

- **Tiered SaaS Billing**: Clients will pay standard fiat subscriptions (e.g., USD, EUR) based on the number of active edge devices and total GBs of models stored on the Shelby network.
- **Automated Fiat-to-Crypto Bridging**: The Provenode treasury will automatically convert a portion of fiat subscription revenue into the necessary `APT` and `ShelbyUSD` tokens required to sustain network operations.
- **ZK Proof Market**: A pay-as-you-go credit system for generating computational Zero-Knowledge Execution Proofs (NIZKPoK) without requiring native crypto token settlements.

*Stay tuned to our changelog for the official release of the billing portal.*
