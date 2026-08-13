# Security Policy

Provenode is a cryptographic model-registry platform: its core promise is that models can be
*proven* authentic, and that tampering is detected and healed automatically. Security is not an
afterthought here — it is the product. We take vulnerabilities seriously and ask researchers to do
the same.

## Supported Versions

| Version | Supported |
|---------|-----------|
| main (latest) | ✅ |
| < 4.0 | ❌ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security bugs.**

Email the maintainers directly. If you need to encrypt, reach out for a PGP key. Include:

1. A short description of the vulnerability and its impact.
2. Steps to reproduce (minimal, if possible).
3. The affected endpoint or module.
4. Your suggested fix, if you have one.

You can expect:

- **Acknowledgement within 48 hours** of a valid report.
- A fix target and disclosure timeline within 7 days.
- Public credit for the report unless you request anonymity.

Please report:

- Auth bypasses (any mutating route reachable without `X-Provenode-Token` when `DEPLOY_SECRET` is set).
- Signature/verification weaknesses in `lib/sign.js`, `lib/passport.js`, `lib/zkproof.js`.
- Payment-integrity issues in `lib/payments.js` (intent pricing, settlement, double-spend).
- Tamper-detection or self-heal bypasses (`lib/selfheal.js`, `lib/fingerprint.js`).
- SSRF, injection, or data-exposure in `api/index.js`.
- Cryptographic misuse (nonce reuse, weak randomness, hash truncation).

## Security Posture

Built-in controls (all active in production):

- **Central auth guard** — every mutating route requires `X-Provenode-Token` matching
  `DEPLOY_SECRET`; unauthenticated mutating requests return 401.
- **CORS fail-closed** — responses only allow the configured `ALLOWED_ORIGIN` (never wildcard),
  with strict `Vary: Origin` handling.
- **Rate limiting** — Redis-backed sliding window across all Vercel instances (429 + `Retry-After`).
- **Security headers** — CSP, HSTS, `nosniff`, `frame-ancestors: none` on all responses.
- **SSRF protection** — webhook targets blocked unless public HTTP(S); private/non-HTTP URLs rejected.
- **Ed25519 signatures** — models and passports signed with the org key; verifiers recompute
  canonical payloads so field tampering breaks the signature.
- **Tamper detection** — SHA-256 verification at the edge plus behavioral fingerprinting
  (canary-output comparison) to catch *silent* edits that leave hashes unchanged.
- **Audit log** — every mutating action recorded with actor, target, and details.

## Known Safe-By-Design Trade-offs

- The **Move on-chain anchor** is only exercised when `MOVE_CONTRACT_ADDRESS` and
  `SHELBY_PRIVATE_KEY` are configured; without them, certificates anchor as immutable Shelby
  blobs (still public, still verifiable).
- `SHELBY_NETWORK=testnet` is supported as an explicit opt-out for testing; **shelbynet is the
  default and the only network recommended for production.**
- Local development with no `DEPLOY_SECRET` runs in open mode — never deploy that way.

## Responsible Disclosure

We ask for a 90-day coordinated-disclosure window from the date a report is acknowledged before
public disclosure, unless the issue is being actively exploited.

## Hall of Fame

Contributors who report verified vulnerabilities will be credited here (with permission).
