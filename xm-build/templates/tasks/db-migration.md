# Database Migration
## Size: medium
## Checklist
- [ ] Design schema changes
- [ ] Write up migration (forward)
- [ ] Write down migration (rollback)
- [ ] Test on staging/dev first
- [ ] Back up production data
- [ ] Plan zero-downtime migration
## Common Pitfalls
- No rollback plan
- Locking tables during migration
- Data loss from column drops
