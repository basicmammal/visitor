"""
Reads the Channel Islands OpenStreetMap extract (data/osm/guernsey-jersey.osm.pbf)
and writes Jersey's features as Overpass-style JSON (data/osm/*.json, not kept):
what scripts/osm/build.ts draws the guide's maps from.

  pip install osmium && python3 scripts/osm/extract.py

(c) OpenStreetMap contributors, ODbL.
"""
import json
import os
import re

import osmium

SRC = 'data/osm/guernsey-jersey.osm.pbf'
OUT = 'data/osm'
# Jersey with its reefs: Les Ecrehous to the north east, Les Minquiers to the south.
S, W, N, E = 48.95, -2.30, 49.32, -1.80
TOWN = (49.172, -2.130, 49.198, -2.085)

LAND = re.compile(r'^(wood|scrub|heath|grassland|beach|sand|wetland|bare_rock|water)$')
LANDUSE = re.compile(r'^(forest|residential|commercial|retail|industrial|grass|meadow|recreation_ground|cemetery|reservoir|vineyard|orchard)$')
LEISURE = re.compile(r'^(park|golf_course|nature_reserve|garden|pitch|common)$')


def in_box(lat, lon, box=(S, W, N, E)):
    return box[0] <= lat <= box[2] and box[1] <= lon <= box[3]


def is_cover(t):
    return bool(
        LAND.match(t.get('natural', ''))
        or LANDUSE.match(t.get('landuse', ''))
        or LEISURE.match(t.get('leisure', ''))
        or t.get('aeroway') in ('aerodrome', 'runway')
        or t.get('waterway') in ('river', 'stream')
        or t.get('man_made') in ('pier', 'breakwater')
    )


def is_protected(t):
    return t.get('boundary') in ('protected_area', 'national_park')


class Relations(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rels = []
        self.wanted = set()

    def relation(self, r):
        t = dict(r.tags)
        if t.get('type') not in ('multipolygon', 'boundary'):
            return
        if not (is_cover(t) or is_protected(t) or 'building' in t or (t.get('boundary') == 'administrative' and t.get('admin_level') in ('8', '10'))):
            return
        members = [(m.ref, m.role) for m in r.members if m.type == 'w']
        self.rels.append({'id': r.id, 'tags': t, 'members': members})
        self.wanted.update(ref for ref, _ in members)


class Features(osmium.SimpleHandler):
    def __init__(self, wanted):
        super().__init__()
        self.wanted = wanted
        self.member_geom = {}
        self.ways = []
        self.nodes = []

    def node(self, n):
        t = dict(n.tags)
        if not t or not n.location.valid() or not in_box(n.location.lat, n.location.lon):
            return
        if 'place' in t or t.get('natural') in ('bay', 'cape', 'peak') or 'tourism' in t or 'historic' in t or 'amenity' in t or ('shop' in t and 'name' in t) or t.get('man_made') in ('lighthouse', 'windmill', 'watermill') or ('leisure' in t and 'name' in t):
            self.nodes.append({'type': 'node', 'id': n.id, 'lat': n.location.lat, 'lon': n.location.lon, 'tags': t})

    def way(self, w):
        try:
            geom = [{'lat': p.location.lat, 'lon': p.location.lon} for p in w.nodes]
        except osmium.InvalidLocationError:
            return
        if not geom:
            return
        if w.id in self.wanted:
            self.member_geom[w.id] = geom
        t = dict(w.tags)
        if not t or not any(in_box(p['lat'], p['lon']) for p in geom):
            return
        if t.get('natural') == 'coastline' or is_cover(t) or is_protected(t) or 'highway' in t or 'area:highway' in t or 'building' in t or 'place' in t or t.get('amenity') == 'parking' or t.get('natural') == 'bay' or 'tourism' in t or 'historic' in t:
            self.ways.append({'type': 'way', 'id': w.id, 'tags': t, 'geometry': geom})


def center(geom):
    return {'lat': sum(p['lat'] for p in geom) / len(geom), 'lon': sum(p['lon'] for p in geom) / len(geom)}


def main():
    rel = Relations()
    rel.apply_file(SRC)
    feat = Features(rel.wanted)
    feat.apply_file(SRC, locations=True)

    relations = []
    for r in rel.rels:
        members = [{'type': 'way', 'role': role, 'geometry': feat.member_geom[ref]} for ref, role in r['members'] if ref in feat.member_geom]
        if members and any(in_box(p['lat'], p['lon']) for m in members for p in m['geometry']):
            relations.append({'type': 'relation', 'id': r['id'], 'tags': r['tags'], 'members': members})

    ways = feat.ways
    in_town = lambda e: any(in_box(p['lat'], p['lon'], TOWN) for p in e['geometry'])
    files = {
        'coastline': [w for w in ways if w['tags'].get('natural') == 'coastline'],
        'landcover': [w for w in ways if is_cover(w['tags'])] + [r for r in relations if is_cover(r['tags'])],
        'protected': [w for w in ways if is_protected(w['tags'])] + [r for r in relations if is_protected(r['tags'])],
        'parishes': [r for r in relations if r['tags'].get('boundary') == 'administrative'],
        'roads': [w for w in ways if 'highway' in w['tags']],
        'town': [w for w in ways if ('building' in w['tags'] or 'highway' in w['tags'] or 'area:highway' in w['tags'] or w['tags'].get('amenity') == 'parking') and in_town(w)]
        + [r for r in relations if 'building' in r['tags']],
        'places': [n for n in feat.nodes if 'place' in n['tags'] or n['tags'].get('natural') in ('bay', 'cape', 'peak')]
        + [{'type': 'way', 'id': w['id'], 'tags': w['tags'], 'center': center(w['geometry'])} for w in ways if 'place' in w['tags'] or w['tags'].get('natural') == 'bay'],
        'pois': [n for n in feat.nodes if 'place' not in n['tags']]
        + [{'type': 'way', 'id': w['id'], 'tags': w['tags'], 'center': center(w['geometry'])} for w in ways if 'name' in w['tags'] and ('tourism' in w['tags'] or 'historic' in w['tags'] or 'building' in w['tags'])],
    }
    os.makedirs(OUT, exist_ok=True)
    for name, elements in files.items():
        with open(f'{OUT}/{name}.json', 'w') as f:
            json.dump({'elements': elements}, f)
        print(f'{name}: {len(elements)}')


if __name__ == '__main__':
    main()
