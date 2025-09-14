AutoTranscribe

Overview
- Secure upload and transcription web app with encryption, virus scanning, and S3-compatible storage (Akamai Linode Object Storage).
- Stack: React (Vite) client, Node/Express API, MongoDB, OpenAI Whisper (with optional Deepgram and AssemblyAI providers), ClamAV, Docker Compose.

Prerequisites
- A VM with Docker Engine and Docker Compose installed.
- Linode Object Storage bucket and access keys.
- OpenAI API key for Whisper (or set SKIP_TRANSCRIPTION=true), or a Deepgram API key, or an AssemblyAI API key.

Setup
- Copy `.env.example` to `.env` and fill values:
  - `JWT_SECRET` a long random string
  - `S3_ENDPOINT` for your Linode region
  - `LINODE_ACCESS_KEY`, `LINODE_SECRET_KEY`, `LINODE_BUCKET`
  - `OPENAI_API_KEY` (or `SKIP_TRANSCRIPTION=true`)
  - `WHISPER_MODEL` (defaults to `whisper-1`)
  - Optional: `WHISPER_MAX_MB` (defaults to 25)
  - Optional Deepgram provider: set `DEEPGRAM_API_KEY` (and optionally `DEEPGRAM_MODEL`)
  - Optional AssemblyAI provider: set `ASSEMBLYAI_API_KEY` (and optionally `ASSEMBLYAI_MODEL`)

Build and Run (on your VM)
- `docker compose up -d --build`
- Open client at `http://<vm-host>:3000` and API health at `http://<vm-host>:8080/api/health`.

Services
- `mongo`: MongoDB 6 with persisted `mongo-data` volume.
- `clamd`: ClamAV daemon on port 3310.
- `server`: Express API at `:8080`.
- `client`: Nginx serving SPA at `:3000` and proxying `/api` to `server`.

API Notes
- Registration: `POST /api/auth/register` with `{ email, password }` (min 8 chars).
  - Registration now requires a code: `{ email, password, code }`.
  - Codes are single-use, auto-generated at server startup and topped up automatically in the background.
  - Admin endpoints (set `ADMIN_API_KEY` in `.env`):
    - List available codes: `GET /api/admin/registration-codes` with header `X-Admin-Key: <key>`
    - List used codes: `GET /api/admin/registration-codes?status=used` with header `X-Admin-Key: <key>`
    - Generate codes: `POST /api/admin/registration-codes/generate` body `{ n: 50 }` with header `X-Admin-Key`
    - Top up now: `POST /api/admin/registration-codes/topup` with header `X-Admin-Key`
- Login: `POST /api/auth/login` returns `{ token }`; send `Authorization: Bearer <token>`.
- Upload: `POST /api/upload` multipart fields `file`, `hasPII`, `hasPCI`, optional `provider` = `auto` | `openai` | `deepgram` (default `auto`).

Security/Compliance
- AES-256-CBC encryption is applied when either PII or PCI flag is true. Keys/IV are stored in the `File` record for demo purposes; use a KMS in production.
- Virus scanning via ClamAV; set `SKIP_VIRUS_SCAN=true` for development.

Troubleshooting
- Ensure `LINODE_*` vars and bucket exist; API returns 500 if not configured.
- If ClamAV takes time to update defs, first run may be slower; increase `CLAMD_STARTUP_TIMEOUT` if needed.
- For cross-origin local dev without Docker, API enables CORS; set client axios base to `http://localhost:8080/api` or run via Docker where Nginx proxies `/api`.

Transcription Providers
- Primary: OpenAI Whisper (`OPENAI_API_KEY`).
- Fallback: Deepgram (`DEEPGRAM_API_KEY`) and/or AssemblyAI (`ASSEMBLYAI_API_KEY`). In `provider=auto`, the server tries Whisper first (within size), then Deepgram, then AssemblyAI.
- Force provider: Set `provider=openai` to only use Whisper (no fallback). Set `provider=deepgram` to only use Deepgram. Set `provider=assemblyai` to only use AssemblyAI.
- To force-skip transcription entirely, set `SKIP_TRANSCRIPTION=true`.
Stripe
- Optional subscriptions integration is stubbed and ready.
- Configure in `.env` (server reads secret; client uses VITE_ vars if you wire them):
  - `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`
  - Price IDs (set at least the ones you will use):
    - `STRIPE_PRICE_HOBBY_MONTHLY`, `STRIPE_PRICE_CREATOR_MONTHLY`, `STRIPE_PRICE_BUSINESS_MONTHLY`
    - `STRIPE_PRICE_HOBBY_ANNUAL`, `STRIPE_PRICE_CREATOR_ANNUAL`, `STRIPE_PRICE_BUSINESS_ANNUAL`
  - Redirects: `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`
- Endpoint: `POST /api/billing/checkout` with `{ priceId }` and user JWT returns `{ url }` to redirect to Stripe Checkout.
- If Stripe is not configured, the endpoint returns a stub checkout URL for testing navigation.
