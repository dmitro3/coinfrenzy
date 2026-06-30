# Runbook · Onboard a New Host

End-to-end onboarding for a new contractor host. ~15 minutes for the
master + ~15 minutes for the host.

---

## Preconditions

- [ ] You (the master) have the host's email + display name.
- [ ] The host has access to:
  - An email inbox (for the temp password).
  - An authenticator app (1Password, Authy, Google Authenticator).
- [ ] You have one or more VIP players identified to assign initially.

---

## Steps

### 1. Master · create the host account

a. Sign in to `/admin/login` as master.
b. Visit `/admin/staff` → "+ New staff".
c. Fill in:

- **Email** — host's email.
- **Display name** — host's name.
- **Role** — **`host`** (critical — this triggers the host portal).
- **Send temp password by email** — checked.
  d. Save. Audit logged.

The host is created with:

- A bcrypt-hashed random temp password (emailed via SendGrid).
- `must_reset_password = true`.
- `totp_enabled = false`.

### 2. Host · first login

a. Host receives the welcome email with the temp password and a link
to `/admin/login`.
b. Host clicks the link, enters email + temp password.
c. Login response surfaces `stage: 'reset'` because of the flag.
d. Host is redirected to `/admin/reset-password`.
e. Host sets a new password.
f. After the reset, login proceeds; because `totp_enabled = false`,
they're routed to `/admin/mfa/setup`.

### 3. Host · 2FA setup

a. The setup page shows the QR code + secret string.
b. Host scans with their authenticator app.
c. Host enters the 6-digit code; if valid, 2FA is enabled.
d. **10 backup codes are shown**. Host must save them (download or
write down) — they're not shown again.
e. Click "Continue". The HMAC session is issued and the host lands on
`/admin`.

### 4. Host · confirm portal shape

The host should see the `HostShell` (not `AdminShell`):

- Sidebar with 4 items: **My VIPs**, **Messages**, **Bonus**,
  **Account**.
- No "Players", "Cashier", "Reports", "CRM", "Settings", etc.

If they see the full admin nav, the role wasn't saved as `host`.
Verify in DB: `SELECT role FROM admins WHERE email = ?;`.

### 5. Master · assign initial VIPs

a. Master visits `/admin/vip/assignments`.
b. Filter to VIPs without a host (or with the host you're replacing).
c. Select one or more players.
d. Click "Assign to host" → pick the new host.
e. Confirm. Each assignment:

- Updates `players.assigned_host_id` + `host_assigned_at`.
- Audit logged.
- Pusher pings the new host's portal.

### 6. Host · sees their roster

a. Host refreshes `/admin/vips` (or follows the Pusher toast).
b. The assigned VIPs appear with last-touch + channel.
c. Host can click into a player and start engaging.

### 7. Host · first interaction

a. Host clicks a VIP → action panel.
b. Picks a channel (WhatsApp / Telegram / phone / email).
c. Writes a message (or logs an outbound call).
d. Saves. `host_player_interactions` row is created.
e. RLS confirms only this host (and master/manager) can see the row.

### 8. Host · first bonus award

a. Host clicks "Send bonus".
b. Picker shows only **host-available** templates.
c. Host picks a template; amount is capped at the configured weekly
max ($500 SC remaining shown inline).
d. Submit. `core.vip.host-bonus.award` enforces:

- Template is host-available.
- Player is assigned to this host.
- Weekly cap not exceeded for this `(host, player)` over the last
  7 days.
  e. On success: ledger writes a `bonus_award`, player receives a
  `bonus.awarded` notification.

### 9. Done.

The host is fully onboarded. They can sign out and sign in again with
their new password + TOTP.

---

## Troubleshooting

| Symptom                                         | Fix                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Welcome email never arrived                     | Check SendGrid dashboard for delivery; resend from `/admin/staff/<id>`                                    |
| Host sees the full admin                        | Role wasn't saved as `host`. Edit at `/admin/staff/<id>`                                                  |
| 2FA QR doesn't scan                             | Have the host type the secret string manually                                                             |
| VIPs don't appear after assignment              | Refresh; if still empty, check RLS by running `SELECT * FROM host_player_interactions` as the host's role |
| Bonus award rejected with "weekly_cap_exceeded" | Honest — weekly cap is enforced. Escalate to manager for an override (not a bug).                         |

---

## Deactivating a host

When a host leaves:

1. Master visits `/admin/staff/<id>` → "Deactivate".
2. Confirm. `is_active = false` set on the admin.
3. All open sessions for this admin are revoked.
4. Visit `/admin/vip/assignments` → bulk-reassign their VIPs to
   another host (or unassign).
5. The host's account is preserved for audit history.

---

## Done when

- [ ] Host can log in with new password + TOTP.
- [ ] Host sees HostShell (not AdminShell).
- [ ] Host has at least one VIP assigned.
- [ ] Host has logged at least one interaction.
- [ ] Backup codes are saved by the host.
