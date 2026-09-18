# Globiesoft / Spectra SwimPro inventory plan

Base UI: https://globiesoft.com/rlist_off/
PHP: https://globiesoft.com/rlist_off/php/

## Families
1. directory — events_list (paginate), athlete (search letters a–z + known BMSC names)
2. meet_detail — events_select, events_eventno, meetprogram_*, schedule/order endpoints
3. results — events_resultbyevent*, events_resultbyname*, events_results_*, medal/best swimmer
4. athlete_history — report_besttime_*, report_eventhistory_*, athlete_time*, finapoints_*
5. meta — endpoint map, sample requests, rate limits, egress notes

## Pull rules
- Prefer browser XHR (curl often returns [])
- UA + Referer Origin globiesoft; ≥800ms between calls
- Save raw JSON; derive fields.md from keys union
- For meet_detail/results: sample 2–3 Jateng-ish meets (e.g. WALKOTMGL2026) not all national
- For athlete_history: BMSC-linked names once ids known (Pamungkas, Athaya, Kinara, …)

## Success criteria
- fields.md per family with every key seen
- at least one non-empty PB/best-time and one results payload
- endpoint map: URL pattern → purpose → BMSC target table
