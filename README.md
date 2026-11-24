# flowmind-reasoning-path

- `index.html`: reasoning-path demo
- `console.html`: AutoResearch console (campaign fleet, live drill-down, results, usage, access)

The console is a Vite front end plus one API function (`api/index.js` → `server/`) backed by Postgres.
People sign in with Google; the agent service fills it through a token-authenticated ingest API.
Design and wire format: [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md).

## Run locally

Needs Node 20.12+ and a Postgres database.

```bash
docker run -d --name ar-pg -e POSTGRES_USER=ar -e POSTGRES_PASSWORD=ar -e POSTGRES_DB=ar -p 5432:5432 postgres:16
cp .env.example .env      # set SESSION_SECRET, OPERATOR_EMAILS=<you>, AUTH_DEV_LOGIN=1
npm install
npm run dev               # API on :8787, Vite on :5173 → open http://localhost:5173/console.html
```

With `AUTH_DEV_LOGIN=1` the sign-in page offers a development sign-in, so Google credentials are optional locally.
To see live data without a real agent: sign in, create an **agent** token under Access → Tokens, then

```bash
node cli/autoresearch.js login --url http://localhost:5173 --token art_… --profile agent
node cli/autoresearch.js agent simulate --profile agent
```

## Deploy to Vercel

1. Import the repository in Vercel (framework preset: Vite; `vercel.json` sets the rest).
2. Add a Postgres database (Vercel Marketplace → Neon, or any Postgres) and expose its pooled URL as `DATABASE_URL`.
3. In Google Cloud Console → APIs & Services → Credentials, create an OAuth client (Web application) with the
   authorised redirect URI `https://<your-domain>/api/auth/google/callback`.
4. Set environment variables: `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `APP_URL=https://<your-domain>`, `OPERATOR_EMAILS=<your Google email>`; optionally `ALLOWED_EMAIL_DOMAINS`, `LAB_NAME`, `LAB_SLOTS`.
5. Deploy. The schema is created on the first request. Until the variables are set, the console shows a checklist of what is missing.

Do not set `AUTH_DEV_LOGIN` in production; it is ignored there anyway.
