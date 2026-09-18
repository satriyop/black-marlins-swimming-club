# Globiesoft Spectra SwimPro public API inventory (2026-09-17)

Base observed in the deployed bundle: `https://157.245.61.1/rlist_off/php/` (the bundle also contains an earlier `http://globiesoft.com/rlist_off/php/` assignment). All captures below used the HTTPS IP base with browser-like `Referer` and 1.1 s pauses.

| URL pattern | Purpose | Sample response keys |
|---|---|---|
| `events_list.php?csearch={query}&page={n}` | Public event directory search/pagination | none: `[]` for all requested page-1 queries |
| `athlete.php?csearch={query}&page={n}` | Public athlete directory search/pagination | none: `[]` for all requested page-1 queries |
| `events_select.php?cselect={meet}` | Meet selection/detail metadata | none: `[]` for `WALKOTMGL2026` |
| `events_eventno.php?csearch={q}&cevent={meet}&page={n}` | Meet event/order listing | none: `[]` in probe |
| `events_meetprogram_acara.php?cmeet={meet}&ceventno={eventno}` | Meet program/event detail | none: `[]` in probe |
| `events_meetprogram_proses.php?cmeet={meet}&ceventno={eventno}` | Meet-program processing/status | `proses` |
| `events_meetprogram_estafet.php?cmeet={meet}&cid={id}&cnomorkode={code}&csistem={system}` | Relay meet-program athlete slots | `atlet1`, `atlet2`, `atlet3`, `atlet4` |
| `events_meetprogram_rekor.php?...` | Meet-program records | none: `[]` in probe |
| `events_medaltally_report.php?cmeet={meet}&cteam={team}` | Medal tally | none: `[]` in probe |
| `report_orderofevents_preview.php?cmeet={meet}&clanguage={lang}` | Order of events report | none: `[]` in probe |
| `report_schedule_preview.php?cmeet={meet}` | Schedule report | none: `[]` in probe |
| `report_bestswimmer_preview.php?cmeet={meet}` | Best swimmer report | none: `[]` in probe |
| `report_newrecordlist_preview.php?cmeet={meet}` | New-record report | none: `[]` in probe |
| `events_resultbyevent.php?csearch={q}&cevent={meet}&page={n}` | Results by event | none: `[]` in probe |
| `events_resultbyevent2.php?csearch={q}&cevent={meet}&ceventno={eventno}&ckelumur={age}&page={n}` | Results by event/age group | none: `[]` in probe |
| `events_resultbyevent2uno.php?...` | Results by event/age group (uno variant) | none: `[]` in probe |
| `events_resultbyeventuno.php?csearch={q}&cevent={meet}&page={n}` | Results by event (uno variant) | none: `[]` in probe |
| `events_resultbyname.php?csearch={q}&cevent={meet}&page={n}` | Results by athlete name | none: `[]` in probe |
| `events_resultbyname2.php?csearch={q}&cevent={meet}&cid={id}&page={n}` | Results by name/athlete | none: `[]` in probe |
| `events_resultbyname2uno.php?...` | Results by name/athlete (uno variant) | none: `[]` in probe |
| `events_resultbynameuno.php?csearch={q}&cevent={meet}&page={n}` | Results by name (uno variant) | none: `[]` in probe |
| `events_resultdetail.php?event={event}&id={id}&nomorkode={code}&sistem={system}` | Single result detail | none: `[]` in probe |
| `events_results_acara.php?cmeet={meet}&ceventno={eventno}` | Results event/session detail | none: `[]` in probe |
| `events_results_rekor.php?cmeet={meet}&cnomorkode={code}&ckelumur={age}&cnote={note}` | Result records | none: `[]` in probe |
| `events_results_individual.php?cmeet={meet}&cid={id}&cnomorkode={code}&cprelim={prelim}&cnote={note}` | Individual result save/load detail | none: `[]` in probe |
| `events_results_estafet.php?cmeet={meet}&cid={id}&cnomorkode={code}&cprelim={prelim}&cnote={note}` | Relay result detail | none: `[]` in probe |
| `events_results_report.php?cmeet={meet}&ceventno={eventno}` | Results report | none: `[]` in probe |
| `athlete_time.php?cid={id}&cprovince={province}` | Athlete best-time/PB view | none: `[]` with no athlete id |
| `athlete_time2.php?cid={id}&cprovince={province}&page={n}` | Athlete time/history pagination | none: `[]` with no athlete id |
| `athlete_progress.php?datakind={kind}&nomorkode={code}&note={note}&id={id}` | Athlete progress/history | none: `[]` with no athlete id |
| `report_besttime_athlete.php?csearch={q}&cas={as}&cteam={team}&page={n}` | Best-time athlete search/report | `id`, `nama`, `lahir`, `sex`, `club` (placeholder row with empty id) |
| `report_eventhistory_athlete.php?csearch={q}&cas={as}&cteam={team}&page={n}` | Athlete event-history search/report | `id`, `nama`, `lahir`, `sex`, `club` (placeholder row with empty id) |

## Capture notes

* The requested event-directory queries were `empty`, `h`, `a`, `Jateng`, `Klaten`, and `2026`; all returned HTTP 200 `[]`.
* The requested athlete-directory queries were `h`, `Pamungkas`, `Athaya`, `Kinara`, `Bumi`, `Banyu`, and `Klaten`; all returned HTTP 200 `[]`.
* `WALKOTMGL2026` probes returned HTTP 200 `[]` for meet metadata, medal tally, order-of-events, schedule, best-swimmer, new-record, and all results endpoints tested. The only non-empty JSON responses were `events_meetprogram_proses` (`{"proses":"NO"}`), `events_meetprogram_estafet` (four empty relay-slot labels), and the two report search endpoints (one placeholder row with empty `id`).
* Because the athlete directory returned no rows, no athlete id was available for a valid PB/history request; no Pamungkas/BMSC athlete was found.
