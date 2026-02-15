# Deploy Runbook (DAW)

Always deploy using the explicit compose file to avoid volume/project mismatches:

docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml up -d --remove-orphans

Never run:
- docker compose down -v

After deploy:
- run smoke tests
- check logs
