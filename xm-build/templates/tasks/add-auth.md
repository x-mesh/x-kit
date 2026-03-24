# Add Authentication
## Variants: jwt | oauth2 | api-key | session
## Size: medium
## Checklist
- [ ] Choose auth strategy
- [ ] Implement login/signup endpoints
- [ ] Add token validation middleware
- [ ] Implement token refresh
- [ ] Add rate limiting to auth endpoints
- [ ] Hash passwords (bcrypt, argon2)
## Common Pitfalls
- Storing plain-text passwords
- Missing token expiry
- No rate limiting on login (brute-force risk)
- Leaking tokens in logs
