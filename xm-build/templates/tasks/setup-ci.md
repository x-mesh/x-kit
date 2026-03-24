# Setup CI/CD
## Variants: github-actions | gitlab-ci | jenkins
## Size: small
## Checklist
- [ ] Create CI config file
- [ ] Add lint step
- [ ] Add test step with coverage
- [ ] Add build step
- [ ] Configure caching (node_modules, go mod, etc.)
- [ ] Add branch protection rules
## Common Pitfalls
- No caching → slow builds
- Missing env vars in CI
- Flaky tests blocking deploys
