# Secret Rotation Runbook

Rotate keys quarterly. This is non-negotiable for compliance.

---

## The rotation schedule

Per Doc 09 §9.4:

| Quarter | Rotate |
| --- | --- |
| Q1 | `BETTER_AUTH_SECRET` (force all players re-login) |
| Q1 | Webhook secrets where provider supports rotation |
| Q2 | `ADMIN_SESSION_SECRET` (with 7-day overlap) |
| Q2 | `ENCRYPTION_KEY` (re-encrypt all encrypted columns gradually) |
| Q3 | Adapter API keys (Finix, Alea, Footprint, Radar) |
| Q3 | Service-role DB credentials |
| Q4 | Repeat as appropriate |

---

## The 7-day overlap pattern (for session secrets)

Two secrets at all times: `ADMIN_SESSION_SECRET_CURRENT` and `ADMIN_SESSION_SECRET_PREV`.

1. Day 0: Set new secret as `_CURRENT`, move old to `_PREV`
2. New sessions sign with current. Verifier accepts either.
3. Day 7: Drop `_PREV`. Only `_CURRENT` works going forward.

Anyone holding a session from before day 0 is forced to re-auth on day 7.

### Steps

1. Generate new secret: `openssl rand -hex 32`
2. In Doppler:
   - Set `ADMIN_SESSION_SECRET_PREV` = current value of `ADMIN_SESSION_SECRET_CURRENT`
   - Set `ADMIN_SESSION_SECRET_CURRENT` = new value
3. Trigger deploy (Vercel + Fly.io pull from Doppler)
4. Verify new admin logins work
5. Schedule a calendar reminder for day 7: remove `_PREV`

---

## Better Auth secret rotation

Different pattern — Better Auth doesn't natively support overlap. To rotate:

1. Pick a low-traffic window
2. Announce maintenance window (~15 min)
3. Generate new secret
4. Update `BETTER_AUTH_SECRET` in Doppler
5. Deploy
6. All players forced to re-login on next request
7. Send a customer email explaining "security update, please log in again"

---

## Encryption key rotation

For data encrypted at the application layer (Doc 09 §9.3):
1. Set new key as `ENCRYPTION_KEY_CURRENT`
2. Move old to `ENCRYPTION_KEY_PREVIOUS`
3. Worker job re-encrypts data in batches over weeks
4. Once all data re-encrypted, drop `ENCRYPTION_KEY_PREVIOUS`

---

## Provider API key rotation

For Finix, Alea, Footprint, Radar, SendGrid, Twilio:
1. Generate new key in provider's dashboard
2. Add new key to Doppler
3. Verify new key works (run smoke test)
4. Deactivate old key in provider's dashboard
5. Old key keeps working in provider's grace period (usually 24-48 hours)

---

## Service-role DB credentials

Neon supports rotating credentials in their dashboard:
1. Generate new role with same permissions
2. Update `DATABASE_URL` in Doppler
3. Deploy
4. Verify new connections work
5. Delete old role after 24 hours

---

## After rotation

1. Test critical paths (signup, login, purchase, redemption, admin)
2. Verify no integration health tiles went red
3. Update internal docs if any procedure changed
4. Note rotation date in `audit_log` (auto-fired by the secret_rotation event)

---

## Emergency rotation

If a key is leaked (e.g. appeared in a paste, accidentally committed):
1. Rotate IMMEDIATELY — do not wait for the scheduled window
2. Page on-call to handle the deploy
3. Audit recent activity for any unauthorized use
4. Post-mortem within 5 days
