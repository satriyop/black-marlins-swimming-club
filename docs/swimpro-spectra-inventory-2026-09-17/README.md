# Spectra SwimPro (Globiesoft) inventory — 2026-09-17

Public API field maps and samples for BMSC ↔ SwimPro sync planning.

**Source UI:** `https://globiesoft.com/rlist_off/`  
**API base:** `https://globiesoft.com/rlist_off/php/`  
**Note:** Datacenter/`curl` and some box browsers often get `[]`. Confirmed payloads came from Satriyo’s laptop Chrome DevTools.

## Status: inventory complete

| Area | Endpoint | Sample |
|------|----------|--------|
| Meet list | `events_list.php` | `directory/events_list_satriyo_laptop_2026-09-17.json` |
| Meet header | `events_select.php` | `meet_detail/events_select_WALKOTMGL2026_satriyo.json` |
| Athlete search | `athlete.php` | BMSC kids in `meta/bmsc_kids_swimpro.md` |
| Personal Time (guardian sync) | `athlete_time.php?cid=&cprovince=JAWA%20TENGAH` | `athlete_history/43720_luigi_athlete_time_JAWA_TENGAH.json` |
| Progress (charts) | `athlete_progress.php` | `athlete_history/43720_luigi_athlete_progress_PROVINCE_A07.json` |
| Meet event catalog | `events_resultbyevent.php` | `results/events_resultbyevent_KRAPPROVBYL2026_p1.json` |
| Heat/result lines (admin placings) | `events_resultbyevent2.php` | `results/events_resultbyevent2_KRAPPROVBYL2026_108_GROUP2_p1.json` |

## Layout

- `meta/` — endpoint maps, kids id map, plan notes
- `design/SYNC_PRODUCT_DRAFT.md` — product draft (data model, flows, UI)
- `directory/` — meet/athlete list dumps
- `meet_detail/` — meet select / program probes
- `athlete_history/` — Personal Time + Progress samples
- `results/` — Result Viewer catalog + heat lines
- Screenshots (png/webp) — UI context only

## Sync lanes (locked)

1. **Guardian:** Personal Time → results (`hasil` → `time_ms`; parse `nomordescr`)
2. **Admin meets:** `events_list` with SWIMMING + Jateng heuristics → `meets.swimpro_kode`
3. **Admin placings:** catalog (`resultbyevent`) → loop `resultbyevent2` per `kode`+`kelumur`
4. **Link-on-add:** match `athlete.php` by short name; store `swimpro_id`; re-sync with override warnings

No production sync code in this folder — docs only.
