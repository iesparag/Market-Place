# Self-hosted OSRM (free rider→destination routing)

This gives the live delivery-tracking polyline a real road-following route instead of a
straight line — **free, no API key, no per-request billing**. The public
`router.project-osrm.org` demo server is deliberately NOT used here: its own usage policy
says it isn't meant for production traffic, so "free" only actually holds if you self-host.

## One-time setup

1. **Download a regional OSM extract.** Geofabrik publishes ready-made `.osm.pbf` files
   per country/state — pick the smallest one that covers where you actually operate (a
   full-India extract works but is large; a single-state extract processes much faster).

   ```bash
   cd docker/osrm
   mkdir -p data
   # Example: Delhi NCT. Browse https://download.geofabrik.de/asia/india.html for other states.
   curl -L -o data/region.osm.pbf https://download.geofabrik.de/asia/india/delhi-latest.osm.pbf
   ```

2. **Preprocess it** (extract → partition → customize — OSRM's MLD pipeline, run once;
   only needs re-running if you swap the region or profile):

   ```bash
   docker run -t -v "$(pwd)/data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/region.osm.pbf
   docker run -t -v "$(pwd)/data:/data" osrm/osrm-backend osrm-partition /data/region.osrm
   docker run -t -v "$(pwd)/data:/data" osrm/osrm-backend osrm-customize /data/region.osrm
   ```

3. **Run the router:**

   ```bash
   docker compose up -d
   ```

4. **Point the backend at it** — in `backend/.env`:

   ```
   OSRM_BASE_URL=http://localhost:5001
   ```

   In production, this should be an internal/private URL (the container doesn't need to
   be reachable from the internet — only your backend calls it, via
   `backend/src/providers/routing/osrm.provider.ts`, which is itself Redis-cached in
   `backend/src/modules/routing/routing.service.ts` to keep load on this container low).

## Verifying it works

```bash
curl "http://localhost:5001/route/v1/driving/77.2090,28.6139;77.2300,28.6300?overview=full&geometries=geojson"
```

A `"code":"Ok"` response with a `routes[0].geometry.coordinates` array means it's working.

## Deploying on Railway

`docker-compose.yml` above is for **local** use only — Railway doesn't run compose files,
and its filesystem is ephemeral (no persistent volume by default), so the
extract/partition/customize steps can't happen as a one-time manual step like locally.
Use `Dockerfile` instead, which does that preprocessing at **build time**, baked into the
image.

1. In the Railway dashboard, open your project → **New** → **Empty Service** (a second
   service, separate from your backend — do NOT point your existing backend service at
   this folder).
2. Connect it to this same GitHub repo, and set its **root directory** to `docker/osrm`.
3. Railway will find `Dockerfile` automatically. Optionally override the region via a
   build arg in Railway's service settings: `OSM_EXTRACT_URL` → pick a `.osm.pbf` URL
   from https://download.geofabrik.de for the state/country you actually operate in
   (defaults to Delhi NCT if you don't set one).
4. Deploy. The build takes a few minutes (downloads the extract + runs OSRM's
   extract/partition/customize) — this is normal, it only happens again if you change
   the region or redeploy this service.
5. Once it's up, open this OSRM service's **Settings → Networking** and note its
   internal URL (something like `osrm.railway.internal`, or use the public domain if you
   generated one). Internal is enough — only your backend needs to reach it.
6. On your **backend** service's variables, set:
   ```
   OSRM_BASE_URL=http://osrm.railway.internal:5000
   ```
   (swap in the exact internal hostname Railway assigned your OSRM service — the port
   OSRM listens on is `5000` per the Dockerfile's `EXPOSE`/`CMD`, regardless of what
   external port Railway maps it to).
7. Redeploy the backend (or it'll pick up the new env var on its next restart). Verify
   with the `curl` check further up this README, run from a shell with access to that
   internal network (e.g. Railway's own shell/SSH into the backend service), or
   temporarily hit the public domain if you generated one for the OSRM service.

If `OSRM_BASE_URL` is ever unset or unreachable, the backend's `/routing` simply returns
null and the customer app shows a plain rider marker with no polyline — nothing breaks.

## Scaling note

One container easily handles a single city/region's delivery traffic at this app's scale.
If you expand to multiple far-apart regions, either extract a bigger combined `.osm.pbf`
(slower rebuilds, one container) or run one OSRM container per region behind your own
routing logic — out of scope for this setup, cross that bridge when you actually need it.
