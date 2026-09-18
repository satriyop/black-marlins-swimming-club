
## Hostname-only continuation (2026-09-17)
- Base used: `https://globiesoft.com/rlist_off/`; API base used: `https://globiesoft.com/rlist_off/php/`.
- `events_list.php?csearch=POP&page=1` returned 13 non-empty closed meets; saved as `directory/events_list_finished_qPOP_p1.json`.
- Closed meet codes observed include `POPDAJATENG2026`, `POPDAKALTIM2025`, `POPNAS2025`, `POPDAJABAR2025`, `POPDAJTGSMA2025`, `POPDASDJATENG2025`, `POPDAJATIM2024`, `POPDAJTG2024`, `POPDAJATENG2024`, `POPNAS2023`, `POPDAJATENG2023`, `POPDAJATENG2022`, `POPDASMG2022`.
- Hostname result probes such as `events_resultbyevent.php?csearch=&cevent=POPDAJATENG2026&page=1` and `...cevent=POPDAJATIM2024...` returned `[]`; no non-empty results payload was available to save. Prior hostname meet-program captures remain `meet_detail/events_meetprogram_proses_WALKOTMGL2026.json` (top-level `proses`) and `meet_detail/events_meetprogram_estafet_WALKOTMGL2026.json` (top-level `atlet1`, `atlet2`, `atlet3`, `atlet4`), but they contain no meet results.
- Athlete searches for `Ken Athaya Nirwasita`, `Kun Bumi Pamungkas`, and `Luigi Banyu Pamungkas` could not produce a non-empty hostname `athlete.php` response; requests remained pending/timeouts. Hostname `report_besttime_athlete.php?csearch=Pamungkas&cas=&cteam=&page=1` returned only a placeholder row with keys `id`, `nama`, `lahir`, `sex`, `club`, all empty; no real PB/time fields found.
- Results/PB status: **not found on hostname**; no athlete IDs identified.

## Confirmed via Satriyo laptop DevTools (2026-09-17)

Base: `https://globiesoft.com/rlist_off/php/` (box/datacenter curl often `[]`; laptop paste is source of truth).

| Endpoint | Purpose | Confirmed keys | Sample |
|---|---|---|---|
| `events_list.php` | Meet directory | kode, nama, awal, akhir, periode, tempat, lokasi, status, pakaidata, sport, register | `directory/events_list_satriyo_laptop_2026-09-17.json` |
| `events_select.php?cselect=` | Meet header | + meetprogram, language | `meet_detail/events_select_WALKOTMGL2026_satriyo.json` |
| `athlete.php` | Athlete search | id, nama, nik, lahir, sex, jenis, sekolah, club, pengcab, pengprov, negara, regstatus | BMSC kids 43720/43721/43794 |
| `athlete_time.php?cid=&cprovince=JAWA%20TENGAH` | Personal Time (guardian sync) | kode, awal, nomorkode, nomordescr, jenis, note, hasil, pakaidata | `athlete_history/43720_luigi_athlete_time_JAWA_TENGAH.json` |
| `athlete_progress.php` | Progress charts | kode, pakaidata, kelumur, hasil, progress | `athlete_history/43720_luigi_athlete_progress_PROVINCE_A07.json` |
| `events_resultbyevent.php` | Meet event catalog (slots) | kode, nomorkode, nomordescr, jenis, kelumur | `results/events_resultbyevent_KRAPPROVBYL2026_p1.json` |
| `events_resultbyevent2.php?cevent=&ceventno=&ckelumur=` | Heat/result lines (admin placings) | id, nama, lahir, sex, club, kode, nomorkode, nomordescr, jenis, kelumur, hasilfinal, urut3, juara, seri3, lin3, … | `results/events_resultbyevent2_KRAPPROVBYL2026_108_GROUP2_p1.json` |

Inventory status: **complete** for guardian Personal Time sync + admin meet import (catalog → resultbyevent2 loop).
