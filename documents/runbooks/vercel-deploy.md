# Runbook — Vercel deployment

Live project: `mind-logs/member-registrations`
Stable URL: <https://member-registrations-mind-logs.vercel.app>
Dashboard: <https://vercel.com/mind-logs/member-registrations>

The GitHub repository `stayboy/MemberRegistrations` is connected to the project, so a push to
`main` deploys production automatically. Pull requests get preview deployments.

## Environment

| Variable           | Target              | Source                                           |
| ------------------ | ------------------- | ------------------------------------------------ |
| `DATABASE_URL`     | Production, Preview | Neon (Vercel Marketplace), **pooled** connection |
| `API_BEARER_TOKEN` | Production, Preview | Generated secret; rotate as described below      |

Names only — never copy values into the repository, a round doc, or a chat message. `.env.local` is
gitignored and is the only local place a value may live.

## Migrations

Vercel marks integration variables as **Secret**; the CLI can inject them into a deployment but
cannot pull them locally:

```text
18 Secret values cannot be pulled from the `production` Environment.
```

To migrate, put the **pooled** Neon connection string in `.env.local` and run:

```powershell
npx tsx --env-file=.env.local src/db/migrate-cli.ts
```

Migrations are explicit and never run on request. `npm run db:migrate` is the same runner with the
environment already loaded.

## Deploy

```powershell
vercel deploy --scope mind-logs            # preview
vercel deploy --prod --scope mind-logs     # production, if not driven by git
vercel ls member-registrations --scope mind-logs
vercel inspect <deployment-url> --scope mind-logs
```

## Build and runtime

`vercel.json` builds `src/index.ts` with **`@vercel/node`** and routes every request to it. This is
deliberate: the Express framework preset only accepts an entrypoint that imports `express` directly,
and this app exports `createApp` from a separate module. The preset is set to Express, but the
explicit builder is what runs. Node is pinned to **24.x**; functions run in `fra1` from `vercel.json`.

## Deployment protection

Vercel Authentication is set to **preview only**. Production must stay public because API clients
cannot complete Vercel SSO; the API’s own bearer token is the access control. A production request
that redirects to `vercel.com/sso-api` means protection regressed — fix it in
**Project → Settings → Deployment Protection**, not in code.

## Rotating the API token

1. Generate a new value (`openssl rand -base64 32`).
2. Replace `API_BEARER_TOKEN` for Production (and Preview) in **Project → Settings → Environment
   Variables**.
3. Redeploy production so the new value is live.
4. Update every client. The old token stops working at the deploy.

The CLI’s `env add` can duplicate rather than replace; the dashboard is safer for rotation.

## Verify

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://member-registrations-mind-logs.vercel.app/health
# 200

curl.exe -s -o NUL -w "%{http_code}" https://member-registrations-mind-logs.vercel.app/v1/members
# 401 without a token

curl.exe -s https://member-registrations-mind-logs.vercel.app/openapi.json
# 200, info.version 2.1.0
```

## Symptom → fix

| Symptom                                     | Cause                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `No Output Directory named "public" found`  | Project is being treated as static; restore the `builds`/`routes` block in `vercel.json` |
| `No entrypoint found which imports express` | Express preset is active without the explicit `@vercel/node` builder                     |
| Production 302 to `vercel.com/sso-api`      | Vercel Authentication covers production; set it to preview only                          |
| Migrations say `DATABASE_URL is required`   | The local `.env.local` is missing the pooled connection string                           |
