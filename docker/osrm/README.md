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

## Scaling note

One container easily handles a single city/region's delivery traffic at this app's scale.
If you expand to multiple far-apart regions, either extract a bigger combined `.osm.pbf`
(slower rebuilds, one container) or run one OSRM container per region behind your own
routing logic — out of scope for this setup, cross that bridge when you actually need it.
