# Deploying Pumpkin Patch Pals

**Live now:** site <https://pumpkin-patch-pi.vercel.app> (Vercel project `pumpkin-patch`,
auto-deploys on every push to `main`) · server <https://pumpkin-patch-server.onrender.com>
(Render service `pumpkin-patch-server`, deployed from the public repo URL — after
changing server code, click **Manual Deploy → Deploy latest commit** in Render).

Two pieces go online separately:

| Piece | Where | Folder |
| --- | --- | --- |
| Game server (Colyseus) | **Render** (free web service) | `server/` |
| Game client (the website) | **Vercel** *or* **Netlify** (free static site) | `client/` |

The client finds the server through **one environment variable**,
`VITE_SERVER_URL`. Nothing is hardcoded to localhost.

Push this repo to GitHub first (both hosts deploy from GitHub).

---

## 1. Server on Render

1. Go to <https://render.com> → **New → Blueprint** → pick your repo.
   Render reads [`render.yaml`](render.yaml) and sets everything up.
   *Or by hand:* **New → Web Service** → your repo, then:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm run start:prod`
   - **Health Check Path:** `/health`
   - **Environment:** `NODE_ENV=production`
2. Wait for the deploy, then open `https://<your-service>.onrender.com/health`.
   It should say `ok`.
3. Your server URL for the game is the same address with **`wss://`**:
   `wss://<your-service>.onrender.com`

> **Free tier note:** Render's free services go to sleep after ~15 minutes
> with nobody connected. The first visit afterwards takes ~30-60 seconds to
> wake it up. If "Create Room" seems stuck, wait a moment and try again.

## 2. Client on Vercel (or Netlify)

### Vercel
1. <https://vercel.com> → **Add New → Project** → your repo.
2. **Root Directory:** `client` (Vercel reads [`client/vercel.json`](client/vercel.json)).
3. **Environment Variables:** add
   `VITE_SERVER_URL` = `wss://<your-service>.onrender.com`
4. Deploy. Open the URL Vercel gives you — that's the game!

### Netlify (alternative)
1. <https://app.netlify.com> → **Add new site → Import an existing project** → your repo.
2. **Base directory:** `client` (Netlify reads [`client/netlify.toml`](client/netlify.toml)).
3. **Site settings → Environment variables:** add `VITE_SERVER_URL` as above.
4. Deploy.

> `VITE_SERVER_URL` is baked in when the site is **built**. If you change it,
> redeploy the client.

## 3. Play

Send your friend the site link. One of you creates a room and shares the
code; the other joins. Because the site is `https://`, the photo booth
cameras work too (browsers block cameras on plain `http://`).

## Troubleshooting

- **"Can't reach the game server"** — check `VITE_SERVER_URL` starts with
  `wss://` (not `https://`), matches your Render address, and that
  `/health` says `ok`. Then redeploy the client.
- **Photo booth video doesn't connect between two different homes** —
  most networks work, but some strict ones need a relay ("TURN") server.
  Add `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` to the
  client's environment variables (see `client/src/game/net/BoothRtc.ts`).
- **Room codes reset** whenever the server restarts or redeploys (rooms live
  in memory) — just make a new room.

## Running the production build locally

```bash
cd server && NODE_ENV=production npm run start:prod
```

```bash
cd client && VITE_SERVER_URL=ws://localhost:2567 npm run build-nolog && npx vite preview --outDir dist --port 4173
```
