# Add Docker Support
## Size: small
## Checklist
- [ ] Create Dockerfile (multi-stage build)
- [ ] Create .dockerignore
- [ ] Create docker-compose.yml
- [ ] Add health check endpoint
- [ ] Configure environment variables
- [ ] Test build locally
## Common Pitfalls
- Running as root in container
- Copying node_modules into image
- Missing .dockerignore → huge images
