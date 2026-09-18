# BMSC ↔ SwimPro sync — product draft (locked from inventory)

## Goals
- Guardians: no manual official race times when SwimPro Personal Time has them
- Admins: no manual meet entry when SwimPro events_list has the meet
- Add swimmer: match SwimPro by short name; link id; allow manual override
- Re-sync: warn which fields/rows will be overridden before write

## Inventory sources that work
- events_list / events_select on globiesoft.com (Chrome; sometimes)
- Athlete card + Personal Time + Event History + Personal Rank in **user browser** (no login)
- Flutter decoder for Personal Time keys
- Box/laptop curl and box Chrome often get `[]` for athlete/time APIs — production sync needs reliable egress (user network or partner API)

## Confirmed ids
| Kid | SwimPro id | Reg |
|-----|------------|-----|
| Ken Athaya Nirwasita | 43721 | 20250700620 |
| Luigi Banyu Pamungkas | 43720 | 20250700629 |
| Kun Bumi Pamungkas | 43794 | 20250800004 |

## Admin placings (locked)
- Catalog: `events_resultbyevent.php?cevent={meet}&page=`
- Lines: `events_resultbyevent2.php?cevent={meet}&ceventno={kode}&ckelumur={GROUP}&page=`
- Map `hasilfinal` → time; `juara` place (`1000` = no medal); `id` = SwimPro athlete id

## Data model (BMSC)
- `swimmers.swimpro_id` text unique nullable
- `swimmers.swimpro_reg` optional (e.g. 20250700629)
- `meets.swimpro_kode` text unique nullable
- `results.source` enum swimpro|manual; `synced_at`; optional `swimpro_nomorkode`
- Field/row provenance: manual edits protected until override confirmed

## Personal Time → results
| SwimPro | BMSC |
|---------|------|
| cid / swimpro_id | swimmers.swimpro_id |
| kode | meets.swimpro_kode (upsert meet stub if missing) |
| awal | result_date |
| nomordescr / note | parse distance, stroke, sex, course (LCM→50, SCM→25) |
| hasil | time_ms |
| pakaidata | region metadata / notes |
| jenis | module/course hint |

## Events → meets
| SwimPro | BMSC |
|---------|------|
| kode | swimpro_kode |
| nama | name |
| awal/akhir | start/end |
| tempat/lokasi | city/venue |
| status CLOSED/REGISTRATION | status / registration_state |
| pakaidata | region filter (JAWA TENGAH) |
| sport | must be SWIMMING |

## Flows
1. Add perenang → Cari di SwimPro (short name) → pick match → preview → create+link
2. Admin → Impor kejuaraan → filter SWIMMING + Jateng → staging → approve
3. Profile → Sync Personal Time → staging rows → confirm
4. Sync lagi → diff (before/after per field/row) → confirm overrides

## UI
- Match picker: nama, year/sex, club, pengprov, id
- Badge: SwimPro #id · last sync
- Override sheet: list changing fields/times; confirm
- /event: Impor dari SwimPro

## Non-invasive
- Pull only linked ids + managed meet kodes; polite cadence; cache raw JSON; identifiable UA
