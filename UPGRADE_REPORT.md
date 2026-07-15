# ModelRelay Shelby Feature Upgrade

## Added
- Verified Delivery console view
- Shelby Object Explorer with object ID, hash, runtime, size and network
- Signed deployment manifest preview
- SHA-256 verification workflow
- Resumable transfer interruption/recovery simulation
- Canary rollout selection and automatic safety policy presentation
- Verified rollback action
- Public verification proof page at `/verify.html`
- Zero-dependency Python edge agent at `/modelrelay-agent.py`
- Cloudflare status endpoint at `/api/shelby-status`
- Responsive mobile support for the new console view

## Tested
- Advanced console navigation
- Object verification action
- Resumable transfer completion
- Public proof page rendering
- Mobile navigation at 390×844
- Browser JavaScript errors: none

## Real Shelby activation
The complete product workflow is functional in demo mode. Real Shelby writes require Early Access credentials and the current supported server-side SDK/REST adapter. Add `SHELBY_API_KEY` as a Cloudflare secret and replace the demo upload adapter without exposing credentials in browser code.
