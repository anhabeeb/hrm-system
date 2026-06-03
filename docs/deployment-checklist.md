# HRM Deployment Checklist

Git is the production source of truth for the HRM app. Cloudflare production must deploy only from the configured Git production branch, not from stale ZIP folders, old local directories, manual uploads, or accidental rollbacks.

## Permanent Source-Of-Truth Rule

- Git is the production source of truth.
- Cloudflare production deploys only from the configured Git branch.
- Do not deploy from stale ZIP folders or copied local project directories.
- Do not manually upload a folder unless it was generated from latest Git.
- Do not use Cloudflare rollback to a deployment older than the Users & Access route fix unless intentionally restoring that old version.
- Always pull latest before making changes.
- Always commit and push before Cloudflare deployment.
- Always run predeploy checks before deployment.
- Always run postdeploy smoke tests after deployment.

## Recommended Workflow

```bash
git status
git pull
npm install
npm --prefix frontend install
npm run build
npm run typecheck
npm test
git add .
git commit -m "Describe change"
git push
npm run smoke:production
```

## Cloudflare Settings To Verify

- Production branch must be `main` or the intended production branch.
- Build command should be `npm run build`.
- Deploy command should be `npx wrangler deploy` or `npm run deploy`, depending on Cloudflare setup.
- If using separate Cloudflare build and deploy commands:
  - Build command: `npm run build`
  - Deploy command: `npx wrangler deploy`
- If using `npm run deploy`, the build command can be empty/simple, but avoid double-building if Cloudflare already runs `npm run build`.
- Wrangler Static Assets must keep `assets.directory = ./frontend/dist`.
- Wrangler Static Assets must keep `assets.not_found_handling = single-page-application`.
- Wrangler Static Assets must keep `assets.binding = ASSETS`.
- Wrangler Static Assets must keep `assets.run_worker_first` including `/api/*`.

## Critical Route Guardrails

The build runs `npm run verify:critical-routes`. This fails if any of these disappear from source:

- `src/routes/users.routes.ts`
- `src/routes/roles.routes.ts`
- `src/routes/permissions.routes.ts`
- `apiV1.route("/users", usersRoutes)`
- `apiV1.route("/roles", rolesRoutes)`
- `apiV1.route("/permissions", permissionsRoutes)`
- Worker `/api/*` routing to the API app
- Worker non-API routing to `env.ASSETS.fetch(request)`

Correct unauthenticated production behavior:

- `/api/v1/users` returns `401` JSON
- `/api/v1/roles` returns `401` JSON
- `/api/v1/permissions` returns `401` JSON

If those routes return `404 API_ROUTE_NOT_FOUND`, production is not running the latest source-of-truth Worker script.

## Postdeploy Smoke Test

Run:

```bash
npm run smoke:production
```

Or test another environment:

```bash
SMOKE_BASE_URL=https://preview.example.com npm run smoke:production
```

Expected production result:

- `/api/v1/health` returns `200` JSON
- `/api/v1/version` returns `200` JSON
- `/api/v1/users` returns `401` JSON unauthenticated
- `/api/v1/roles` returns `401` JSON unauthenticated
- `/api/v1/permissions` returns `401` JSON unauthenticated
- `/api/not-real` returns `404 API_ROUTE_NOT_FOUND` JSON
- `/` returns `200` HTML
- `/dashboard` returns `200` HTML

## Warnings

- Do not click Cloudflare Rollback to a deployment older than the route fix unless intentionally restoring an old version.
- Do not deploy from old ZIPs.
- Do not let a module-specific update deploy from a local folder that is missing previous fixes.
- Future Codex changes must be committed and pushed to the production branch before Cloudflare deploys.
