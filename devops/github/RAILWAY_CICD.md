# SafeLayers Railway Deployment (Frontend + Backend Split)

This repo is deployed as two Railway services:

- `frontend` service from `frontend/`
- `backend` service from `backend/`

Both are built from their own Dockerfiles.

## Service separation

- Frontend and backend are already separated by folders.
- CI/CD now treats each app independently in `.github/workflows/ci-cd.yml`.
- A frontend-only change deploys only frontend.
- A backend-only change deploys only backend.

## Railway project setup

1. Create one Railway project.
2. Add a `backend` service using root directory `backend/`.
3. Add a `frontend` service using root directory `frontend/`.
4. Ensure both services use Dockerfile deployment.
5. Delete/disable any old service still pointing to repo root (`/`).

## Required backend variables (Railway)

- `NODE_ENV=production`
- `MONGODB_URI=<atlas_or_managed_mongo_uri>`
- `JWT_SECRET=<long_random_value>`
- `JWT_REFRESH_SECRET=<long_random_value>`
- `TOTP_ENCRYPTION_KEY=<32+_char_secret>`
- `FRONTEND_URL=https://<your-frontend-domain>`
- `PORT` is provided automatically by Railway

## Required frontend variables (Railway)

- `BACKEND_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}` (no trailing slash)

The frontend Nginx container proxies `/api/*` to `BACKEND_API_URL`, so browser traffic stays same-origin at the frontend domain.

## Required GitHub repository secrets

- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_ENVIRONMENT` (example: `production`)
- `RAILWAY_BACKEND_SERVICE` (backend service ID/name)
- `RAILWAY_FRONTEND_SERVICE` (frontend service ID/name)

## CI/CD behavior

- PR to `main`: runs CI only for changed app(s)
- Push to `main`: runs CI and deploys changed app(s) to Railway
- Manual run (`workflow_dispatch`): can deploy both

## Troubleshooting: "Railpack could not determine how to build the app"

If logs show repository root contents (`backend/`, `frontend/`, `devops/`, etc.), Railway is deploying from `/` instead of a service folder.

Fix:

1. Open Railway service settings.
2. Set `Root Directory` to:
   - `backend` for backend service
   - `frontend` for frontend service
3. Redeploy.
