---
sidebar_position: 7
---

# Authentication

Provenode offers a frictionless onboarding experience through embedded wallets and modern authentication flows.

## Privy Embedded Wallets

To simplify blockchain interactions, Provenode integrates with **Privy**. This allows users and developers to sign in using familiar Web2 methods (like Email or Google). 

Behind the scenes, Privy instantly spins up a secure embedded wallet for the user. This wallet is pre-configured to interact with the Aptos Blockchain and the Shelby Protocol, eliminating the need for users to install browser extensions or manage seed phrases manually.

## Persistent Organization Identity

For enterprise deployments, organizations can set a persistent identity using the `SHELBY_PRIVATE_KEY` environment variable. This ensures that all models deployed by the organization are cryptographically signed by the same verifiable identity.
