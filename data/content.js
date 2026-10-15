// The words: the four roads, the twelve ways through, the works timeline and the facts.
// Sign text is from OpenStreetMap destination tags; scheme facts from National Highways
// and the scheme's Development Consent Order documents. Do not invent facts.

// Where each road goes. Colour keys match the CSS (--to-w, --to-s, --to-n, --to-e).
window.ARMS = {
  w: { road: 'M60', short: 'M60 West', label: 'Whitefield (J17)', to: 'Whitefield (J17), Bolton, Liverpool', from: 'from Whitefield (J17)' },
  s: { road: 'M60', short: 'M60 South', label: 'Middleton (J19)', to: 'Middleton (J19), Oldham, Manchester', from: 'from Middleton (J19)' },
  n: { road: 'M66', short: 'M66', label: 'Bury', to: 'Bury, Burnley, Blackburn', from: 'from Bury' },
  e: { road: 'M62', short: 'M62', label: 'Leeds', to: 'Rochdale, Leeds', from: 'from Leeds' },
};

// The twelve movements. kind: through (main carriageway), link (a slip that never
// meets the roundabout) or island (round the roundabout).
window.MOVES = [
  { id: 'w-e', kind: 'through', text: 'Stay on the main carriageway. It runs straight on through the junction and becomes the M62.' },
  { id: 'w-n', kind: 'link', text: 'Leave by the nearside lane. Where the slip divides, keep left for Bury and Burnley: the link runs onto the M66 without meeting the roundabout.' },
  { id: 'w-s', kind: 'island', text: 'The famous one: to stay on the M60 you have to leave it. Take the slip signed Ring Road and Oldham, keep right where it divides, ride the inner lanes round the north side, crossing the M66, then move out for the M60 exit.',
    after: 'From 2029 the Northern Loop takes this traffic. It keeps right where the slip divides, crosses the M66 on the new Simister Pike Fold Viaduct, loops round north of the junction and joins the M66 southbound, which runs under the roundabout and on as the M60.' },

  { id: 'n-s', kind: 'through', text: 'Stay on the main carriageway. The M66 passes under the roundabout and carries straight on as the M60 towards J19.',
    after: 'The scheme widens the M66 southbound through the junction from two lanes to four, because the Northern Loop traffic joins it here.' },
  { id: 'n-e', kind: 'link', text: 'Take the slip signed Ring Road, Preston and Liverpool, then keep left for Leeds and Rochdale. A one-lane link runs onto the M62 without meeting the roundabout.' },
  { id: 'n-w', kind: 'island', text: 'Take the slip signed Ring Road, Preston and Liverpool, keep right onto the roundabout, ride the inner lanes past the M62 exit, then move out and leave for the M60 west.',
    after: 'In 2029 the slip from the M66 is realigned and crosses the Northern Loop on a new bridge.' },

  { id: 'e-w', kind: 'through', text: 'Stay on the main carriageway. The M62 runs straight through and becomes the M60 for Whitefield.' },
  { id: 'e-s', kind: 'link', text: 'Take the slip and keep left for Ring Road and Manchester. A one-lane link joins the M60 towards J19 without meeting the roundabout.',
    after: 'The M62 westbound to M60 southbound link is realigned as part of the scheme.' },
  { id: 'e-n', kind: 'island', text: 'Take the slip, keep right for Blackburn and Bury, then go round the south and west sides of the roundabout and leave for the M66.' },

  { id: 's-n', kind: 'through', text: 'Stay on the main carriageway. The M60 passes under the roundabout and carries straight on as the M66.' },
  { id: 's-w', kind: 'link', text: 'Take the slip and keep left for Ring Road, Bolton and Liverpool. Today this link is a single lane.',
    after: 'The scheme widens the M60 northbound to westbound link from one lane to two.' },
  { id: 's-e', kind: 'island', text: 'Take the slip, keep right for Leeds, go round the west and north sides of the roundabout and leave for the M62.' },
];

// The works, as decimal years so the timeline can place them. planned: the
// programme in the scheme's Environmental Statement, which may move.
window.TIMELINE = [
  { t: 2021.07, date: '27 January 2021', title: 'The Northern Loop is chosen', text: 'National Highways picks the Northern Loop over the Inner Links option. Over two-thirds of the people who answered the 2020 consultation preferred it.' },
  { t: 2024.33, date: '1 May 2024', title: 'Planning application accepted', text: 'The Planning Inspectorate accepts the application for a Development Consent Order for examination.' },
  { t: 2025.69, date: '9 September 2025', title: 'Consent granted', text: 'The Secretary of State for Transport approves the Development Consent Order.' },
  { t: 2026.13, date: 'From 16 February 2026', title: 'Clearing the site', text: 'About three weeks of vegetation clearance around the junction.' },
  { t: 2026.18, date: '6 March to 24 April 2026', title: 'M62 resurfacing', text: 'The M62 eastbound between J18 and J19 is resurfaced, with two or three of its four lanes closed in the second phase.' },
  { t: 2026.40, date: 'From 26 May 2026', title: 'Traffic management goes in', text: 'About three weeks of overnight closures to install a temporary safety barrier, average speed cameras and new road markings.' },
  { t: 2026.53, date: 'July 2026', title: 'Gantries start coming down', text: 'Cranes begin lifting out the old gantries between J17 and J18.' },
  { t: 2026.74, date: '26 to 28 September 2026', title: 'First weekend closure', text: 'The M60 is shut between J17 and J18 and two of the four concrete gantries are removed. The road reopened early, at about 9:45pm on the Sunday.' },
  { t: 2026.78, date: '10 to 12 October 2026', title: 'Second weekend closure', text: 'The M60 is shut between J17 and J18 again to remove the remaining gantries. The clockwise closure started later, at 11:59pm, because of an event at Co-op Live.' },
  { t: 2028.08, date: 'Q1 2028 (planned)', title: 'M66 traffic switch', text: 'Traffic moves onto the realigned M66 southbound diverge.', planned: true },
  { t: 2028.58, date: 'Q3 2028 (planned)', title: 'Northern Loop traffic switch', text: 'M60 traffic heading for J19 starts using the Northern Loop instead of the roundabout.', planned: true },
  { t: 2029.08, date: 'Q1 2029 (planned)', title: 'Open for traffic', text: 'Five lanes each way between J17 and J18, four on the M66 southbound and the loop in use. National Highways now gives the end date as 2029/30.', planned: true },
];

// Simple switches the map uses. Decimal years.
window.PHASES = {
  worksStart: 2026.13,   // site clearance begins
  loopBuildStart: 2026.6,
  m66Switch: 2028.08,
  loopSwitch: 2028.58,
  open: 2029.08,
  now: 2026.79,          // 15 October 2026, when this was last updated
};

window.SCHEME = [
  ['The Northern Loop', 'A new link from the M60 eastbound to the M60 southbound, so M60 traffic no longer leaves the motorway to go round the roundabout.'],
  ['Five lanes, J17 to J18', 'The M60 between Whitefield and Simister goes from four lanes to five in both directions, with a new hard shoulder. Traffic joining at one junction and leaving at the next need not change lanes.'],
  ['Four lanes on the M66', 'The M66 southbound through the junction goes from two lanes to four.'],
  ['A wider link to the west', 'The M60 northbound to westbound link goes from one lane to two.'],
  ['One slip closes', 'The slip from the M60 eastbound onto the roundabout closes to general traffic. Its traffic has the loop now.'],
  ['New signals and signs', 'Renewed traffic signals on the roundabout, new signs, lighting and gantries.'],
];

window.FACTS = [
  ['Vehicles a day', '90,000'],
  ['Cost', '£255m to £296m'],
  ['Opens', '2029'],
];
