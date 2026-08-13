# On-Chain Deployment — Shelbynet

Provenode's `ModelRegistry` Move contract is **deployed, initialized, and live on
Shelbynet** (the real network). This file records the facts and how to verify them.

## Contract

| Field | Value |
|---|---|
| Contract | `ModelRegistry` (Move) |
| Address | `0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18` |
| Network | Shelbynet (chain id **118**) — `https://api.shelbynet.shelby.xyz/v1` |
| Explorer | [Aptos explorer (custom Shelbynet)](https://explorer.aptoslabs.com/account/0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18?network=custom&customNetworkUrl=https%3A%2F%2Fapi.shelbynet.shelby.xyz%2Fv1) |
| State | Initialized (`ModelRegistry::ModelRegistry` resource exists) |

## First Live Transaction

The first model registration on Shelbynet was recorded in ledger version **28,000,828**:

| Field | Value |
|---|---|
| Tx hash | `0x81a369d1446bb1ee8fe8781e2593f9beddc20ce4427c90f3b54649ceca24d106` |
| Function | `ModelRegistry::register_model` |
| Model | `ShelbyTest-v1.0` |
| SHA-256 | `0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd` |
| Sender | `0x77f8cb3d…d18` |
| Explorer | [tx 0x81a369…](https://explorer.aptoslabs.com/txn/0x81a369d1446bb1ee8fe8781e2593f9beddc20ce4427c90f3b54649ceca24d106?network=custom&customNetworkUrl=https%3A%2F%2Fapi.shelbynet.shelby.xyz%2Fv1) |

## Verify it yourself

The on-chain registry is public and checkable with zero credentials:

```bash
# 1. Chain info (chain_id must be 118)
curl https://api.shelbynet.shelby.xyz/v1

# 2. Registered model count
curl -X POST https://api.shelbynet.shelby.xyz/v1/view \
  -H 'Content-Type: application/json' \
  -d '{"function":"0x77f8cb3d…d18::ModelRegistry::model_count","type_arguments":[],"arguments":["0x77f8cb3d…d18"]}'

# 3. Verify a specific SHA-256 is on-chain
curl -X POST https://api.shelbynet.shelby.xyz/v1/view \
  -H 'Content-Type: application/json' \
  -d '{"function":"0x77f8cb3d…d18::ModelRegistry::verify_model","type_arguments":[],"arguments":["0x77f8cb3d…d18","0xaabbccdd…"]}'

# 4. Registration events (with ledger versions → tx hashes)
curl https://api.shelbynet.shelby.xyz/v1/accounts/0x77f8cb3d…d18/events/0x77f8cb3d…d18::ModelRegistry::ModelRegistry/model_registered
```

Or through the app: `GET /api/registry/status` and `GET /api/registry/verify?sha256=…`.

## How new registrations flow

1. **Upload a model** → `POST /api/upload` (or seed a record) → a Model Passport is issued.
2. Passport issuance calls `anchorOnChain()` (`lib/passport.js`) which dispatches
   `ModelRegistry::register_model` on Shelbynet — **if** `SHELBY_PRIVATE_KEY` (the
   registry owner) and `MOVE_CONTRACT_ADDRESS` are configured.
3. On success the tx hash + explorer URL are stored on the model record and the
   passport (`onChainTx`, `onChainExplorerUrl`, `anchored: "move-tx"`).
4. Anyone can then verify the model's SHA-256 on-chain via `verify_model`.

> **Note:** the `register_model` entry requires the caller to be the registry owner
> (`signer::address_of(account)` must hold the `ModelRegistry` resource), so the
> first live registration was signed by `0x77f8cb3d…d18`. New registrations must be
> dispatched by that same key.

## Deploying a fresh contract (if needed)

```bash
cd contract
aptos move compile --named-addresses provenode_addr=<your_address>
aptos move publish --profile default --named-addresses provenode_addr=<your_address>
# then initialize:
aptos move run --function-id <your_address>::ModelRegistry::initialize --profile default
```
