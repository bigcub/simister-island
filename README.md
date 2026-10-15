# Simister Island

A map of Simister Island, the junction north of Manchester where the M60, M62 and
M66 meet (M60 J18, M62 J18, M66 J4). It is a companion to
[m60motorway.com](https://m60motorway.com) and shares its look.

- **The junction to scale.** Every motorway, slip road and the roundabout drawn at
  its real width from OpenStreetMap, with lane lines and bridges.
- **Lane colours.** Each lane is coloured by where it leads. Every movement on the
  roundabout is a right turn, so the colours form a spiral: inner lanes for the first
  quarter, outer lanes for the exit.
- **Live traffic.** Cars follow the real lanes, keep their distance and stop at the
  roundabout's signals. Click a car to follow it. A stopwatch compares the M60 from
  J17 to J19 on the old layout and on the Northern Loop.
- **The works.** A timeline from the 2021 route decision to opening in 2029. Drag it
  to watch the loop go up, the slip close and the lanes widen.
- **Ways through.** All twelve movements, with the signs you follow and what changes
  after the works.

## Local preview

```sh
python3 -m http.server 8766
```

Then open <http://localhost:8766>. There is no build step. `?t=2029.3` opens the
page at a date on the timeline, and `?at=x,y,zoom` at a view (metres east and south
of the roundabout, pixels per metre).

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The page: the map, the floating controls, the timeline and the panel. |
| `styles.css` | The visual system, both themes and the phone layout. |
| `map.js` | Geometry helpers and the SVG map: land, roads, motorways to scale, the works, lane colours and labels. |
| `sim.js` | The traffic simulation and its canvas drawing. |
| `app.js` | Pan and zoom, the timeline, the panel, and the frame loop. |
| `data/content.js` | The words: arms, the twelve movements, the timeline, the scheme and facts. |
| `data/geo.js` | Generated map geometry and routes. Do not edit by hand. |
| `scripts/fetch_osm.sh`, `scripts/build_geo.py` | Refresh the OpenStreetMap extracts and rebuild `data/geo.js`. |

To refresh the map data:

```sh
sh scripts/fetch_osm.sh && python3 scripts/build_geo.py
```

## Deployment

Pushing to `main` runs `.github/workflows/pages.yml`, which copies the page files into
`site/` and publishes them to GitHub Pages at <https://simisterisland.com>. The custom
domain is set in the repository's Pages settings; `CNAME` records it too.

DNS, at the registrar:

- `simisterisland.com`: `A` records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
- `www.simisterisland.com`: a `CNAME` to `bigcub.github.io`, so `www` redirects to the apex.

## Sources

- Map geometry © OpenStreetMap contributors, available under the ODbL. Sign text in
  the movement descriptions is from OpenStreetMap destination tags.
- The scheme, its lane counts and its programme: National Highways' scheme page and
  the Development Consent Order documents (Planning Inspectorate reference TR010064),
  especially the Environmental Statement non-technical summary.
- The Northern Loop's alignment is traced by eye from Figure 3 of that summary
  ("Overview of the Scheme Design") and is approximate.
- 2026 works updates: National Highways and local press reports.
- Traffic levels in the simulation are made up to look plausible. They are not counts.
