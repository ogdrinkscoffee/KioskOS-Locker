# Security Specification: KioskOS Cross-Device Sync

## Phase 0: Data Invariants
1. **Strict Ownership Isolation (PII Protection)**: Documents under `/users/{userId}`, `/users/{userId}/devices/{deviceId}`, and `/users/{userId}/growth/{profileId}` contain personal progress, email, and device control policies. Only the authenticated owner with `request.auth.uid == userId` and `request.auth.token.email_verified == true` may read or write them. No blanket `isSignedIn()` reads are permitted.
2. **Master Gate Relational Integrity**: Subcollections `/devices/{deviceId}` and `/growth/{profileId}` require the parent `/users/{userId}` document to exist (`exists(/databases/$(database)/documents/users/$(userId))`).
3. **Salted Hash Protection**: Plaintext admin passcodes are NEVER persisted in Firestore. Only `adminPinSalt` and SHA-256 hex `adminPinHash` (64 hex chars) are synced for PC Web password verification.
4. **Immutable Ownership & Timestamps**: `uid`, `ownerId`, `deviceId`, `profileId`, and `createdAt` are immutable after document creation. Both `createdAt` (on create) and `updatedAt` (on create/update) must equal `request.time`.
5. **Bounded Payload Sizing**: All strings, maps, and arrays have strict upper size limits matching `firebase-blueprint.json` (`allowedPackages <= 120`, `appTimeLimits <= 100`, `notes <= 100`, `whyIStarted <= 2000`, IDs <= 128 chars matching `^[a-zA-Z0-9_\-]+$`).
6. **Zero Query Delegation**: List rules require explicit `resource.data` identity ownership validation (`resource.data.ownerId == request.auth.uid`).

## Dirty Dozen Adversarial Payloads
1. **Cross-User Profile Read/Write**: Authenticated user B reads or writes `/users/userA`. Must fail (`PERMISSION_DENIED`).
2. **Unverified Email Spoof**: Authenticated user with `email_verified: false` writes `/users/{uid}` or `/devices/{id}`. Must fail.
3. **Ghost Shadow Field Injection**: Authenticated owner sends `{ ..., isAdmin: true, ghostField: 1 }` on create or update. Rejected by strict `keys().hasOnly(...)` and `affectedKeys().hasOnly(...)`.
4. **Plaintext PIN Exfiltration Injection**: Authenticated owner adds `adminPin: "1234"` to `DeviceSyncSnapshot`. Rejected by key allowlist.
5. **Identity Spoofing on Create**: Owner creates `DeviceSyncSnapshot` with `ownerId: "victimUid"`. Rejected by `ownerId == request.auth.uid`.
6. **Owner Reassignment on Update**: Owner attempts to mutate `ownerId` or `deviceId`. Rejected by immutability gate.
7. **Forged Client Timestamp**: Client writes `createdAt: "2020-01-01T00:00:00Z"` or stale `updatedAt`. Rejected by `== request.time`.
8. **1.5KB Oversized Document ID**: Path `{deviceId}` contains invalid symbols (`../`) or >128 chars. Rejected by `isValidId(deviceId)`.
9. **Array Resource Exhaustion ("Denial of Wallet")**: `allowedPackages` contains >120 items or non-string entry at index 0. Rejected by list bounds check.
10. **Invalid Enum Injection**: `kioskMode: "root_shell"` or `lastModifiedBy: "anonymous"`. Rejected by enum list check.
11. **Oversized Free-Text Injection**: `whyIStarted` exceeds 2000 chars or `notes` exceeds 100 entries. Rejected by size checks.
12. **Orphan Subcollection Create**: Creating `/users/{uid}/devices/primary` before `/users/{uid}` exists. Rejected by parent `exists(...)` Master Gate.
