# Repository Guidance

## Seed data

Treat reusable synthetic seed behavior as normal application code. Commit it with tests and share it through a pull request so fresh clones and other development machines can use it.

`VITE_DEMO_SWIMMER_COUNT` controls the generated demo roster in `src/lib/club/seed.ts`. With no value, seeding keeps the three-person sample roster. A larger value creates synthetic swimmers for testing roster UI at scale.

Keep real or machine-specific seed payloads in the gitignored local overrides:

- `data/seed.local.json`
- `data/default-training-schedules.local.json`
- `.grok/app-env.json`

Production can read its private overrides through `BMSC_DATA_LOCAL_DIR`. Preserve that separation when changing seed behavior: share generators, schemas, example data, and tests; keep real names, birth dates, emails, credentials, and venue overrides outside Git.

Before describing a seed change as local-only, inspect both the tracked implementation and the ignored payload. The implementation may be portable even when the selected dataset is private to one environment.
