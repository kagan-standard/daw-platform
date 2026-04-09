# Cron Schedule

All jobs run on the VPS host crontab and execute inside the `beerbook-api` container via `docker exec`.

| Schedule | Script | Log | Purpose |
|---|---|---|---|
| `0 3 * * *` | `pg_dump` (keycloak-db) | `/opt/backups/keycloak_YYYYMMDD.sql` | Daily Keycloak DB backup |
| `0 3 * * *` | `pg_dump` (supabase-db) | `/opt/backups/supabase_YYYYMMDD.sql` | Daily Supabase DB backup |
| `*/2 * * * *` | `scripts/push-dispatch.js` | `/var/log/push-dispatch.log` | Push notification dispatch |
| `*/15 * * * *` | `scripts/push-receipts.js` | `/var/log/push-receipts.log` | Push receipt processing |
| `0 4 * * *` | `scripts/push-token-prune.js` | `/var/log/push-token-prune.log` | Prune stale push tokens |
| `0 2 * * *` | `workers/elo-snapshot.js` | `/var/log/elo-snapshot.log` | Daily ELO snapshot |
| `0 0 * * *` | `workers/challenge-resolver.js resolve` | `/var/log/challenge-resolver.log` | Resolve completed challenges |
| `0 9 * * 1` | `workers/challenge-resolver.js remind` | `/var/log/challenge-reminder.log` | Weekly challenge reminders (Mon 9am UTC) |
| `0 3 * * *` | `scripts/auto-resolve-backs.js` | `/var/log/auto-resolve-backs.log` | Auto-resolve expired backs |
| `5 0 * * 1` | `workers/challenge-promoter.js` | `/var/log/challenge-promoter.log` | Promote challenges (Mon 00:05 UTC) |
| `0 12 * * 1` | `workers/botw-weekly.js` | `/var/log/botw-weekly.log` | Beer of the Week selection (Mon noon UTC) |
| `0 0 * * 1` | `scripts/weekly-tabs-eval.js` | `/var/log/weekly-tabs-eval.log` | Weekly tabs evaluation (Mon midnight UTC) |
| `0 18 * * 4` | `scripts/streak-risk-check.js` | `/var/log/beerbook/streak-risk-check.log` | Mid-week streak risk notifications (Thu 6pm UTC / ~1pm ET). Gives users Fri–Sun to rate before Monday eval. |

## Notes

- `weekly-tabs-eval.js` runs at Monday 00:00 UTC. Any new cron touching `user_tabs_profile` should avoid this window to prevent races.
- `streak-risk-check.js` runs Thursday 6pm UTC — gives users Fri/Sat/Sun to act before the Monday eval.
