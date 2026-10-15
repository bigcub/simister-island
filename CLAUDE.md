# Project context

A map of Simister Island (M60 J18 / M62 J18 / M66 J4): the junction to scale, its
lanes colour-coded by destination, a traffic simulation, and the National Highways
scheme that adds the Northern Loop by 2029. A sibling of m60motorway.com
(github.com/bigcub/m60motorway) and shares its look. Read README.md for the file map.

## How it fits together

- Static files, no build step for the page. Only `data/geo.js` is generated, by
  `scripts/build_geo.py` from the OSM extracts in `scripts/osm/`. Do not edit it by hand.
  Node is not needed; the scripts are Python.
- Map units are metres, x east and y south, origin at the middle of the roundabout.
  The SVG viewBox is in metres; CSS `--k` is metres per screen pixel, so anything
  drawn at a constant screen size (labels, outlines) multiplies by it.
- Routes (the twelve movements, plus `w-s-2029` by the loop) are chained from OSM way
  ids in `build_geo.py`. Each piece carries a lane position `u` (0 nearside, 1 offside);
  `map.js` smooths it so lane changes are gradual. The sim and the lane colours both
  use these routes.
- The timeline is a decimal year. `PHASES` in `data/content.js` sets when the works
  start, when the loop opens and when the new lane counts apply. `app.js` turns a date
  into a state and redraws only when the layout changes.

## Facts

Scheme facts come from National Highways and the DCO documents (TR010064). Sign text
comes from OSM destination tags. Do not invent destinations, dates or lane counts; if
a fact is uncertain, leave it out. Dates from the Environmental Statement programme
are marked planned. The loop alignment is traced from the scheme drawing and is
approximate; say so wherever it matters. Simulation demand is illustrative and the
page says so.

## Design intent

One screen, no page scroll, everything floating over the map. Same palette and type as
m60motorway.com (warm paper, green-black ink, Lora and DM Sans). The four destination
colours (`--to-w`, `--to-s`, `--to-n`, `--to-e`) mean the same thing everywhere: lane
ribbons, cars, list dots and the logo. Road shields are the one place road-sign blue
is used.

Before handing off a visual change, check light and dark, a phone width and a desktop
width, the console, and reduced motion (the traffic starts paused).

## Analytics

Google Analytics (GA4, `G-QRBPTTMSWD`) is in the `<head>` of `index.html`. It loads
only when the page is served from simisterisland.com, so local previews never reach
the reports.

## Working locally

```sh
python3 -m http.server 8766
```

Headless screenshots: Chrome with `--virtual-time-budget` and `?t=` / `?at=` to pick
the date and view. Headless Chrome will not go narrower than about 500px; check phone
widths through a 390px iframe or the browser pane's mobile preset.
