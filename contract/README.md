# Provenode Move Contract

On-chain model registry deployed to Shelbynet (Aptos-based).

## What it does
- Registers every model SHA-256 permanently on-chain
- Emits `ModelRegisteredEvent` for each upload — publicly queryable
- `verify_model(address, sha256)` returns true/false from any client, no server needed
- Prevents duplicate SHA-256 registration
- Tamper-proof: once registered, cannot be modified or deleted

## Deploy

```bash
# Install Aptos CLI
curl -fsSL https://aptos.dev/scripts/install_aptos.sh | sh

# Configure for Shelbynet
aptos init --network custom --rest-url https://api.shelbynet.shelby.xyz/v1

# Fund account
aptos account fund-with-faucet --account default

# Compile
aptos move compile --named-addresses provenode_addr=default

# Deploy
aptos move publish --named-addresses provenode_addr=default

# Initialize the registry
aptos move run --function-id 'default::ModelRegistry::initialize'
```

## Verify a model (no server needed)

```bash
aptos move view \
  --function-id '<YOUR_ADDRESS>::ModelRegistry::verify_model' \
  --args "address:<YOUR_ADDRESS>" "hex:<sha256_hex>"
```

## Read via REST API

```bash
curl "https://api.shelbynet.shelby.xyz/v1/accounts/<ADDRESS>/events/<ADDRESS>::ModelRegistry::ModelRegistry/model_registered"
```

## Add to Provenode env vars

```
MOVE_CONTRACT_ADDRESS=0x<your_deployed_address>
```

When set, `/api/upload` will also call `register_model` on-chain after Shelby upload.
