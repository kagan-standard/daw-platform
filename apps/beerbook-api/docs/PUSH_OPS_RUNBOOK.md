# Push Notification Operations

## Cron Jobs (add to VPS crontab)

# Dispatcher — sends queued push notifications to Expo (every 2 min)
*/2 * * * * docker exec beerbook-api node scripts/push-dispatch.js >> /var/log/push-dispatch.log 2>&1

# Receipt checker — polls Expo for delivery receipts (every 15 min)
*/15 * * * * docker exec beerbook-api node scripts/push-receipts.js >> /var/log/push-receipts.log 2>&1

# Token pruner — deactivates stale/invalid tokens (daily at 4am)
0 4 * * * docker exec beerbook-api node scripts/push-token-prune.js >> /var/log/push-token-prune.log 2>&1

## Telemetry Views
- `push_telemetry_attempts_24h` — send attempts in last 24h
- `push_telemetry_deactivations_30d` — token deactivations in last 30d
- `push_telemetry_delivery_by_status` — delivery status breakdown
- `push_telemetry_token_summary` — active/inactive token counts

## Troubleshooting
- If dispatcher shows "no rows claimed": check `tab_notifications` has rows, `push_tokens` has active tokens for that user, and `notification_token_push_state` is being populated by `claim_push_dispatch_batch`.
- If delivery_status = 'InvalidCredentials': re-upload APNs key via `eas credentials`.
- If `#variable_conflict` errors: the DB function's RETURNS TABLE columns collide with table columns. Add `#variable_conflict use_column` to the function.
