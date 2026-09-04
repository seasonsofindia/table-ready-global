# Running Table Orders locally (VS Code)

The app has no separate backend. Square API calls run through TanStack Start
server functions, which read credentials from environment variables. Locally
those come from a `.env` file.

## 1. Install dependencies

```bash
npm install     # or: bun install / pnpm install
```

## 2. Create your `.env`

```bash
cp .env.example .env
```

Fill in:

| Variable | Where to get it |
| --- | --- |
| `SQUARE_ACCESS_TOKEN` | Square Developer Dashboard → your app → Credentials (Sandbox or Production access token) |
| `SQUARE_ENVIRONMENT` | `sandbox` or `production` |
| `SQUARE_LOCATION_ID` | Square Dashboard → Locations, or Locations API |
| `ADMIN_PIN` | Any PIN you choose; unlocks `/admin` |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Optional — only for webhook testing |

`.env` is git-ignored, so your token never gets committed.

## 3. Start the dev server

```bash
npm run dev
```

Open http://localhost:8080 (Vite prints the actual URL).

- `/` — Kitchen Display (KDS)
- `/order` — table ordering screen
- `/admin` — admin dashboard (needs `ADMIN_PIN`)

## How env loading works

`vite.config.ts` loads `.env` / `.env.local` into `process.env` at startup, so
server functions in `src/lib/square.server.ts` see your values. Existing
process env vars always win, so hosted deployments keep using their own
injected secrets.

## Production build

```bash
npm run build
npm run preview
```

For a real deployment, set the same variables as environment variables /
secrets on your host instead of shipping a `.env` file.

## Troubleshooting

- **`SQUARE_ACCESS_TOKEN is not configured.`** → `.env` missing or the dev
  server was started before the file existed. Restart `npm run dev`.
- **Square 401 / `UNAUTHORIZED`** → token belongs to the other environment;
  make `SQUARE_ENVIRONMENT` match the token type.
- **Empty menu or orders** → `SQUARE_LOCATION_ID` doesn't match the account
  the token belongs to.
- **Webhook route returns 503** → `SQUARE_WEBHOOK_SIGNATURE_KEY` isn't set;
  this is expected and manual cleanup still works.
