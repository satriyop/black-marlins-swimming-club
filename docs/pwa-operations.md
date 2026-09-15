# PWA offline and update operations

## Cache boundary

The service worker is registered only by production builds and controls `/`. Its cache contains only
the self-contained offline document, manifest, favicon, and install icons listed in `public/sw.js`.
It does not cache route HTML, authenticated responses, API or server-function responses, invitations,
rosters, results, attendance, credentials, or mutations.

Document navigation uses the network. The worker returns `offline.html` only when the network request
rejects; HTTP error responses remain unchanged. Invitation acceptance at `/terima` and `/api/*` stay
network-only even when the device is offline.

## Update behavior

Each production build registers `sw.js` with a build identifier in its query string. A replacement
worker installs and waits. The app shows **Versi baru tersedia** with **Perbarui sekarang** and **Nanti**.
It never calls `skipWaiting` during installation and never reloads merely because the controller
changed.

Before activation, the current tab checks for active React Query mutations and unsaved practice or
result forms. It also asks other open Black Marlins tabs whether they are blocked. A blocked tab keeps
its current UI and data. After a controller changes in another tab, that tab shows the update action
and reloads only after its own user asks.

If installation fails, the active worker remains in control. A rolled-back build has its own build
identifier and follows the same waiting/update flow, so rollback does not create a reload loop.

## Release assets

`scripts/bmsc.sh apply-release` records the hashed client assets produced by each artifact. Before a
new release becomes current, it copies the recorded assets from retained release directories into the
new public asset directory without overwriting the new build. This keeps older open tabs usable across
consecutive deployments. Release pruning still keeps the configured number of release directories;
carried assets are bounded by those recorded releases.

Both Nitro and the production Caddy site serve `/sw.js` with revalidation/no-store headers and
`Service-Worker-Allowed: /`. Hashed `/assets/*` files are immutable for one year.

## Deployment verification

After deployment, verify the public host directly:

```bash
curl -sI https://bmsc.klaten.org/sw.js
curl -sI https://bmsc.klaten.org/offline.html
curl -sI https://bmsc.klaten.org/assets/<current-hashed-file>.js
```

Expected results:

- `sw.js`: `Cache-Control: no-cache, no-store, must-revalidate` and
  `Service-Worker-Allowed: /`.
- `offline.html`: public `200` response containing no private data.
- Hashed assets: `Cache-Control: public, max-age=31536000, immutable`.

For a two-release exercise, keep an app tab open on release A, deploy B and then C, and confirm the A
tab can still load its chunks. Confirm B/C each offer an explicit update, **Nanti** does not reload,
and dirty forms in either of two tabs survive controller changes. A physical Android/iOS check remains
part of issue #27; desktop browser emulation is not device evidence.
