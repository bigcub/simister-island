"""Build data/geo.js from the OpenStreetMap extracts in scripts/osm/.

Everything is projected onto a flat plane in metres, with the origin at the
middle of the Simister Island roundabout, x east and y south (screen order).
Besides the drawable map (roads with lane counts, land, water, places) it
chains OSM ways into the routes cars take through the interchange, today and
after the 2029 scheme. Run from the repository root:

    python3 scripts/build_geo.py
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OSM = os.path.join(ROOT, 'scripts', 'osm')

LAT0, LON0 = 53.54982, -2.26055      # the middle of the roundabout
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110574
LANE = 3.65                           # metres per lane


def P(lat, lon):
    return ((lon - LON0) * KX, -(lat - LAT0) * KY)


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-9
    dmax, idx = 0, 0
    for i, (x, y) in enumerate(pts[1:-1], 1):
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def flat(pts):
    return [round(v, 1) for p in pts for v in p]


def load(name):
    with open(os.path.join(OSM, name)) as f:
        return json.load(f)['elements']


# ---------- roads ----------
CLASS = {'motorway': 'mw', 'motorway_link': 'link', 'trunk': 'trunk', 'trunk_link': 'trunk',
         'primary': 'primary', 'primary_link': 'primary', 'secondary': 'secondary', 'secondary_link': 'secondary',
         'tertiary': 'tertiary', 'tertiary_link': 'tertiary', 'unclassified': 'minor', 'residential': 'minor'}
ways = {}
roads = []
for w in load('roads.json'):
    t = w['tags']
    pts = [P(g['lat'], g['lon']) for g in w['geometry']]
    cls = CLASS[t['highway']]
    if t.get('junction') == 'roundabout' and t.get('name') == 'Simister Island circular':
        cls = 'ring'
    lanes = int(t.get('lanes', '0').split(';')[0] or 0) or (1 if cls == 'link' else 3 if cls == 'mw' else 0)
    ways[w['id']] = {'pts': pts, 'lanes': lanes, 'cls': cls, 'tags': t}
    if cls in ('mw', 'link', 'ring'):
        roads.append({'id': w['id'], 'c': cls, 'l': lanes, 'z': int(t.get('layer', '0') or 0) + (1 if t.get('bridge') else 0),
                      'b': 1 if t.get('bridge') else 0, 'ref': t.get('ref', ''), 'p': flat(rdp(pts, 0.4))})
    else:
        eps = 1.5 if cls == 'minor' else 1.0
        roads.append({'id': w['id'], 'c': cls, 'p': flat(rdp(pts, eps)), 'n': t.get('name', '')})


# ---------- routes ----------
def close(a, b, tol=0.6):
    return math.hypot(a[0] - b[0], a[1] - b[1]) < tol


def chain(ids):
    """Join ways end to end. Where a way branches from the middle of the previous
    one (a diverge) the previous one is cut at the shared node; where it merges
    into the middle of the next one, the next one starts at the shared node.
    Returns the points, the lane count at each point and the way each point is from."""
    pts, lanes, src = [], [], []
    for wid in ids:
        w = ways[wid]
        q = list(w['pts'])
        if pts:
            if close(q[0], pts[-1]):
                q = q[1:]
            else:
                cut = next((i for i, p in enumerate(pts) if close(p, q[0])), None)
                if cut is not None:
                    pts, lanes, src = pts[:cut], lanes[:cut], src[:cut]
                else:
                    k = min(range(len(q)), key=lambda i: math.hypot(q[i][0] - pts[-1][0], q[i][1] - pts[-1][1]))
                    q = q[k + 1:]
        pts += q
        lanes += [w['lanes']] * len(q)
        src += [wid] * len(q)
    return pts, lanes, src


def trim(r, rad):
    """Keep the part of a route inside radius rad of the roundabout."""
    keep = [i for i, p in enumerate(r['pts']) if math.hypot(*p) < rad]
    a, b = keep[0], keep[-1] + 1
    return {k: v[a:b] for k, v in r.items()}


def build(pieces):
    """A route from (way ids, lane position) pieces. Lane position runs from 0, the
    nearside (left) lane, to 1, the offside (right) lane."""
    ids = [w for wids, _ in pieces for w in wids]
    u_of = {w: u for wids, u in pieces for w in wids}
    pts, lanes, src = chain(ids)
    return {'pts': pts, 'l': lanes, 'u': [u_of[w] for w in src], 'w': src}


def pack(r):
    return {'p': flat(r['pts']), 'l': r['l'], 'u': r['u'], 'w': r['w']}


# Approaches and departures, as chains of OSM way ids.
M60_IN_W = [46376679, 1218598437, 197713171, 112188549]          # M60 clockwise from J17 (Whitefield)
M60_OUT_W = [477555979, 43310666]                                  # M60 anticlockwise towards J17
M60_IN_S = [1451022894, 246124635, 1271991997]                     # M60 anticlockwise from J19 (Middleton)
M60_OUT_S = [966991264, 1451022895]                                # M60 clockwise towards J19
M66_IN = [4969099, 835312125, 522092977, 522092982]                # M66 southbound from Bury
M66_OUT = [197713173, 522092972, 522092969]                        # M66 northbound to Bury
M62_IN = [5008471, 1156168869, 1508135145, 1156168870, 1508135146, 43308610]  # M62 westbound from Leeds
M62_OUT = [158471343]                                              # M62 eastbound to Leeds

# The roundabout, clockwise, as four arcs between its entries (W from the M60
# clockwise, N from the M66, E from the M62, S from the M60 anticlockwise). Each
# exit sits just after an entry.
ARC = {
    'WN': [1313330609, 511509727, 28179893, 477555981],
    'NE': [511509726, 511509724, 28179892],
    'ES': [699903949, 511509723, 28179886, 477555980],
    'SW': [511509725, 28179885],
}
RING = ARC['SW'] + ARC['WN'] + ARC['NE'] + ARC['ES']

R_TO_M66 = [151364945, 197713175]
R_TO_M62 = [699903951, 151326551]
R_TO_M60S = [699903950, 1074531435, 151326562]
R_TO_M60W = [151326559, 1508135142, 966991263, 1508135143, 1508135144, 1508135141]

# Every movement on the roundabout is a right turn: straight on and left turns
# bypass it. So each car rides two arcs, the first in the inner lanes and the
# second in the outer lanes, ready for its exit just past the next entry. Each arc
# carries one stream in each half, which is what the lane colours show.
IN, OUT = 0.88, 0.14

# Movement ids are origin-destination: w = M60 from/to J17, s = M60 from/to J19, n = M66, e = M62.
MOVES = {
    # From the M60 clockwise (J17)
    'w-e': [(M60_IN_W, .72), ([28179952, 28179900, 28200212], .6), (M62_OUT, .6)],
    'w-n': [(M60_IN_W, 0), ([386002096, 151326558], 0), ([197713175] + M66_OUT, .3)],
    'w-s': [(M60_IN_W, 0), ([386002096, 181337749], 1), (ARC['WN'], IN), (ARC['NE'], OUT), ([699903949], OUT),
            (R_TO_M60S, .5), (M60_OUT_S, .35)],
    # From the M66 southbound
    'n-s': [(M66_IN, .72), ([259187067, 4272793], .6), (M60_OUT_S, .6)],
    'n-e': [(M66_IN, 0), ([151326555, 151326554, 151326551], 0), (M62_OUT, .2)],
    'n-w': [(M66_IN, .15), ([151326555], 1), (ARC['NE'], IN), (ARC['ES'], OUT), (R_TO_M60W, .4), (M60_OUT_W, .35)],
    # From the M62 westbound
    'e-w': [(M62_IN, .7), ([43308611, 28179908, 28179903, 1508135144, 1508135141], .7), (M60_OUT_W, .7)],
    'e-s': [(M62_IN, 0), ([1074531341, 151326556, 151326562], 0), (M60_OUT_S, .1)],
    'e-n': [(M62_IN, .15), ([1074531341], 1), ([151326546], .5), (ARC['ES'], IN), (ARC['SW'], OUT), ([1313330609], OUT),
            (R_TO_M66, .5), (M66_OUT, .35)],
    # From the M60 anticlockwise (J19)
    's-n': [(M60_IN_S, .72), ([4085254], .6), (M66_OUT, .6)],
    's-w': [(M60_IN_S, 0), ([151326561, 151326548, 966991263, 1508135143, 1508135144, 1508135141], 0), (M60_OUT_W, .1)],
    's-e': [(M60_IN_S, .15), ([151326561], 1), ([966991265], .5), (ARC['SW'], IN), (ARC['WN'], OUT), ([511509726], OUT),
            (R_TO_M62, .5), (M62_OUT, .35)],
}

R_ROUTE = 1500
routes = {k: pack(trim(build(p), R_ROUTE)) for k, p in MOVES.items()}

# ---------- the 2029 scheme ----------
# The Northern Loop, traced from National Highways' "Overview of the Scheme Design"
# (Environmental Statement, Figure 3). Indicative: control points in metres east and
# north of the roundabout. It leaves the M60 eastbound to M66 link, crosses the M66 on
# the Simister Pike Fold Viaduct, loops anticlockwise north of the junction and joins
# the M66 southbound, which carries it under the roundabout to the M60 for J19.
LOOP_EN = [(-200, -42), (-150, 40), (-118, 105), (-90, 160), (-48, 228), (-4, 296), (28, 360), (40, 420),
           (26, 472), (-14, 505), (-72, 520), (-128, 502), (-168, 462), (-184, 410), (-178, 356), (-162, 304)]


def catmull(ctrl, n=10):
    out = []
    c = [ctrl[0]] + ctrl + [ctrl[-1]]
    for i in range(1, len(c) - 2):
        p0, p1, p2, p3 = c[i - 1], c[i], c[i + 1], c[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(ctrl[-1])
    return out


# Start the loop where the slip divides, and finish it on the M66 southbound.
start = chain([386002096])[0][-1]
m66 = ways[259187067]['pts']
loop_ctrl = [start] + [(e, -n) for e, n in LOOP_EN]
end_i = min(range(len(m66)), key=lambda i: math.hypot(m66[i][0] - loop_ctrl[-1][0], m66[i][1] - loop_ctrl[-1][1]))
loop_ctrl.append(m66[min(end_i + 1, len(m66) - 1)])
loop = catmull(loop_ctrl, 8)

# Route for M60 J17 -> J19 in 2029: approach, the loop, then the M66 southbound under the roundabout.
a = build([(M60_IN_W, 0), ([386002096], 1)])
b = build([([259187067, 4272793], .1), (M60_OUT_S, .35)])
b_i = next(i for i, p in enumerate(b['pts']) if close(p, loop[-1], 0.5))
r = {'pts': a['pts'] + loop[1:] + b['pts'][b_i + 1:],
     'l': a['l'] + [2] * (len(loop) - 1) + [4] + b['l'][b_i + 2:],
     'u': a['u'] + [.5] * (len(loop) - 1) + b['u'][b_i + 1:],
     'w': a['w'] + [0] * (len(loop) - 1) + b['w'][b_i + 1:]}
routes['w-s-2029'] = pack(trim(r, R_ROUTE))

FUTURE = {
    'loop': flat(rdp(loop, 0.2)),
    # Lane counts after the scheme (DCO Environmental Statement, section 2.4).
    'lanes': {
        # M60 J17 to J18: four lanes to five in both directions, plus a hard shoulder
        **{str(i): 5 for i in (1218598437, 197713171, 112188549, 477555979, 1508135141, 1508135144)},
        # M66 southbound through J18: two lanes to four
        '259187067': 4, '4272793': 4,
        # M60 northbound to M60 westbound link: one lane to two
        '151326548': 2,
    },
    'shoulder': [1218598437, 197713171, 112188549, 477555979],
    # The slip from the M60 eastbound to the roundabout closes to general traffic
    'closed': [181337749],
}

# ---------- land ----------
LAND = {'park': 'park', 'nature_reserve': 'park', 'golf_course': 'golf', 'water': 'water', 'wood': 'wood',
        'forest': 'wood', 'residential': 'town', 'industrial': 'works', 'farmland': 'field', 'meadow': 'field',
        'grass': 'grass'}
land, streams, named = [], [], []
for w in load('land.json'):
    if w['type'] != 'way' or 'geometry' not in w:
        continue
    t = w['tags']
    pts = [P(g['lat'], g['lon']) for g in w['geometry']]
    if t.get('waterway'):
        streams.append({'k': t['waterway'], 'p': flat(rdp(pts, 1.5))})
        continue
    kind = LAND.get(t.get('leisure') or t.get('natural') or t.get('landuse'))
    if not kind or len(pts) < 4:
        continue
    land.append({'k': kind, 'p': flat(rdp(pts, 1.5))})
    nm = t.get('name')
    if nm and kind in ('park', 'golf', 'water', 'wood'):
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        area = (max(xs) - min(xs)) * (max(ys) - min(ys))
        named.append([nm, round(sum(xs) / len(xs)), round(sum(ys) / len(ys)), kind, round(area)])

# keep the larger named areas only, one label per name
seen, area_labels = set(), []
for nm, x, y, kind, area in sorted(named, key=lambda r: -r[4]):
    if nm in seen or area < 40000:
        continue
    seen.add(nm)
    area_labels.append([nm, x, y, kind])

places = [[e['tags']['name'], *[round(v) for v in P(e['lat'], e['lon'])], e['tags']['place']] for e in load('places.json')]

out = {
    'origin': [LAT0, LON0],
    'lane': LANE,
    'roads': sorted(roads, key=lambda r: r.get('z', 0)),
    'ring': flat(chain(RING)[0]),
    'arcs': {k: flat(chain(v)[0]) for k, v in ARC.items()},
    'routes': routes,
    'future': FUTURE,
    'land': land,
    'streams': streams,
    'areaLabels': area_labels,
    'places': places,
}
with open(os.path.join(ROOT, 'data', 'geo.js'), 'w') as f:
    f.write('// Generated by scripts/build_geo.py from OpenStreetMap data (c) OpenStreetMap contributors, ODbL.\n')
    f.write('window.GEO = ' + json.dumps(out, separators=(',', ':')) + ';\n')
print('wrote data/geo.js:', os.path.getsize(os.path.join(ROOT, 'data', 'geo.js')) // 1024, 'KB;',
      len(roads), 'roads,', len(routes), 'routes,', len(land), 'land areas')
for k, r in routes.items():
    p = r['p']
    L = sum(math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) for i in range(0, len(p) - 2, 2))
    print(f'  {k:10s} {L:7.0f} m  {len(p) // 2} pts')
