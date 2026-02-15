# SYSTEM RULES

You are operating inside an existing live deployment. Do NOT rebuild from scratch.

## Prime directive
Do not break production. Avoid changes that can lock users out or lose DB data.

## Required in every phase
- acceptance criteria
- validation commands (exact)
- rollback steps (exact)

## Safety rails
- Never run docker compose down -v on prod.
- Always use explicit compose file path:
  docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml ...
- Backup first; document restore.
