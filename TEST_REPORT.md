# ModelRelay hard-test report

Tested locally on 2026-07-12 after the free-deployment configurations were added.

## Result

**15 passed · 0 failed**

## Automated checks passed

1. Node health endpoint and demo mode
2. Public config does not expose the Shelby API key
3. Security headers and Content Security Policy
4. 404 behavior and path-traversal protection
5. Burst of 200 concurrent health requests
6. JSON deployment configuration parsing
7. Desktop landing page without horizontal overflow
8. Landing-page to console navigation
9. Overview, Models, Fleet, and Shelby views
10. Canary failure, activation block, rollback, and completion to 100%
11. Browser-side model hashing and registration
12. Fleet health-check interaction
13. Mobile layout at 390×844 without horizontal overflow
14. Browser console with zero errors
15. Client-file secret scan

## Deployment configuration validation

- JSON parsed: Vercel, Firebase, Railway, package, health, and test report
- YAML parsed: Render, Docker Compose, GitHub container workflow, GitHub Pages workflow
- TOML parsed: Netlify, Cloudflare/Wrangler, Fly.io
- JavaScript syntax checked: server, hard test, Vercel health function, Netlify health function
- Vercel and Netlify health functions executed with mocked provider responses

## Container-test note

The sandbox did not provide Docker or Podman, so a live container build could not be executed here. The Dockerfile, Compose file, server startup, health endpoint, and configuration files were validated independently. GitHub Actions includes an actual Docker build and smoke test that runs automatically after the project is pushed.

## Re-run

Install development dependencies and run:

```bash
npm install
npm run test:hard
```

The machine-readable result is saved to `hard-test-report.json`.
