# Railway-ready OSRM image — downloads a regional OSM extract and preprocesses it at
# BUILD time (baked into the image), because Railway's filesystem is ephemeral (no
# persistent volume by default), unlike the local docker-compose.yml flow in README.md
# which does this as a one-time manual step against a mounted ./data folder.
#
# Build arg lets you pick the region without editing this file — default is Delhi NCT
# (small, fast build). Browse https://download.geofabrik.de for other states/countries;
# pick the smallest extract that actually covers where you operate — a full-country
# extract works but makes every build much slower.
ARG OSM_EXTRACT_URL=https://download.geofabrik.de/asia/india/delhi-latest.osm.pbf

FROM osrm/osrm-backend:latest AS build
ARG OSM_EXTRACT_URL
WORKDIR /data
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN curl -L -o region.osm.pbf "$OSM_EXTRACT_URL"
RUN osrm-extract -p /opt/car.lua region.osm.pbf
RUN osrm-partition region.osrm
RUN osrm-customize region.osrm

FROM osrm/osrm-backend:latest
COPY --from=build /data /data
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "/data/region.osrm"]
