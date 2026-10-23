# TraperOS — The Market Ledger

**A personal, cloud-hosted paper-trading research platform. No real-money orders.**

TraperOS is a Next.js + Supabase application for deterministic, risk-limited spot crypto paper trading. It compares an OpenRouter-assisted trading arm with an indicator-only arm, uses Binance public price data, and provides an authenticated journal, performance charts, and an isolated 48-hour challenge. The public landing page contains an interactive **synthetic demonstration** requiring no API keys.

> **Research project, not a profitable-bot claim.** Scheduled monitoring is best-effort every minute, not guaranteed continuous stop-loss execution. Paper fills are modeled, can be reconstructed from 1-minute OHLCV, and may differ materially from real markets.

## Requirements

- Node.js 20+ and npm (Windows 10/11 PowerShell supported)
- A Vercel Hobby account for the Next.js app
- A Supabase Free project
- A Cloudflare Free account for one-minute cron triggering
- An OpenRouter free account and API key
- Access to Binance Spot **public** data from the cloud deployment region
- GitHub repository access for development and CI

No Docker, Linux host, exchange credentials or brokerage integration is required.

## Local start — Windows PowerShell

1. Clone this repository using GitHub Desktop or `git clone https://github.com/RAJ-SUHANDANI/TraperOs.git`.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`; never commit secrets.
4. Create a Supabase project, then execute `supabase/migrations/0001_initial.sql` and `0002_benchmarks.sql` in its SQL Editor **in that order**.
5. Configure Supabase Authentication with email OTP and the dashboard's authorized redirect URL. Set `OWNER_EMAIL` to the only account allowed to use the private dashboard.
6. Supply the Supabase URL, anon key, service-role key, OpenRouter key, and a cryptographically random 32+ character `CRON_SECRET`.
7. Run `npm run dev`, then open `http://localhost:3000`.
8. The public demo works immediately without any database or API credentials; click **Try the demo** on the landing page.
9. Sign into `/login` as the owner to initialize independent AI and rules portfolios.

**Important:** `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, and `CRON_SECRET` must remain server-side. Never prefix them with `NEXT_PUBLIC_`, expose them in the browser, or commit them to Git.

## Deployment

### 1. Vercel Hobby

Import the existing repository into Vercel. Set all environment variables from `.env.example` in Project Settings → Environment Variables (the `NEXT_PUBLIC_` values are deliberately public). Keep server-side secrets scoped to server execution. Ensure Fluid Compute is enabled so longer bounded functions can run up to the platform's documented maximum. Set the Supabase email redirect to `https://YOUR-PROJECT.vercel.app/dashboard`.

The trading engine endpoint is `POST https://YOUR-PROJECT.vercel.app/api/worker`; it rejects requests without `Authorization: Bearer <CRON_SECRET>`. Do not make it public or expose the bearer secret.

### 2. Cloudflare minute scheduler

The scheduler code lives in `cloudflare/` and has its own Wrangler configuration. Deploy a Worker using the Cloudflare dashboard or Wrangler, with the working directory `cloudflare`. Set two **secrets** (not public variables):

- `TRAPEROS_WORKER_URL`: the full HTTPS endpoint `https://YOUR-PROJECT.vercel.app/api/worker`
- `CRON_SECRET`: the exact same secret configured in Vercel.

Use `npx wrangler deploy` in the `cloudflare` directory. The cron expression `* * * * *` triggers approximately once a minute. It is **best-effort**; there is no guaranteed sub-minute latency.

In Cloudflare, inspect cron-trigger failures; in the dashboard, inspect the Operations page and last successful scheduler run. If Vercel or Cloudflare free quotas change, the bot may pause rather than continue trading.

### 3. First authenticated launch

Sign in with the exact `OWNER_EMAIL` via Supabase email OTP. The first authenticated account read creates two isolated virtual 10,000 USDT portfolios. They start accepting virtual trading decisions when the scheduler is configured and operating.

### 4. No paid service assumption

The project does not intentionally use paid APIs. Service providers may change pricing, free limits, regional access, or eligibility. Never enable a billable plan by mistake.

## Risk policy

| Setting | Policy |
|---|---|
| Market | Ten frozen liquid Binance USDT spot markets |
| Signals | Fully closed 15-minute candles |
| Monitoring | Best-effort one-minute scheduled reconciliation |
| Main portfolios | Independent AI and rules-only accounts; 10,000 USDT each |
| Per-trade planned risk | Maximum 1.5% current account equity |
| Maximum concurrent positions | 3 |
| Allocation | Maximum 20% per asset; 60% total exposure |
| Aggregate planned stop risk | Maximum 3% |
| Daily loss pause | 4% marked-equity drawdown from UTC day opening equity |
| Futures, shorting, leverage, real orders | Disabled; no exchange private keys |
| Fees | Initially 0.1% per side |
| Slippage | Initially 0.05% per side, plus spread-sensitive entry |
| Minimum cost-aware planned reward/risk | 1.5:1 |

The rules engine sizes positions; the LLM proposes only BUY or HOLD. Existing stop-loss and take-profit orders are simulated deterministically. Neither stops nor 1.5% planned risk is a guarantee of maximum loss.

## AI integration

OpenRouter is called only for the top two qualified candidates after completed 15-minute candles. The app uses `response_format=json_schema`, validates the parsed response with Zod and checks exact asset/candidate identity. Invalid or unavailable AI output creates **no trade**.

The combined inference budget caps requests at 48 daily to remain below the currently documented 50/day free-account allowance. Rules-only positions continue without OpenRouter. All requests and raw responses are retained in protected database audit records.

The default model is `nvidia/nemotron-3-super-120b-a12b:free`. The account must verify availability and schema support; the app does not silently fall back to a different model.

## Database and migrations

Execute migrations in `supabase/migrations/` order. Browser clients have no direct SQL table access; the service-role client runs exclusively on the server, and every owner-facing API requires a verified Supabase JWT whose email equals `OWNER_EMAIL`.

Tables include portfolios, positions, transactional paper fills, signals, AI attempts, risk evaluations, equity and benchmark snapshots, immutable system events, and scheduler runs.

**Data retention:** minute-level per-position replay is fetched when needed rather than storing every market tick in Supabase. The data source remains external; historical reproducibility is therefore limited by subsequent provider access. For stronger reproducibility, add immutable candle archiving before serious research conclusions.

**Backups:** Supabase Free does not include managed database backups. Export a periodic manual/automated SQL backup using a safe external process. Never publish it.

## Historical test, unit tests and quality audit

```powershell
npm install
npm run lint
npm run test
npm run build
npm run backtest -- 30
```

The 30-day backtest uses public Binance 15-minute OHLCV and conservative candle stops, with next-candle entries, fees, and modeled slippage. It currently tests the deterministic strategy only. It does **not** prove AI alpha; the forward AI experiment compares the two portfolios.

`npm run audit` runs TypeScript checking, unit tests and production build. CI in `.github/workflows/quality.yml` runs these on pushes and pull requests. Check GitHub Actions for actual results; an unrun or failed workflow is not a completed audit.

## What remains inherently limited

- No guaranteed 60-second or lower stop response time; scheduled events can be late or missed.
- Completed 1-minute OHLCV does not establish event ordering within the minute.
- Serverless polling cannot simulate an always-on broker-native stop order precisely.
- Order-book depth, queue priority, real slippage and partial executions are approximated.
- Binance endpoints might be unavailable from some regions and cloud network egress IPs.
- OpenRouter free models can be unavailable, rate-limited, or produce unusable output.
- Multi-asset losses may be correlated; aggregate planned risk is not worst-case realized loss.
- A successful 48-hour run is not statistical evidence of a durable advantage.
- The dashboard is private through authentication, but **the GitHub source repository is currently public**. Change repository visibility separately if desired; never commit credentials.

## Security and feature boundaries

- There are **no routes for actual exchange orders** and no real-money trading adapter.
- A protected cron route uses a strong shared bearer token.
- Public demo mode uses scripted fictional prices only.
- Portfolio controls are owner-authenticated; automatic safety pauses cannot be bypassed through the ordinary resume action.
- Code and database audit trails are evidence of system operation, not an investment performance guarantee.

## Operating checklist

Once deployed, confirm the following before leaving the experiment unattended:

1. Owner OTP sign-in works and nonowner login cannot retrieve account data.
2. All ten Binance symbols are accessible from Vercel.
3. Cloudflare scheduled executions result in successful Vercel scheduler runs.
4. Supabase records show isolated AI and rules portfolios and valid equity snapshots.
5. Model requests are logged and invalid JSON is rejected without orders.
6. Repeated schedule execution never duplicates a fill.
7. Protective exits are tested for gaps, both-stop-and-target candles, outages and missing data.
8. Manual pause prevents entries without disabling eligible exits.
9. Database exports and recovery are tested.

The system should not be described as reliably autonomous until these live-cloud integration checks have passed.
