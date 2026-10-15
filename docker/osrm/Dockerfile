# Railway-ready OSRM image — clips India's OSM data down to just the metro areas you
# actually operate in, merges them into one file, then preprocesses it, all at BUILD
# time (baked into the image), because Railway's filesystem is ephemeral (no
# persistent volume by default).
#
# Whole-India preprocessing needed 15-30GB peak RAM (too much for a Hobby-tier plan's
# billing). Clipping to these metro bounding boxes before osrm-extract cuts the data
# volume (and RAM/time) down drastically, while still covering every city you need.
# Geofabrik doesn't publish per-city files for India, so the one-time ~1.7GB country
# download is unavoidable — but it's discarded right after clipping, in the same layer,
# so it adds zero runtime cost; only the final clipped+preprocessed data ships in the image.
#
# Gurgaon/Noida are inside the Delhi NCR box already — no separate entry needed.
ARG OSM_SOURCE_URL=https://download.geofabrik.de/asia/india-latest.osm.pbf

# west,south,east,north (lon/lat) per city — adjust if a city's coverage feels too tight.
ARG BBOX_AHMEDABAD=72.30,22.80,72.75,23.20
ARG BBOX_DELHI_NCR=76.75,28.35,77.40,28.95
ARG BBOX_MUMBAI=72.70,18.85,73.15,19.35
ARG BBOX_PUNE=73.70,18.40,74.00,18.70
ARG BBOX_BANGALORE=77.40,12.75,77.80,13.15
ARG BBOX_HYDERABAD=78.25,17.20,78.70,17.60
ARG BBOX_INDORE=75.70,22.60,75.95,22.85
ARG BBOX_BHOPAL=77.30,23.10,77.55,23.35
ARG BBOX_SURAT=72.70,21.05,72.95,21.30

# osrm/osrm-backend's own base OS is old enough that its apt repos 404 — don't rely on
# apt-get inside it at all. Download + clip + merge in a separate, current image
# instead, and hand only the small merged file to the OSRM stage via COPY --from.
FROM debian:bookworm-slim AS fetch
ARG OSM_SOURCE_URL
ARG BBOX_AHMEDABAD
ARG BBOX_DELHI_NCR
ARG BBOX_MUMBAI
ARG BBOX_PUNE
ARG BBOX_BANGALORE
ARG BBOX_HYDERABAD
ARG BBOX_INDORE
ARG BBOX_BHOPAL
ARG BBOX_SURAT
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates osmium-tool \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /data
RUN curl -L -o india.osm.pbf "$OSM_SOURCE_URL"
RUN osmium extract --bbox "$BBOX_AHMEDABAD" india.osm.pbf -o ahmedabad.osm.pbf --overwrite \
    && osmium extract --bbox "$BBOX_DELHI_NCR" india.osm.pbf -o delhi.osm.pbf --overwrite \
    && osmium extract --bbox "$BBOX_MUMBAI" india.osm.pbf -o mumbai.osm.pbf --overwrite \
    && osmium extract --bbox "$BBOX_PUNE" india.osm.pbf -o pune.osm.pbf --overwrite \
    && osmium extract --bbox "$BBOX_BANGALORE" india.osm.pbf -o bangalore.osm.pbf --overwrite \
    && osmium extract --bbox "$BBOX_HYDERABAD" india.osm.pbf -o hyderabad.osm.pbf --overwrite \
    && osmium extract --bbox "$BBOX_INDORE" india.osm.pbf -o indore.osm.pbf --overwrite \
    && osmium extract --bbox "$BBOX_BHOPAL" india.osm.pbf -o bhopal.osm.pbf --overwrite \
    && osmium extract --bbox "$BBOX_SURAT" india.osm.pbf -o surat.osm.pbf --overwrite \
    && rm india.osm.pbf
RUN osmium merge ahmedabad.osm.pbf delhi.osm.pbf mumbai.osm.pbf pune.osm.pbf bangalore.osm.pbf \
      hyderabad.osm.pbf indore.osm.pbf bhopal.osm.pbf surat.osm.pbf -o region.osm.pbf --overwrite \
    && rm ahmedabad.osm.pbf delhi.osm.pbf mumbai.osm.pbf pune.osm.pbf bangalore.osm.pbf \
         hyderabad.osm.pbf indore.osm.pbf bhopal.osm.pbf surat.osm.pbf

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
