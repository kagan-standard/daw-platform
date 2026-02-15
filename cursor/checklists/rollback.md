# Rollback Checklist

- [ ] Revert changed files (git revert or restore from backups)
- [ ] Redeploy (compose up -d / playbook run)
- [ ] Re-run smoke tests
- [ ] Verify auth still works and DB data intact
