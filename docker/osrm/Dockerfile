# Railway-ready OSRM image — downloads India's OSM data and clips it down to one
# region's bounding box, then preprocesses it, all at BUILD time (baked into the
# image), because Railway's filesystem is ephemeral (no persistent volume by default).
#
# IMPORTANT: Geofabrik does NOT publish per-state/per-city extracts for India (only a
# single whole-country file, ~1.7GB) — unlike many other countries. So this clips the
# country file down to a bounding box with osmium-tool, right at build time, rather
# than feeding the full 1.7GB file to osrm-extract (which would be slow + memory-heavy
# for no reason if you only operate in one city/state).
#
# Default bbox below covers Ahmedabad, Gujarat (based on the "Ghatlodiya, Ahmedabad"
# fallback location already used elsewhere in this app) — override OSM_BBOX via a
# build arg in Railway's service settings for your actual city, format
# "west,south,east,north" (plain lon/lat, NOT lat/lng). Find a bbox for your city at
# https://boundingbox.klokantech.com (choose the "CSV" output format).
ARG OSM_SOURCE_URL=https://download.geofabrik.de/asia/india-latest.osm.pbf
ARG OSM_BBOX=72.30,22.80,72.75,23.20

# osrm/osrm-backend's own base OS is old enough that its apt repos 404 — don't rely on
# apt-get inside it at all. Download + clip in a separate, current image instead, and
# hand the much-smaller clipped file to the OSRM stage via COPY --from.
FROM debian:bookworm-slim AS fetch
ARG OSM_SOURCE_URL
ARG OSM_BBOX
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates osmium-tool \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /data
RUN curl -L -o india.osm.pbf "$OSM_SOURCE_URL"
RUN osmium extract --bbox "$OSM_BBOX" india.osm.pbf -o region.osm.pbf --overwrite \
    && rm india.osm.pbf

FROM osrm/osrm-backend:latest AS build
WORKDIR /data
COPY --from=fetch /data/region.osm.pbf region.osm.pbf
RUN osrm-extract -p /opt/car.lua region.osm.pbf
RUN osrm-partition region.osrm
RUN osrm-customize region.osrm

FROM osrm/osrm-backend:latest
COPY --from=build /data /data
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "/data/region.osrm"]
