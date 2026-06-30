# Auth Flow

Sequence diagrams for the four flows you'll be debugging most often.

---

## Player login (Better Auth)

```mermaid
sequenceDiagram
    autonumber
    actor Player
    participant UI as /login
    participant API as /api/auth/sign-in
    participant BA as Better Auth
    participant DB as Neon · auth_users / auth_sessions

    Player->>UI: email + password
    UI->>API: POST /api/auth/sign-in
    API->>BA: signIn({ email, password })
    BA->>DB: SELECT auth_users WHERE email = ?
    DB-->>BA: hash + user
    BA->>BA: bcrypt.compare
    BA->>DB: INSERT auth_sessions (id, expires_at, token)
    BA-->>API: { session, user }
    API-->>UI: 200 + Set-Cookie better-auth.session_token
    UI->>Player: redirect /lobby
```

---

## Admin login (HMAC + TOTP)

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant UI as /admin/login
    participant API as /api/admin/auth/login
    participant Core as core.auth.adminLogin
    participant DB as Neon · admins / admin_sessions

    Admin->>UI: email + password
    UI->>API: POST /api/admin/auth/login
    API->>Core: adminLogin(ctx, { email, password })
    Core->>DB: SELECT admins WHERE email = ?
    DB-->>Core: row
    Core->>Core: bcrypt.compare
    alt must_reset_password = true
        Core-->>API: { stage: 'reset', reset_token }
        API-->>UI: 200 + reset_token
        UI->>Admin: redirect /admin/reset-password
    else totp_enabled = false
        Core-->>API: { stage: 'enrol_2fa', pending_2fa_token }
        API-->>UI: 200 + pending_2fa_token
        UI->>Admin: redirect /admin/mfa/setup
    else totp_enabled = true
        Core-->>API: { stage: 'challenge', pending_2fa_token }
        API-->>UI: 200 + pending_2fa_token
        UI->>Admin: prompt 6-digit code at /admin/mfa
        Admin->>UI: 6 digits
        UI->>API: POST /api/admin/auth/2fa/verify { pending_2fa_token, code }
        API->>Core: verify TOTP
        Core->>DB: INSERT admin_sessions (session_id, bind_ip, bind_ua)
        Core-->>API: { token (HMAC), session }
        API-->>UI: 200 + Set-Cookie cf_admin_session
        UI->>Admin: redirect /admin
    end
```

---

## Edge gate (every admin request)

```mermaid
flowchart TD
    A[Request to /admin/* or /api/admin/*] --> B{Cookie present?}
    B -->|no| C[Redirect /admin/login?next=...]
    B -->|yes| D[Decode payload<br/>NO signature verify]
    D --> E{Role?}
    E -->|host| F{Path in HOST_ALLOWED?}
    F -->|no| G[Redirect /admin?restricted=1]
    F -->|yes| H[NextResponse.next]
    E -->|other| H
    H --> I[RSC layout · requireAdminSession]
    I --> J{Verify HMAC + bind_ip + bind_ua + session_id active?}
    J -->|fail| C
    J -->|ok host| K[<HostShell>]
    J -->|ok other| L[<AdminShell>]
```

---

## Host portal · 5-layer defense

```mermaid
flowchart TB
    R[Host hits /admin/players/123] --> L1[1. Edge middleware<br/>cookie + role peek]
    L1 -->|allowed path? no for host| Bounce[Redirect /admin?restricted=1]
    L1 -->|allowed| L2[2. RSC layout<br/>requireAdminSession + role]
    L2 -->|not host-allowed| Bounce
    L2 -->|host| L3[3. Page-level check<br/>canAccessHostPortal + isHostAllowedAdminPath]
    L3 -->|fail| Bounce
    L3 -->|pass| L4[4. API ownership<br/>WHERE assigned_host_id = ctx.actor.adminId]
    L4 -->|other host's row| Empty[empty result]
    L4 -->|own row| L5[5. Postgres RLS<br/>host_player_interactions policy]
    L5 -->|deny| Empty
    L5 -->|allow| Data[host sees data]
```

---

## Forced password reset

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant UI as /admin/login → /admin/reset-password
    participant API as /api/admin/auth/reset
    participant Core as core.auth.password
    participant DB as Neon · admins

    Admin->>UI: login with temp password
    UI-->>Admin: stage=reset
    Admin->>UI: new password + confirm
    UI->>API: POST /api/admin/auth/reset { reset_token, password }
    API->>Core: completeReset(ctx, reset_token, password)
    Core->>DB: UPDATE admins SET password_hash = ?, must_reset_password = false
    Core-->>API: ok
    API-->>UI: ok
    UI->>Admin: continue to 2FA setup (if not yet enrolled)
```
