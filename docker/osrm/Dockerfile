# Railway-ready OSRM image — downloads India's full OSM data and preprocesses it, all
# at BUILD time (baked into the image), because Railway's filesystem is ephemeral (no
# persistent volume by default).
#
# Whole-country build: this is HEAVY. The India extract is ~1.7GB, and osrm-extract/
# partition/customize on all of India typically needs several GB of RAM and a good
# while to run. If your Railway plan's build step OOMs or times out, that's this step —
# the fix then is either a bigger build-resource plan, or scoping down to a bbox
# (ask if you want that version back).
ARG OSM_SOURCE_URL=https://download.geofabrik.de/asia/india-latest.osm.pbf

# osrm/osrm-backend's own base OS is old enough that its apt repos 404 — don't rely on
# apt-get inside it at all. Download in a separate, current image instead, and hand the
# file to the OSRM stage via COPY --from.
FROM debian:bookworm-slim AS fetch
ARG OSM_SOURCE_URL
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /data
RUN curl -L -o region.osm.pbf "$OSM_SOURCE_URL"

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
