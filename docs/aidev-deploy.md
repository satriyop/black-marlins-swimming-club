# Aidev deploy

Node + Postgres on the VPS. Cloudflare Tunnel is the public HTTPS door. Port 5432 stays on localhost (or the compose internal network).

## Once

1. Copy `.env.example` to `.env` and fill Google OAuth + `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` (the public tunnel origin).
2. Google Cloud authorized redirect: `https://<origin>/api/auth/callback/google`.
3. `docker compose up -d --build`
4. Point cloudflared at `http://127.0.0.1:3000`.

Migrate runs as a container start step, not during `vite build`.

## Backup

Daily on the box:

```sh
docker compose exec -T postgres pg_dump -U bmsc bmsc > /var/backups/bmsc-$(date +%F).sql
```
