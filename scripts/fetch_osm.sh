#!/bin/sh
# Refresh the OpenStreetMap extracts in scripts/osm/ from the Overpass API.
# Run from the repository root, then rebuild the map data:
#   sh scripts/fetch_osm.sh && python3 scripts/build_geo.py
# Overpass sometimes answers 502/504 when busy; run it again if a fetch fails.
set -e
OUT=scripts/osm
API=https://overpass-api.de/api/interpreter
UA="simister-island map builder"
BBOX="53.528,-2.300,53.566,-2.215"

fetch() {
  curl -sf -m 180 -A "$UA" --data-urlencode "data=$2" "$API" -o "$OUT/$1"
  echo "fetched $1"
}

fetch roads.json "[out:json][timeout:120];
way[\"highway\"~\"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential)$\"]($BBOX);
out geom tags;"

fetch land.json "[out:json][timeout:120];
(way[\"leisure\"~\"^(golf_course|park|nature_reserve)$\"]($BBOX);
way[\"natural\"~\"^(water|wood)$\"]($BBOX);
way[\"landuse\"~\"^(residential|forest|industrial|farmland|meadow|grass)$\"]($BBOX);
way[\"waterway\"~\"^(river|stream|brook)$\"]($BBOX););
out geom tags;"

fetch places.json '[out:json][timeout:60];
node["place"~"^(suburb|village|hamlet|town|neighbourhood|quarter)$"](53.525,-2.305,53.570,-2.210);
out;'
