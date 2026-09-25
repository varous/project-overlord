# Runbook — deploy the ShowPlan editor (`overlord-editor`)

The editor is `apps/api-sp`, deployed on Render as **`overlord-editor`**, serving its own
`apps/web-sp` build from one origin. Same-origin is required: api-sp signs users in with a session
cookie, and a Pages frontend calling an `onrender.com` API would need third-party cookies, which
browsers block.

No secret values appear in this file. Paste secrets only into Render → Environment.

## 1. Google OAuth client

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type **Web application**.
3. **Authorised redirect URIs** — add exactly:
   `https://overlord-editor.onrender.com/api/auth/google/callback`
   (keep any existing redirect URIs for the other services).
4. Copy the **Client ID** and **Client secret**; they go in step 3.

The hosted-domain gate is `ALLOWED_HD=clockwork-av.com` (set in `render.yaml`); only Google accounts
whose `hd` claim matches are accepted.

## 2. Cloudflare R2 (venue-plan uploads)

1. R2 → **Create bucket** (e.g. `overlord-editor`).
2. R2 → **Manage R2 API Tokens → Create API token**, permission **Object Read & Write**.
   Copy the **Access Key ID**, **Secret Access Key**, and the account's **S3 API endpoint**
   (`https://<accountid>.r2.cloudflarestorage.com`), plus the **Account ID**.
3. Bucket → **Settings → CORS policy** — allow the editor origin, `GET` and `PUT`, with the
   `Content-Type` header:
   ```json
   [
     {
       "AllowedOrigins": ["https://overlord-editor.onrender.com"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

## 3. Render environment variables

Open **overlord-editor → Environment** and set (the unset ones are `sync: false` in `render.yaml`):

| key | value |
|---|---|
| `GOOGLE_CLIENT_ID` | the OAuth client ID from step 1 |
| `GOOGLE_CLIENT_SECRET` | the OAuth client secret from step 1 |
| `R2_ACCOUNT_ID` | R2 account ID |
| `R2_ACCESS_KEY_ID` | R2 token access key |
| `R2_SECRET_ACCESS_KEY` | R2 token secret |
| `R2_BUCKET` | the bucket name from step 2 |
| `R2_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
| `SENTRY_DSN` | optional; leave blank if unused |

`NODE_ENV`, `PORT`, `DB_SCHEMA=showplan`, `DATABASE_URL` (from `project-overlord-db`),
`PUBLIC_BASE_URL`, `ALLOWED_HD` and `SESSION_SECRET` are set by the blueprint — do not override them.

Import the catalogue before or after the first deploy — see `docs/runbooks/catalogue-import.md`.

## 4. Confirm the deploy

The service health-checks `/healthz`. Once Render reports **Live**:

```bash
curl -fsS https://overlord-editor.onrender.com/healthz
# {"status":"ok","db":"up","commit":"…"}

curl -fsS https://overlord-editor.onrender.com/ | grep -q 'id="root"' && echo "editor HTML served"
```

If you have set a repo/CI variable `EDITOR_URL=https://overlord-editor.onrender.com`,
`node scripts/check-deployment.mjs <pages-url>` will also verify the editor (it skips when unset).

## 5. Sign in

Open `https://overlord-editor.onrender.com/`, click **Sign in with Google**, and use a
`@clockwork-av.com` account. A successful sign-in lands on the projects dashboard; open a project to
reach the layout editor and the **BOQ** tab.
