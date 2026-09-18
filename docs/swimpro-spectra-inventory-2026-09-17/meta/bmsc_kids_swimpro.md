# BMSC kids ↔ SwimPro (2026-09-17)

| BMSC name | SwimPro id | Year / sex | Reg |
|---|---:|---|---|
| Ken Athaya Nirwasita | 43721 | 2012 WOMEN | 20250700620 |
| Luigi Banyu Pamungkas | 43720 | 2014 MEN | 20250700629 |
| Kun Bumi Pamungkas | 43794 | 2014 MEN | 20250800004 |

All: BLACK MARLINS SWIMMING CLUB KLATEN / Kab. Klaten / Jawa Tengah.

## Personal Time (confirmed live sample)
Endpoint: `athlete_time.php?cid={id}&cprovince=JAWA%20TENGAH`  
(NOT empty-province / not NATIONAL for this athlete — those returned [].)

Sample file: `athlete_history/43720_luigi_athlete_time_JAWA_TENGAH.json` (9 rows).

Keys: `kode`, `awal`, `nomorkode`, `nomordescr`, `jenis`, `note`, `hasil`, `pakaidata`

`nomordescr` pattern: `{N} M {STROKE} {SEX}, {LCM|SCM}`  
`hasil` pattern: `HH:MM.SS` or `MM:SS.SS` (here always `MM:SS.SS` with leading zeros)  
`awal` display date: `DD MONTH YYYY` (not ISO)

## Progress History (confirmed)
Endpoint: `athlete_progress.php?datakind=PROVINCE&nomorkode={eventCode}&note=&id={cid}`
Sample: `athlete_history/43720_luigi_athlete_progress_PROVINCE_A07.json` (6 rows for A07 / 200 free).

Keys: `kode`, `pakaidata`, `kelumur`, `hasil`, `progress`

- `progress`: seconds delta vs previous (positive = faster/improvement in UI green; negative = slower)
- `kelumur`: age group label at that meet (GROUP 3/4, SD, …)
- Scoped by `nomorkode` from a Personal Time row — not a full history dump of all events
