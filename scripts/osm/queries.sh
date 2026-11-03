#!/usr/bin/env bash
# Fetches Jersey's OpenStreetMap data for the guide's map pages, once.
# Run by .github/workflows/fetch-osm.yml (the sandbox cannot reach Overpass).
# Output: data/osm/*.json (Overpass JSON, "out geom"). © OpenStreetMap contributors, ODbL.
set -euo pipefail
OUT=${1:-data/osm}
mkdir -p "$OUT"
ISLAND="49.155,-2.265,49.275,-1.995"
TOWN="49.172,-2.130,49.198,-2.085"
ENDPOINTS=(https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter https://overpass.private.coffee/api/interpreter)

fetch() {
  local name=$1 query=$2
  for attempt in 1 2 3; do
    for ep in "${ENDPOINTS[@]}"; do
      echo "== $name via $ep (try $attempt)"
      if curl -sS --fail -m 300 --data-urlencode "data=[out:json][timeout:240];$query" "$ep" -o "$OUT/$name.json.tmp" \
        && node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));if(!j.elements)process.exit(1);console.log(j.elements.length+" elements")' "$OUT/$name.json.tmp"; then
        mv "$OUT/$name.json.tmp" "$OUT/$name.json"; return 0
      fi
      sleep 10
    done
  done
  echo "failed: $name"; return 1
}

fetch coastline "(way[natural=coastline]($ISLAND););out geom;"
fetch landcover "(
  way[natural~\"^(wood|scrub|heath|grassland|beach|sand|wetland|bare_rock)$\"]($ISLAND);
  relation[natural~\"^(wood|scrub|heath|grassland|beach|sand|wetland)$\"]($ISLAND);
  way[landuse~\"^(forest|residential|commercial|retail|industrial|grass|meadow|recreation_ground|cemetery|reservoir|vineyard|orchard)$\"]($ISLAND);
  relation[landuse~\"^(forest|residential|commercial|retail|industrial)$\"]($ISLAND);
  way[leisure~\"^(park|golf_course|nature_reserve|garden|pitch|common)$\"]($ISLAND);
  relation[leisure~\"^(park|golf_course|nature_reserve)$\"]($ISLAND);
  way[aeroway~\"^(aerodrome|runway)$\"]($ISLAND);
  way[natural=water]($ISLAND);relation[natural=water]($ISLAND);
  way[waterway~\"^(river|stream)$\"]($ISLAND);
  way[\"man_made\"~\"^(pier|breakwater)$\"]($ISLAND);
);out geom;"
fetch protected "(relation[boundary~\"^(protected_area|national_park)$\"]($ISLAND);way[boundary~\"^(protected_area|national_park)$\"]($ISLAND););out geom;"
fetch parishes "(relation[boundary=administrative][admin_level~\"^(8|10)$\"]($ISLAND););out geom;"
fetch roads "(way[highway~\"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|track|path|footway|cycleway|bridleway)$\"]($ISLAND););out geom;"
fetch town "(
  way[building]($TOWN);relation[building]($TOWN);
  way[highway]($TOWN);
  way[\"area:highway\"]($TOWN);
  way[amenity=parking]($TOWN);
);out geom;"
fetch places "(
  node[place~\"^(town|village|hamlet|suburb|locality|islet|island)$\"]($ISLAND);
  node[natural~\"^(bay|cape|peak)$\"]($ISLAND);way[natural=bay]($ISLAND);
  node[place~\"^(islet|island|locality)$\"](48.95,-2.25,49.32,-1.80);
  way[place~\"^(islet|island)$\"](48.95,-2.25,49.32,-1.80);
);out center tags;"
fetch pois "(
  nwr[tourism~\"^(attraction|museum|gallery|viewpoint|zoo|theme_park|information|camp_site|hotel)$\"]($ISLAND);
  nwr[historic]($ISLAND);
  nwr[man_made~\"^(lighthouse|windmill|watermill)$\"]($ISLAND);
  nwr[amenity~\"^(pub|bar|restaurant|cafe|toilets|bus_station|ferry_terminal|parking|theatre|cinema|library|police|hospital|post_office|marketplace)$\"]($ISLAND);
  nwr[shop][name]($ISLAND);
  nwr[leisure~\"^(sports_centre|bowling_alley|marina|slipway|water_park|swimming_pool)$\"][name]($ISLAND);
  nwr[sport][name]($ISLAND);
  nwr[craft][name]($ISLAND);
);out center tags;"
ls -la "$OUT"
