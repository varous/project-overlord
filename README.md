# project-overlord

Spatial event-site planning platform for Clockwork AV (Kolkata).

## Local setup

```bash
npm ci
npx playwright install chromium   # one-time: browser for the smoke tests
```

Common commands:

```bash
npm run dev -w @overlord/web      # Cesium viewer on http://localhost:5173
make verify                       # typecheck, lint, unit tests, build guard, offline smoke
npm run smoke                     # offline browser smoke tests (Playwright)
npm run smoke:online              # online smoke tests (needs SMOKE_ONLINE=1; writes e2e-output/)
```

`make verify` builds the web app and then runs the offline smoke test against the built output,
so run a build before `npm run smoke` on its own.
