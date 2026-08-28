# OpenHamClock User Manual

Everything OpenHamClock can do, and how to use it. New here? Do the five-minute setup in the [Quick Start](QUICKSTART.md) first, then come back when you want the details.

Features tagged **(next release)** are already merged and will ship in the next monthly drop — you'll see them on the staging site and in fresh git checkouts before they reach the hosted site.

## Contents

- [The basics](#the-basics)
- [The map](#the-map)
  - [Projections: flat, azimuthal, 3D globe](#projections-flat-azimuthal-3d-globe)
  - [Basemap styles](#basemap-styles)
  - [Map layers](#map-layers)
  - [DE and DX: markers, click-to-set, favorites](#de-and-dx-markers-click-to-set-favorites)
  - [Map Data text view (accessibility)](#map-data-text-view-accessibility)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Panels](#panels)
  - [Spots and activity](#spots-and-activity)
  - [Propagation and space weather](#propagation-and-space-weather)
  - [Station and rig](#station-and-rig)
  - [Logging](#logging)
  - [EmComm and mesh](#emcomm-and-mesh)
  - [Utility](#utility)
- [DX cluster in depth](#dx-cluster-in-depth)
- [The logbook](#the-logbook)
- [Propagation in depth](#propagation-in-depth)
- [Satellites](#satellites)
- [Rig control and Rig Bridge](#rig-control-and-rig-bridge)
- [WSJT-X and digital modes](#wsjt-x-and-digital-modes)
- [The EmComm layout](#the-emcomm-layout)
- [Alerts and notifications](#alerts-and-notifications)
- [Offline mode (PWA)](#offline-mode-pwa)
- [Layouts, themes, and profiles](#layouts-themes-and-profiles)
- [Languages](#languages)
- [Settings reference](#settings-reference)
- [Hosted site vs self-hosted](#hosted-site-vs-self-hosted)

---

## The basics

OpenHamClock is a browser app. Everything you configure — callsign, layout, filters, theme — is saved in that browser's local storage. That has two practical consequences:

- **Nothing follows you between browsers or devices automatically.** Use **Settings → Profiles → Export** to move a configuration, or enable `SETTINGS_SYNC=true` on a self-hosted single-operator install to keep every device in sync from the server.
- **Clearing site data clears your setup** (and your logbook — see [The logbook](#the-logbook)). Export before you spring-clean your browser.

The header bar shows your callsign (click it to open Settings), the version number (click it to open the What's New release notes), UTC and local clocks (click the local clock to flip 12/24-hour), current weather, and live SFI / K / SSN indices. On self-hosted installs an **UPDATE** button appears when a new version is available.

Two terms you'll see everywhere, inherited from the original HamClock:

- **DE** — your station ("from" in Morse shorthand).
- **DX** — the target station or location you're interested in working.

---

## The map

The interactive world map is the centerpiece. DX spots, activators, satellites, signal paths, weather, and your own station all live here.

### Projections: flat, azimuthal, 3D globe

A projection toggle on the map switches between three views:

| Projection    | What you get                                                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flat**      | Classic Mercator map (Leaflet). Best all-rounder; markers replicate across world copies so nothing vanishes at the antimeridian.                                                                                                                                                                                                         |
| **Azimuthal** | Azimuthal-equidistant projection centered on your QTH — the "beam heading" view. A straight line from center is your true antenna bearing.                                                                                                                                                                                               |
| **3D Globe**  | A WebGL globe with true great-circle arcs, a real day/night terminator, and satellites orbiting at actual altitude with ground tracks and footprints. The 3D engine lazy-loads on first use and renders only when something changes, so an idle globe is cheap even on a Pi. No WebGL? The app falls back to the flat map automatically. |

All spot traffic (DX cluster, POTA/SOTA/WWFF/WWBOTA, PSKReporter, WSJT-X) and map overlays render in all three projections. On the globe, zooming in on a satellite swaps its dot for a 3D model — the ISS uses NASA's actual station model; other birds get procedural models matched to their type.

### Basemap styles

Pick the base tiles from the style dropdown on the map: **Dark** (default), **Satellite** (with real polar imagery on the globe), **Modis Truecolor** (NASA GIBS), **Terrain**, **Streets**, **Topo**, **Ocean**, **Hybrid**, **Gray**, **Nat Geo**, and **Countries**.

Two notes:

- **CARTO key (optional).** Dark and Streets default to Esri tiles that need no key. If you liked the original CARTO look (with localized labels), grab a free key at carto.com/basemaps/apikey (5M tiles/month) and paste it in **Settings → Integrations → CARTO Basemap Key**. The key is stored only in your browser and never synced or shared.
- **Map style rotation.** For wall displays, the basemap can cycle automatically through styles you pick, on an interval you set (default 60 s).

Other map controls: zoom, a **map lock** (prevents accidental pan/zoom on touch screens), and a **night darkness** slider that sets how dark the night side is shaded.

### Map layers

Around 29 overlay layers can be toggled from **Settings → Map Layers** (grouped by category, each with an opacity slider) or with the single-key [keyboard shortcuts](#keyboard-shortcuts). All layers except Satellite Tracks default to off.

**Propagation**

| Layer                  | What it shows                                                                  | Key |
| ---------------------- | ------------------------------------------------------------------------------ | --- |
| Gray Line              | Day/night terminator with twilight zones and an enhanced-DX zone               | G   |
| VOACAP Propagation Map | Color-coded HF propagation predictions from your station to the world          | V   |
| MUF Map                | Estimated Maximum Usable Frequency from your station, from live ionosonde data | M   |
| DE/DX Great Circle     | Short-path and long-path great circle between DE and DX                        | D   |
| Reverse Beacon Network | Live RBN spots — "who hears me?" or flip it to "what does this skimmer hear?"  | R   |
| WSPR                   | WSPR propagation paths and signal reports (opt-in)                             | P   |
| IBP Beacons            | NCDXF/IARU International Beacon Project — live deterministic schedule          | —   |
| PSKR Band Activity     | Spot counts per HF band from PSKReporter                                       | B   |

**Amateur radio**

| Layer                       | What it shows                                                       | Key |
| --------------------------- | ------------------------------------------------------------------- | --- |
| Contest QSOs                | Recent QSOs from contest loggers (N1MM/DXLog) as band-colored arcs  | Q   |
| Meshtastic Nodes            | Mesh network nodes from your Meshtastic device                      | —   |
| Worked Grids (next release) | Shades Maidenhead squares you've worked, straight from your logbook | —   |

**Weather / space weather / hazards / geology**

| Layer               | What it shows                                                         | Key |
| ------------------- | --------------------------------------------------------------------- | --- |
| Weather Radar       | NEXRAD precipitation radar (North America)                            | W   |
| Global Clouds (OWM) | Real-time cloud cover (self-hosted only; needs an OpenWeatherMap key) | O   |
| Lightning Activity  | Live lightning strikes worldwide, last 30 minutes                     | L   |
| Aurora Forecast     | NOAA OVATION aurora probability (30-minute forecast)                  | A   |
| D-RAP Absorption    | NOAA D-region absorption prediction — where HF is being eaten         | J   |
| Tornado Warnings    | Active NWS tornado watches/warnings/emergencies (US)                  | T   |
| Wildfires           | Active wildfires worldwide (NASA EONET)                               | F   |
| Floods & Storms     | Active floods and severe storms worldwide (NASA EONET)                | I   |
| Earthquakes         | USGS quakes, M2.5+ in the last 24 hours, with a magnitude filter      | E   |

**Overlays and more**

| Layer               | What it shows                                                                    | Key |
| ------------------- | -------------------------------------------------------------------------------- | --- |
| Satellite Tracks    | Real-time satellite positions with tracks and footprints (on by default)         | S   |
| Maidenhead Grid     | Locator grid — fields at low zoom, squares when zoomed in                        | H   |
| CQ / ITU Zones      | Zone boundaries with zone numbers                                                | Y   |
| City Lights         | NASA VIIRS nighttime city lights                                                 | C   |
| Winlink Gateways    | 4,800+ RMS gateways colored by mode (Pactor, VARA, ARDOP, Packet) with filters   | K   |
| Aircraft            | Live civilian aircraft (adsb.lol), with an optional track-prediction lead time   | X   |
| ATC Sectors         | FIR/ARTCC boundaries with primary frequencies and LiveATC links                  | Z   |
| Active Users        | Other OpenHamClock operators, live (opt out in Settings → Station)               | U   |
| Logged QSOs (N3FJP) | Recently logged QSOs and live entry previews from the N3FJP bridge (self-hosted) | N   |

**Write your own layer:** drop a plugin file into `src/plugins/local/` and it's auto-discovered — no registration, and it survives updates. See `src/plugins/OpenHamClock-Plugin-Guide.md`.

### DE and DX: markers, click-to-set, favorites

- **Your station (DE)** is marked at your configured location. The DE panel shows grid, coordinates, sunrise/sunset, and local weather.
- **Click anywhere on the map** to set the DX target there. The DX panel updates with bearing, distance, grid, sun times, and (optionally) weather; the propagation panels recalculate for the new path.
- **Click any spot** (cluster, POTA, PSK, WSJT-X…) to set that station as the DX target.
- **Type a locator:** click the DX grid display and enter a grid like `JN58sm`.
- **DX Favorites:** star up to 10 DX grids for one-click recall — great for regular skeds.
- **DXCC entity picker:** browse/search the full DXCC list next to the DX grid display.
- If you have a rotator connected, **Shift+click the map** to turn the antenna to that bearing.

### Map Data text view (accessibility)

The **Map Data (text view)** panel renders the map's content as structured, screen-reader-friendly text: DX spots, satellites currently above your horizon, ground activations, lightning, aurora, aircraft, and Winlink gateways. Tab strips throughout the app follow the ARIA tablist pattern (arrow-key navigation), and live announcements fire for new DX spots and lightning. Add the panel from the dockable layout's panel picker.

---

## Keyboard shortcuts

Press **`?`** anywhere to open the shortcuts panel. Shortcuts are ignored while typing in a text field, while a modal is open, or when Ctrl/Alt/Cmd is held. Layer keys are pinned — adding new layers never reshuffles them.

| Key | Action                                   |
| --- | ---------------------------------------- |
| `?` | Toggle the keyboard shortcuts help panel |
| `/` | Toggle DE and DX markers                 |
| Esc | Close the open modal                     |
| A   | Aurora Forecast                          |
| B   | PSKR Band Activity                       |
| C   | City Lights (Night)                      |
| D   | DE/DX Great Circle                       |
| E   | Earthquakes                              |
| F   | Wildfires                                |
| G   | Gray Line                                |
| H   | Maidenhead Grid                          |
| I   | Floods & Storms                          |
| J   | D-RAP Absorption                         |
| K   | Winlink Gateways                         |
| L   | Lightning Activity                       |
| M   | MUF Map                                  |
| N   | Logged QSOs (N3FJP)                      |
| O   | Global Clouds (OWM)                      |
| P   | WSPR                                     |
| Q   | Contest QSOs                             |
| R   | Reverse Beacon Network                   |
| S   | Satellite Tracks                         |
| T   | Tornado Warnings                         |
| U   | Active Users                             |
| V   | VOACAP Propagation Map                   |
| W   | Weather Radar                            |
| X   | Aircraft                                 |
| Y   | CQ / ITU Zones                           |
| Z   | ATC Sectors                              |

The alphabet is fully spoken for, so a few newer layers (Meshtastic Nodes, IBP Beacons, Worked Grids) have no key — toggle those from Settings → Map Layers.

Mouse extras: **Shift+click** the map turns a connected rotator; holding **Ctrl** in Settings → Map Layers reveals per-layer "reset popups" buttons if a draggable legend ever gets lost off-screen.

---

## Panels

In the **Dockable** layout, every panel below can be added from the **+** panel picker, then dragged, tabbed, split, and resized however you like (a lock toggle freezes the arrangement). Other layouts include a curated subset.

### Spots and activity

- **DX Cluster** — live spots with band coloring, filtering, worked/dupe badges, click-to-tune, click-to-listen, and log-from-spot. Detailed below in [DX cluster in depth](#dx-cluster-in-depth).
- **PSK Reporter** — who hears you (**TX** tab) and who you hear (**RX** tab) on digital modes, live via a server-side MQTT proxy with HTTP fallback. Filter by band, mode, retention window (2–15 min), callsign or grid. A gold star ★ marks _mutual_ reception — you hear them and they hear you on the same band, so a QSO is likely. A trash-can button clears all spots.
- **POTA / SOTA / WWFF / WWBOTA** — currently active Parks, Summits, Flora & Fauna, and Bunkers on the Air activators, each with its own marker shape and color on the map (▲ green, ◆ orange, ▼ light green, ■ light purple). QRT and expired spots are filtered automatically. Band/mode/grid filters per panel; SOTA spots include summit name, altitude, and points.
- **CANParks (next release)** — activators in the [CANParks](https://canparks.ca/) Canadian parks program, with the same panel features as its sibling programs (● maple-red map marker, band/mode/grid filters, click-to-tune, log-from-spot, worked-before badges). Spots are enriched server-side from the CANParks park directory, so each spot carries park name, grid, and coordinates; parks that are also POTA references show a muted "POTA CA-xxxx" chip. The program is young — an empty panel just means nobody is on the air from a Canadian park right now.
- **DXpeditions** — active and upcoming DXpeditions (NG3K data) with real operating callsigns, dates, and modes.
- **Contests** — the WA7BNM contest calendar with countdowns and links; active contests highlighted.
- **DX News ticker** — headlines merged from DXNews.com, DX-World, and NG3K, deduplicated over 24 hours, with adjustable text size.

### Propagation and space weather

- **Propagation (VOACAP Chart / Bars)** — per-band reliability between DE and DX, as a 24-hour chart or as bars for right now. Detailed below in [Propagation in depth](#propagation-in-depth).
- **Band Conditions** — N0NBH's band-by-band day/night condition ratings, VHF aurora/E-skip status, and geomagnetic summary.
- **Band Health** — a "what's actually happening" view computed from live DX cluster spot activity per band, with a mode breakdown. Not a model — observed reality.
- **Band Activity (Continent)** — a DX-Heat-style continent × band heatmap of cluster spots over the last 15/30/60 minutes.
- **Band Activity (PSKR)** — spot counts per HF band from PSKReporter.
- **IBP Beacons** — which NCDXF/IARU beacon is transmitting on each of the five beacon bands _right now_ (the schedule is deterministic — no network needed), with countdowns and bearings, plus a listening-log timeline showing which beacons RBN skimmers heard in each 3-minute cycle.
- **Solar (all views, or individual panels)** — cycles through: live solar imagery (SDO with LMSAL and Helioviewer fallbacks), solar indices with 30-day history, GOES X-ray flux (6/12/24/48-hour windows with flare classification), and lunar phase with real NASA Dial-A-Moon imagery plus EME moon pointing data (azimuth/elevation, rise/set, distance).
- **Space Wx Alerts** — recent NOAA SWPC alerts, watches, and warnings with R/S/G severity chips.
- **Meteor Showers** — annual showers for meteor-scatter operators, sorted by proximity to peak, with ZHR and live radiant elevation from your QTH.

### Station and rig

- **DE Location / DX Target** — station info panels: grid, coordinates, sun times, weather (collapsible), and for DX: bearing and distance (handy for aiming a beam).
- **Analog Clock** — a classic clock face with date, sunrise, and sunset. Also available in the Classic layout via `CLASSIC_ANALOG_CLOCK=true`.
- **Ambient Weather** — your own AmbientWeather.net station's live data (appears only when `VITE_AMBIENT_*` keys are configured).
- **Rig Control** — current frequency and mode from your radio via Rig Bridge, with a band plan overlay on the frequency display and PTT status. **(next release)** Set your US license class in Settings → Station and the band plan bar hatches out the ranges outside your privileges (Technician/General/Amateur Extra, per the FCC Part 97 / ARRL band chart); leave it on Other for no restriction display.
- **Frequencies (next release)** — your own named channel list: calling frequencies, repeaters, club nets, whatever you keep going back to. Each entry has a name, frequency, optional mode and notes, and a band chip; with rig control enabled, clicking a row tunes the radio (same click-to-tune path as spots). A "From rig" button grabs the current frequency and mode from a connected rig, and up/down buttons reorder the list. Synced, profiled, and backed up with the rest of your settings.
- **Nets (next release)** — a recurring net schedule you define: name, day (or daily), start time in UTC, optional frequency/mode/duration/notes. The list sorts by next occurrence with a live countdown ("in 2h 14m"), highlights nets that are **ON NOW**, shows each start in your local time, and click-to-tunes when a frequency is set. All the occurrence math is done in UTC, so daylight-saving shifts never move your net.
- **On Air** — a big red ON AIR light driven by your rig's PTT. Point a webcam at it, or don't — it looks great either way.
- **ID Timer** — 10-minute countdown that beeps and pops a reminder to identify; dismissing restarts it.
- **Rotator** — compass rose, live bearing, and controls for a PSTRotator-compatible rotator (self-hosted only).
- **Custom Image** — displays any image you drop in (station photo, QSL card, reference chart).

### Logging

- **Logbook** — the native in-browser logbook. Detailed below in [The logbook](#the-logbook).
- **Awards (next release)** — DXCC, WAZ, WAS, and VUCC progress computed live from the logbook, with per-band detail views and "needed" flags feeding the spot panels.
- **Contest QSOs** — N1MM+/DXLog contacts arrive by UDP and plot as band-colored arcs (see [docs/N1MM-SETUP.md](N1MM-SETUP.md)).
- **N3FJP** — logged QSOs and live entry previews from N3FJP loggers appear on the map; configure host/port in Settings → Integrations (self-hosted).

### EmComm and mesh

- **APRS** — live APRS-IS stations (plus RF-heard stations via a local TNC), with symbol icons, watchlist groups, and messaging.
- **APRS Telemetry** — per-station sensor dashboards with trend sparklines, built from APRS telemetry frames.
- **Meshtastic** — nodes, messages, and network health from a Meshtastic device (direct, MQTT, or server proxy connection).
- **MeshCom** — nodes, messages, and weather/telemetry from a MeshCom LoRa mesh via the rig-bridge UDP plugin.
- **Winlink** — gateway discovery plus a Pat client inbox/outbox and compose, via the rig-bridge Winlink plugin.
- **Digital Modes** — status and control for WSJT-X, JTDX, MSHV, and JS8Call connected through Rig Bridge (halt TX, send free text).

The full EmComm _layout_ is described in [The EmComm layout](#the-emcomm-layout).

### Utility

- **World Map / Map Data (text view)** — the map itself, and its accessible text twin.
- **Callsign Lookup (next release)** — a standalone callbook search box. Type a callsign and get the full card: name, grid, country, coordinates, and distance/bearing from your QTH, via the same lookup path (and QRZ/HamQTH credentials) the callsign popups use. A **Set as DX** button points the DX target at the station, and your last 10 searches stay one click away.
- **Keyboard Shortcuts** — the `?` help, dockable as a permanent panel if you like.

---

## DX cluster in depth

### Sources

On the **hosted site**, spots come from the **OpenHamClock Cluster** — our own cluster node. It aggregates RBN CW/RTTY/FT skimmer spots (collapsed so 40 skimmers hearing one CQ produce one spot), human spots from HamQTH and DX Summit, POTA/SOTA/WWFF/Parks n Peaks activator spots, and spots submitted by OpenHamClock users, all deduplicated across sources. No public DXSpider nodes are scraped. The node also speaks classic telnet on port 7300 if you want to point another program at it.

**Self-hosted installs** choose a source in Settings → Station:

| Source               | What it is                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| DX Spider Proxy ⭐   | Our proxy's persistent telnet feed over HTTP — the recommended default                                                  |
| HamQTH Cluster       | HamQTH's CSV feed — plain HTTP, works everywhere                                                                        |
| DXWatch              | DXWatch cluster feed                                                                                                    |
| Auto                 | Tries sources in order and uses the first that responds                                                                 |
| Custom Telnet Server | Your own cluster node (host/port); logs in with your callsign. Self-hosted only — cloud platforms block outbound telnet |
| UDP Spots            | Listen for UDP spot packets from local apps (e.g. MacLoggerDX); JSON, XML, ADIF, or text                                |

Cluster logins use your callsign with SSID `-56` (`-57` for a second instance; the original HamClock uses `-55`, so they coexist). Spots stay in the list for `SPOT_RETENTION_MINUTES` (default 30).

### Filters

The funnel icon opens the DX Filter Manager. Filters combine with AND:

- **Zones** — continent, CQ zone (1–40), ITU zone (1–90)
- **Bands** — 160m through 70cm, including 60m, 11m, and opt-in 630m/8m/4m support where data exists
- **Modes** — CW, SSB, FT8, FT4, RTTY, PSK, and friends; mode comes from the spot comment when present, otherwise inferred from frequency against the band plan
- **Text** — search spot comments for keywords (TEST, SKCC, POTA…) with OR logic
- **Watchlist / Exclude** — always-show and never-show callsign lists
- **Contest / DXpeditions** — a contest filter and a one-click "show only DXpeditions" toggle cross-referenced against the DXpedition list

All filter state persists in your browser.

### What you can do with a spot

- **Click** it — sets the station as your DX target and highlights the path on the map.
- **Tune** — with click-to-tune enabled and Rig Bridge running, your radio jumps to the frequency and the right mode (Yaesu rigs even get a proper band-select so antenna/ATU memories follow).
- **🎧 Listen** — no radio handy? The listen button opens a web SDR _already tuned_ to the spot. OpenHamClock picks the nearest live KiwiSDR with a free slot whose coverage includes the frequency, falling back to a curated list of long-running receivers, and finally to the KiwiSDR directory. Also available from callsign popups.
- **📓+ Log it** — opens the Logbook's new-QSO form prefilled from the spot.
- **Callsign popup** — click a callsign anywhere for a station card: name, QTH with the DX end's local time, country, and a jump to your preferred callbook (QRZ.com, HamQTH, or QRZCQ — pick in Settings → Station).
- **Send a spot** — spot a station yourself directly from the panel header; it goes out through the OHC cluster.

### Worked-before badges

Spots are cross-referenced against your QSOs (native logbook + N3FJP + N1MM feeds):

- **DUPE** — you've worked this call on this band and mode. Contesters, skip it.
- **WORKED** — the call is in your log, but not on this band+mode. Still worth a QSO.
- No badge — not in your log. Implicitly, a new one.

Portable prefixes are normalized (`5Z4/OZ6ABL` matches `OZ6ABL`) and phone/digital submodes are collapsed sensibly (USB/LSB → SSB, PSK31/63 → PSK).

---

## The logbook

The Logbook panel is a native, no-account-needed log.

**Where your QSOs live — read this bit.** The log is stored in **your browser's IndexedDB**, on your machine. It comfortably handles 10k+ contacts and survives reloads and restarts — but it does **not** sync between browsers, devices, or the hosted site vs. a self-hosted install, and clearing the browser's site data deletes it. **Export ADIF regularly as your backup.** Private/incognito windows fall back to in-memory storage that vanishes when the window closes.

What it does:

- **Log a QSO** with the **+QSO** form — UTC date/time default to now, and frequency/mode prefill from your rig when Rig Bridge is connected.
- **Log from a spot** — the 📓+ button on any DX cluster or activation spot opens the form prefilled with call, frequency, mode, and grid.
- **ADIF import** — bring in your existing log (`.adi`/`.adif`); duplicates are detected and skipped.
- **ADIF export** — your whole log as a standard `.adi` file, any time. This is your backup and your bridge to LoTW/QRZ/other loggers.
- **Worked-before everywhere** — the log feeds the DUPE/WORKED badges on spots, and (next release) the Awards panel (DXCC/WAZ/WAS/VUCC) and the Worked Grids map layer.
- **Full backup** (next release) — one JSON file with every QSO _and_ all your settings, from **Settings → Profiles → Full Backup** (details below). Once your log tops 50 QSOs, the panel shows a small dismissable reminder when your last backup is more than a month old — **Back up now** downloads the file on the spot.

QSO records are ADIF-aligned internally (band, mode, RST, grids, power, plus arbitrary extra ADIF fields), so round-trips through other software are clean.

---

## Propagation in depth

### The engines

OpenHamClock runs **real ITU-R P.533-14 predictions** — the same physics as VOACAP-class tools — and it's honest about which engine produced what you're seeing (look for the engine badge in the panel header):

1. **WASM (the good one).** ITURHFProp v14.3 compiled to WebAssembly runs _in your browser_. Coefficient tables (~11 MB per month) download lazily and cache in IndexedDB. This is the steady state on the hosted site and on builds that include the WASM bundle.
2. **REST.** The ITURHFProp microservice, if the WASM engine can't run.
3. **EST (heuristic).** A rough model from SFI/Kp/path geometry, shown only as a last resort and clearly badged.

Digital modes are predicted at their true decode thresholds (FT8 −19 dB, FT4 −15, WSPR −26, JT65 −23, CW +5 vs a 3 kHz reference), so an SSB-dead path can honestly show 67% for FT8. Set your operating mode and TX power in **Settings → Station** (presets 5/25/100/1500 W, or a custom 0.1–2000 W in the panel), plus an antenna profile.

Real-time corrections come from ionosonde data via KC2G/GIRO — measured ionosphere, not just modeled.

### The views

- **VOACAP Chart** — 24-hour per-band reliability for the DE→DX path, with your actual local sunrise/sunset marked.
- **VOACAP Bars** — the same, for right now.
- **VOACAP Propagation Map** (layer, key V) — reliability from your QTH to everywhere, as a world heatmap.
- **MUF Map** (layer, key M) — maximum usable frequency contours from live ionosonde data.
- Panels can **auto-rotate** views on a timer (5–60 s) for kiosk displays.

Data acknowledgement: ionosonde data from prop.kc2g.com originates from the [Global Ionospheric Radio Observatory](https://giro.uml.edu) and its worldwide network of contributing stations.

---

## Satellites

The Satellite Tracks layer (key **S**, on by default) tracks amateur satellites with SGP4 orbital mechanics computed in your browser.

- **Element sets** are fetched server-side from **CelesTrak**, **AMSAT**, and **SatNOGS** (each individually disableable in `.env`), with **Space-Track** available as the primary source if you add credentials. Multi-source failover means a rate-limited upstream doesn't blank your sky.
- **Pick your birds** in **Settings → Satellites**: search, select, Select All/Clear. Only selected satellites are computed — a real CPU saver on a Pi. Set your **station altitude** and **minimum elevation** (default 5°) for pass math.
- **Track duration** is configurable — the slider draws ±15 to ±120 minutes of orbit (default 45), and footprint circles can be toggled.
- **Click a satellite** for its info window: position, altitude, and when it's visible from your QTH — range, range rate (negative = approaching), and **doppler factor** (multiply your uplink/downlink by it to correct for motion), plus **next-pass countdowns** and a pass-prediction modal. The window minimizes to a compact icon.
- **On the 3D globe**, satellites orbit at true altitude with ground tracks and footprint rings; zooming in swaps dots for 3D models (real ISS model, procedural archetypes for the rest).

The tracked-satellite list is actively audited — dead and decayed birds get removed, new active ones added — so the catalog reflects what's actually usable.

---

## Rig control and Rig Bridge

**Rig Bridge** is a small helper program that runs on the computer near your radio and translates between OpenHamClock and your hardware. Once it's running: click a spot, your radio tunes.

- **What needs it:** anything that touches hardware — rig CAT control, PTT/On-Air, APRS via a local TNC, rotator, MeshCom UDP, Winlink/Pat. The browser can't open serial ports; the bridge can.
- **What doesn't:** everything else in OpenHamClock works without it, hosted or self-hosted.

**Setup:** Settings → **Rig Bridge** tab → enable, download for your OS (Windows/Mac/Linux — requires Node.js and git), run it, and configure your radio in its local setup UI (default `http://localhost:5555`). Read [rig-bridge/README.md](../rig-bridge/README.md) first — it covers every radio and plugin in detail.

**Plugins at a glance:**

- **Radio:** Yaesu, Kenwood, Icom over USB; rigctld, flrig, TCI (Thetis/ExpertSDR), FlexRadio SmartSDR, RTL-TCP (RX-only)
- **Digital modes:** WSJT-X, JTDX, MSHV, JS8Call — bidirectional (reply to a decode, halt TX, set free text)
- **Packet:** APRS TNC (KISS/Direwolf), Winlink (Pat client)
- **Hardware:** Rotator (rotctld)
- **Cloud:** Cloud Relay

**Cloud Relay (alpha):** using the hosted site or a cloud install? The relay connects your local rig-bridge to the server with a per-session token, enabling click-to-tune, PTT status, WSJT-X decodes, and APRS from anywhere. Connect it from Settings → Rig Bridge; the session credential lives only in your browser.

**Click-to-tune behavior:** works from DX cluster, POTA/SOTA/WWFF/WWBOTA (and CANParks, next release), PSK Reporter, and WSJT-X panels. "Auto-set mode" switches CW/SSB/Data from the band plan; Yaesu rigs get true band-select commands so ATU and antenna memories follow. **(next release)** With a US license class set in Settings → Station, tuning outside your privileges still tunes but shows a brief warning toast (e.g. "28.6 MHz SSB is outside Technician privileges").

(The older _Rig Listener_ and _WSJT-X Relay_ standalone tools still exist but are deprecated — Rig Bridge replaces all of them.)

---

## WSJT-X and digital modes

Decodes from WSJT-X, JTDX, or anything speaking the same UDP protocol appear live in the WSJT-X panel and on the map (when grids are known), including a WSPR sub-tab with SNR, drift, and power.

- **Same machine:** WSJT-X → Settings → Reporting → UDP Server → `127.0.0.1:2237`. Done (`WSJTX_ENABLED=true` is the default).
- **Another machine on your LAN:** set `HOST=0.0.0.0` in OpenHamClock's `.env` and point WSJT-X at that machine's IP, port 2237.
- **Multicast:** running several UDP listeners (GridTracker etc.)? Set `WSJTX_MULTICAST_ADDRESS` to match WSJT-X (e.g. `224.0.0.1`) — everyone shares the stream.
- **Cloud/hosted:** UDP can't cross the internet; use the Rig Bridge WSJT-X plugin (or the legacy relay agent with `WSJTX_RELAY_KEY`) to forward decodes over HTTPS, tied to your browser session.

Selecting a callsign in WSJT-X can auto-set your DX target, and clicking a decode tunes the rig to the correct dial frequency. PSKReporter integration is separate and automatic — see the PSK Reporter panel.

---

## The EmComm layout

A purpose-built dashboard for ARES/RACES/SKYWARN and served-agency work (Settings → Display → Layout → **EmComm**). Design principle: **local-first** — with a local TNC, the core functions work over RF alone when the internet is down.

- **Map:** range rings at 50/100/200 km, NWS alert polygons by severity, shelter markers, EmComm APRS stations, and an APRS source toggle (All / RF Only / Internet Only).
- **Panels:** Resource Summary (aggregated resource dashboard), NWS Alerts, FEMA Disaster Declarations, Nearby Shelters (with capacity, ♿ and 🐾 indicators — including shelter reports heard over RF), EmComm Stations, and a live Net Roster.
- **Net operations:** check in by APRS message (`CQ NETNAME <status>` to `EMCOMM`), check out with `U NETNAME`, or use the manual check-in API; the roster tracks status, last-heard, and resources.
- **Messaging:** point-to-point APRS messages (67 chars) from the roster's MSG button, sent via your local TNC.
- **Resource tokens:** structured data in APRS beacon comments — `[Beds 30/100][Power OK][Water -50]` — parsed into capacity bars, need flags, and the aggregate dashboard. Any `[Key Value]` works; built-ins include Beds, Water, Food, Power, Fuel, Med, Staff, Evac, Comms, Gen.
- **Telemetry:** APRS telemetry frames become per-station sensor dashboards with trend sparklines.
- **Winlink:** the gateway map layer and panel, plus Pat client messaging through rig-bridge.

Deep dive: [docs/emcomm-roadmap.md](emcomm-roadmap.md).

---

## Alerts and notifications

**Settings → Alerts** plays a tone when new items appear in a feed. Feeds: POTA, SOTA, WWFF, WWBOTA, CANParks (next release), DX Cluster, DXpeditions, Contests, Lightning Proximity, and Space Weather — all off by default, each with its own tone (nine Web Audio presets — no sound files) and a master volume.

Sensible guardrails: no alert storm on page load or when returning to a background tab, a per-feed cooldown, and one tone per batch of new items.

**Browser notifications (next release):** each feed also gets a 🔔 toggle to show an OS-level notification alongside the tone — delivered through the service worker, so they work while the tab is backgrounded. Grant permission with the master button at the top of the Alerts tab.

**Push with the browser closed (next release):** the **Push (Closed Browser) — Space Weather** card in Settings → Alerts subscribes your browser to true Web Push. In this first version it covers one thing, broadcast to everyone subscribed: **severe space weather alerts** — NOAA scale **2 or higher** (G2/S2/R2 and up), the same threshold as the in-app severe-alert feed. A **Send test** button verifies the whole path end-to-end. Notes:

- Works on the hosted site out of the box. Push requires HTTPS and a service worker, so plain-http LAN installs can't use it (same browser rule as offline mode).
- **Self-hosters:** the feature is dormant until you configure VAPID keys — run `npx web-push generate-vapid-keys` once and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a `mailto:` contact) in your `.env` (see `.env.example`). Without keys, the card simply shows push as unavailable and nothing else changes.
- Per-feed/per-watchlist push (your spots, your callsign) needs server-side evaluation and is planned as a later phase.

---

## Offline mode (PWA)

OpenHamClock is an installable PWA with a real offline mode **(next release)**:

- After one online visit, the app shell and assets are cached. Offline, the app loads and panels show their **last-known data** (API responses are cached network-first). Live streams obviously need a connection.
- When a new version deploys, the fresh worker installs in the background and a small **"Update ready — Reload"** toast appears. Click it and you're on the new version — no more mid-session forced reloads.
- **Limitations:** service workers require a secure context. On the hosted site (HTTPS) and `localhost` everything works; a self-hosted install reached over **plain http on a LAN IP** silently skips offline mode (that's a browser rule, not ours). The Electron app updates via its installer instead.
- **Escape hatch:** load the app with **`?nosw`** in the URL (e.g. `https://openhamclock.com/?nosw`) to unregister the worker and clear its caches — handy if a bad cache ever wedges things. Remove the parameter and reload to re-register.

Separately from the PWA, the app polls the server version and — on the hosted site — reloads automatically when a new release lands.

---

## Layouts, themes, and profiles

### Layouts (Settings → Display)

| Layout       | Best for                                                                            |
| ------------ | ----------------------------------------------------------------------------------- |
| **Modern**   | Widescreen monitors — responsive 3-column grid around the map                       |
| **Classic**  | Dedicated displays and Pi kiosks — the original HamClock look, refreshed            |
| **Tablet**   | 7–10" widescreen displays (16:9)                                                    |
| **Compact**  | 4:3 and smaller screens — data-first                                                |
| **Dockable** | Power users — every panel draggable, tabbable, resizable; layout lock; reset button |
| **EmComm**   | Emergency communications operations (beta)                                          |

### Themes (Settings → Display)

**Dark** (default), **Light**, **Legacy** (green CRT terminal), **Retro** (90s Windows), and **Custom** — a full editor for backgrounds, text, borders, map ocean, and every accent color. You can also pick the monospace font used for callsigns and frequencies (JetBrains Mono, Fira Code, IBM Plex Mono — the latter two with slashed zeros).

Display extras: header size slider, local-time-first clock swap, mutual-reception star toggle, a **Display Schedule** (sleep/wake times for shack TVs, with an option to keep the HDMI signal alive), **Keep Awake** wake-lock, and **Low Memory Mode** for machines under 8 GB.

### Profiles (Settings → Profiles)

A profile captures _everything_ — callsign, location, theme, layout, dock arrangement, map layers, filters, satellite selection, propagation preferences, units. Save under a name, **Load** to switch (page reloads), **Update** to overwrite, **Export/Import** as JSON to move between devices or operators. Perfect for shared shacks and contest-vs-everyday setups.

**Share codes** (next release). Every saved profile also gets a 🔗 **Copy share code** button — the whole profile packed into a single `OHC1:…` string you can paste into an email, a group chat, or a forum post. The receiving side pastes it into **Import from Share Code** on the same tab and gets your layout as a new named profile. Codes are compressed and decoded entirely in the browser; nothing is uploaded anywhere.

**Full Backup** (next release). The answer to "the logbook lives only in this browser": **Export Full Backup** downloads one `ohc-backup-YYYYMMDD-HHMMSS.json` containing every settings key, all saved profiles, _and_ your entire logbook. **Restore from Backup** reads such a file on a new machine (or after a browser wipe): settings are overwritten, QSOs are merged into the existing log with duplicates skipped, and you get a summary of what was restored. Callbook logins (QRZ/HamQTH) and API keys are deliberately **not** included in backup files — they stay private to each browser, so re-enter them after a restore. The tab also shows when this browser last exported a backup.

---

## Languages

The interface ships in **16 languages**: English, Français, Español, Català, Deutsch, Nederlands, Italiano, Português, 日本語, ქართული, 한국어, Melayu, Русский, Slovenščina, ไทย, and 简体中文. Pick yours in Settings → Station. Map tile labels follow your chosen language where the tile provider supports it.

Want to add or improve one? See the [translation guide in CONTRIBUTING.md](../CONTRIBUTING.md#translations) — partial translations are welcome.

---

## Settings reference

A quick map of where things live (⚙ Settings, via the gear or your callsign):

| Tab                 | What's in it                                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📻 **Station**      | Callsign, grid/lat-lon (with "use my location"), timezone, units (distance/temperature/pressure), language, DX cluster source, callbook picker, propagation mode & TX power, performance mode, wake lock & display schedule, Active Users opt-out, legacy rig control |
| 🔌 **Integrations** | CARTO basemap key, QRZ.com and HamQTH callbook credentials, and local-only extras: Rotator, DX Weather popups, N3FJP bridge                                                                                                                                           |
| 🎨 **Display**      | Layout, theme (+ custom theme editor), monospace font, header size, clock order, What's New on startup, mutual-reception star                                                                                                                                         |
| 🗺️ **Map Layers**   | Every overlay layer with enable + opacity, grouped by category; DE/DX markers, DX Target panel, and DX News ticker toggles                                                                                                                                            |
| 🛰️ **Satellites**   | Satellite selection, tracks/footprints, station altitude, minimum elevation, track duration                                                                                                                                                                           |
| 👤 **Profiles**     | Save/load/rename/export/import named profiles; profile share codes and full backup/restore (next release); Open-Meteo API key; export current state                                                                                                                   |
| 🌐 **Community**    | GitHub, Facebook group, Reddit; core maintainers and the contributors wall; the privacy statement (no cookies, no tracking, anonymized stats)                                                                                                                         |
| 🔔 **Alerts**       | Per-feed audio alerts, tones, master volume, browser notifications (next release)                                                                                                                                                                                     |
| 📻 **Rig Bridge**   | Enable/connect, downloads for each OS, API token, click-to-tune and auto-mode, plugin overview, Cloud Relay                                                                                                                                                           |

Settings save to your browser; **Save Settings** applies them. Most `.env` variables mirror a Settings option — the browser value wins.

---

## Hosted site vs self-hosted

Both run the same code; the differences come down to hardware access and being a good neighbor on a shared server:

| Capability                                                    | openhamclock.com (hosted)                               | Self-hosted                                  |
| ------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| All panels, layers, propagation, logbook                      | ✅                                                      | ✅                                           |
| DX cluster source                                             | OpenHamClock Cluster (locked)                           | Your choice, including custom telnet and UDP |
| Rig control                                                   | ✅ via Rig Bridge + Cloud Relay                         | ✅ via Rig Bridge directly                   |
| WSJT-X decodes                                                | ✅ via Rig Bridge / relay agent                         | ✅ direct UDP                                |
| Rotator, N3FJP bridge, DX weather popups, Global Clouds layer | ❌ (local-only)                                         | ✅                                           |
| Callbook credentials (QRZ/HamQTH)                             | Per-user, verified then stored **in your browser only** | Server-wide via Settings or `.env`           |
| Settings sync across devices                                  | ❌ (use profile export)                                 | ✅ optional `SETTINGS_SYNC=true`             |
| APRS-IS feed                                                  | Shared server connection                                | Your own connection, your own filter         |

Local-install detection is automatic (localhost, LAN IPs, `.local`/`.lan` hostnames); a self-hosted server can force it with `SERVERLOCAL=true` — useful behind a reverse proxy with a public domain name.

---

_Something missing or wrong? Documentation PRs are welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md#documentation). 73!_
