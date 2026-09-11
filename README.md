# Black Marlins Swimming Club — Klaten

Club manager for **Black Marlins Swimming Club (BMSC) Klaten**.

- Perenang, latihan, event/kejuaraan, aktivitas
- Grup umur PRSI, gaya, catatan waktu / PB
- Bahasa Indonesia
- Login Google (via Better Auth)

Pelatih: Hardiyanto Wibowo  
Kota: Klaten, Jawa Tengah, Indonesia

## Local preview

```bash
npm install
npm run dev
```

Opens on `http://127.0.0.1:8080`. Preview uses an in-memory Postgres (PGLite).
Sign in with Google in that preview.

## Production (no VPS)

This app is **not a static site**. It needs a Node server + Postgres.

**Recommended:** [Neon](https://neon.tech) (Postgres) + [Vercel](https://vercel.com)
(same stack the Grok builder uses). Cloudflare Pages alone is not enough unless
you run it on **Cloudflare Workers** with a Postgres connection.

### 1. Database

Create a Neon project. Copy `DATABASE_URL`.

On first boot the app applies `migrations/*.sql` and seeds the club roster
(Luigi, Kun, Ken + latihan/event sample data) **per signed-in user**.

### 2. Environment

Copy `.env.example` → `.env` (local) or set the same keys on the host:

| Key | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string |
| `BETTER_AUTH_SECRET` | yes | long random string |
| `BETTER_AUTH_URL` | yes | public origin, e.g. `https://bmsc.yourdomain.com` |
| `VITE_AUTH_ENABLED` | yes | `true` |

Google sign-in in Grok’s live preview uses Grok’s shared auth broker.
On your own domain you must either:

- stay on Grok publish (`*.grok.me`) once that works, or
- add your own Google OAuth client (Google Cloud Console → OAuth client →
  authorized redirect `https://YOUR_DOMAIN/api/auth/callback/google`) and
  wire it in Better Auth.

### 3. Deploy

```bash
npm run build
```

`vite.config.ts` uses the Nitro **Vercel** preset. Point Vercel at this repo,
set the env vars above, deploy.

Cloudflare: change the Nitro preset to a Cloudflare Workers target, attach
Neon, and set the same env vars. Do not expect a pure static Pages upload.

## Production (aidev)

Native Node + Postgres + systemd + Caddy on **https://bmsc.klaten.org**. See [docs/aidev-deploy.md](docs/aidev-deploy.md) for CI, releases, and rollback.

## Scripts

- `npm run dev` — live preview
- `npm run build` — production build
- `npm test` — vitest
- `npm run lint` / `npm run typecheck`
- `npm run db:migrate` — SQL schema only
- `npm run db:seed` — club + adult accounts
- `npm run db:import-kiko` — race times (not part of deploy)
- `npm run smoke` — HTTP GET `/login` against `.output`
- `npm run test:e2e` — Playwright login smoke
