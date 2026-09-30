# HANDOFF.md --- Laser System

## Current Project Status & Remaining Work

**Checkpoint:** 14+ Audit\
**Status:** Core Full-Stack implementation is largely complete.
Remaining work is mainly verification, production configuration, storage
integration, cleanup, and deployment.

------------------------------------------------------------------------

# 1. Executive Summary

The project has moved beyond the original Frontend/localStorage stage.

The current codebase already contains:

-   React + Vite Frontend
-   Node.js Backend
-   PostgreSQL + Prisma data layer
-   JWT authentication
-   Role-based authorization
-   Users / Team management
-   Tasks and task lifecycle
-   Time tracking
-   Subtasks using `parentId`
-   Comments
-   Feedback
-   Goals
-   Annual Calendar
-   Profile
-   API service layer
-   Frontend route guards
-   Backend validation/security

The main remaining gap is **not rebuilding these modules**. The main gap
is proving the complete system works end-to-end in a real browser with a
real PostgreSQL environment, then preparing production deployment.

------------------------------------------------------------------------

# 2. Current Status

  ----------------------------------------------------------------------------
  Area                      Status                  Notes
  ------------------------- ----------------------- --------------------------
  React/Vite                ✅ Complete             Existing frontend

  RTL UI                    ✅ Complete             Existing UI direction

  Backend API               ✅ Complete             Node.js backend

  Prisma                    ✅ Implemented          Schema + migrations exist

  PostgreSQL                ✅ Supported            Needs production
                                                    verification

  JWT Auth                  ✅ Implemented          Login/session flow

  Roles                     ✅ Implemented          ADMIN / MANAGER / DESIGNER

  Route Guards              ✅ Implemented          Frontend protection

  Backend Authorization     ✅ Implemented          Server-side permission
                                                    checks

  Users API                 ✅ Implemented          CRUD + activation

  Manage Users UI           ✅ Implemented          Needs browser verification

  Profile UI/API            ✅ Implemented          Needs browser verification

  Tasks API                 ✅ Implemented          CRUD/lifecycle

  Task Dashboard            ✅ Implemented          API-connected

  Start / Stop / End        ✅ Implemented          Time lifecycle

  Time Logs                 ✅ Implemented          `TaskTimeLog`

  Subtasks                  ✅ Implemented          Recursive `parentId` model

  Comments                  ✅ Implemented          Task comments

  Feedback                  ✅ Implemented          API + UI

  Goals                     ✅ Implemented          Weekly/monthly/quarterly

  Calendar                  ✅ Implemented          Annual events API/UI

  Frontend API integration  ✅ Implemented          No longer
                                                    localStorage-based for
                                                    core data

  R2 Storage                🟨 Coded, NOT run       See Sections 16.4 and 17

  Browser E2E               ❌ Pending              Critical before production

  Real PostgreSQL           ❌ Pending              Aiven/production DB
  production test                                   

  `prisma migrate deploy`   ⚠️ Pending              Must verify on target DB
  verification                                      

  Production CORS           ❌ Pending              Must test real domains
  verification                                      

  Deployment                ❌ Pending              Backend + Frontend

  Final cleanup             🟡 Pending              Old/ambiguous files/routes

  HANDOFF documentation     ✅ Rewritten            This document
  ----------------------------------------------------------------------------

------------------------------------------------------------------------

# 3. Critical Remaining Work

## 3.1 Full Browser Verification --- HIGH PRIORITY

The application must be tested as a real user, not only through
API/build checks.

### ADMIN

Verify:

-   Login
-   Dashboard
-   Users/team
-   Manage Users
-   Create user
-   Edit user
-   Disable user
-   Enable user
-   Delete user
-   Create/edit/delete tasks
-   Assign/reassign tasks
-   Start / Stop / End
-   Comments
-   Feedback management
-   Goals
-   Calendar
-   Profile
-   Password change
-   Logout

### MANAGER

Verify:

-   Login
-   Team visibility
-   Manage Users
-   User creation/editing
-   Activation/deactivation
-   Task creation
-   Task assignment
-   Task reassignment
-   Task editing/deletion
-   Feedback
-   Goals
-   Calendar
-   Profile
-   Permission restrictions against ADMIN/system users

### DESIGNER

Verify:

-   Login
-   Sees only permitted tasks
-   Create own task where allowed
-   Start task
-   Stop task with reason
-   Resume task
-   End task
-   Update progress
-   Add comment
-   Delete own comment where allowed
-   Subtasks
-   Image attachments
-   Cannot manage users
-   Cannot access restricted management pages
-   Cannot edit/delete tasks outside permitted scope
-   Cannot access restricted Goals/Calendar functionality if blocked by
    permissions

### Result required

Every expected flow must be tested from the browser and recorded as
PASS/FAIL.

------------------------------------------------------------------------

# 4. Database / Production Verification

## 4.1 Prisma Migration

Verify on the actual target PostgreSQL database:

``` bash
npx prisma migrate deploy
```

Confirm:

-   Migration completes successfully
-   All required tables exist
-   No migration drift
-   Prisma Client matches schema
-   Application can start using the migrated database

------------------------------------------------------------------------

## 4.2 Production PostgreSQL

Target can be Aiven or another PostgreSQL provider.

Verify:

-   SSL connection
-   `DATABASE_URL`
-   `DATABASE_CA_CERT` if required
-   Connection pooling/limits
-   Prisma connection
-   CRUD operations
-   Transaction behavior
-   Production database permissions

------------------------------------------------------------------------

# 5. Production API / Frontend Verification

Before deployment, verify:

``` text
Frontend
   ↓
Production Backend
   ↓
Production PostgreSQL
```

Test:

-   Login
-   JWT authentication
-   CORS
-   Cookies/headers if applicable
-   API error handling
-   Unauthorized requests
-   Expired token behavior
-   Role restrictions
-   File/image requests
-   Network failures

------------------------------------------------------------------------

# 6. Cloudflare R2 Storage --- CODED IN CHECKPOINT 16, NOT VERIFIED AGAINST REAL R2

> **Superseded by Section 17** (what was actually built, deviations from the
> recommendations below, and what is/isn't verified). The text of this section
> is the original requirement list and is kept for the acceptance tests.

## Current state

Cloudflare R2 support is **written but has never run against a real R2
bucket** (Checkpoint 16). The project must not claim R2 support as working
until the acceptance tests below pass with real credentials.

## Required implementation

Use R2 as the object storage layer for files/images instead of storing
file binaries inside PostgreSQL.

Recommended architecture:

``` text
Frontend
   │
   │ Request upload
   ▼
Backend
   │
   │ Generate signed upload URL
   ▼
Cloudflare R2
   │
   ├── tasks/
   ├── feedback/
   ├── profiles/
   └── other/
```

## Backend requirements

Add:

-   R2/S3-compatible client
-   Bucket configuration
-   Upload endpoint or presigned URL endpoint
-   Delete object endpoint
-   Object existence/error handling
-   File size validation
-   MIME/type validation
-   Authentication/authorization before issuing upload URLs

Recommended environment variables:

``` env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

Do NOT expose the R2 secret key in the React frontend.

## Database requirements

Store object metadata/reference, not the binary file.

Recommended fields include:

``` text
objectKey
fileName
mimeType
fileSize
```

The exact schema should match the existing attachment model.

## Frontend requirements

Update the current image/file attachment component so that:

1.  User selects a file
2.  Frontend requests an upload URL
3.  Backend validates authorization
4.  Frontend uploads directly to R2
5.  Frontend/backend stores the resulting object reference
6.  UI displays the file/image
7.  Delete removes both the database record and R2 object where
    appropriate

## R2 acceptance tests

-   Upload image
-   Upload supported file
-   Reject unsupported type
-   Reject oversized file
-   Display uploaded image
-   Refresh page and confirm persistence
-   Delete file
-   Confirm deleted object is no longer accessible
-   Unauthorized user cannot upload to another user's/task's storage
    scope
-   Production R2 credentials work
-   CORS configuration works if direct browser upload is used

------------------------------------------------------------------------

# 7. Image Attachments

The existing image attachment functionality must be re-tested after R2
integration.

Required test cases:

-   Task image upload
-   Feedback attachment
-   Profile image if supported
-   Multiple attachments
-   Delete attachment
-   Refresh persistence
-   Broken/missing object handling
-   Unauthorized attachment access

------------------------------------------------------------------------

# 8. End-to-End Testing

## Recommended

Add Playwright or an equivalent browser E2E framework.

Minimum scenarios:

### Authentication

-   Valid login
-   Invalid login
-   Logout
-   Expired/invalid token

### Authorization

-   ADMIN access
-   MANAGER access
-   DESIGNER access
-   Forbidden pages
-   Forbidden API actions

### Tasks

-   Create
-   Assign
-   Start
-   Stop
-   Resume
-   End
-   Progress
-   Comment
-   Subtask
-   Reassign
-   Delete

### Users

-   Create
-   Edit
-   Activate
-   Deactivate
-   Delete
-   Permission restrictions

### Feedback

-   Create
-   View
-   Update
-   Resolve/open
-   Delete/bulk delete where permitted

### Goals

-   Create
-   Update
-   Progress
-   Status

### Calendar

-   Create
-   Edit
-   Delete
-   Display

### Files/R2

-   Upload
-   Display
-   Delete
-   Permission check

------------------------------------------------------------------------

# 9. Security Verification

Existing security mechanisms are present, but production verification is
still required.

Verify:

-   JWT secret is production-safe
-   No secrets in frontend bundle
-   R2 credentials are backend-only
-   CORS uses production origins
-   Rate limiting works
-   Helmet/security headers work
-   Zod validation covers relevant endpoints
-   Passwords use bcrypt
-   Unauthorized API calls return correct status
-   Users cannot manipulate another user's restricted resources
-   ADMIN/system-user protections work
-   File upload validation cannot be bypassed

------------------------------------------------------------------------

# 10. Existing Code Cleanup

> **Status (Checkpoint 15):** 10.1–10.3 were applied in code (see Section 16.2). They are syntax-checked and type-checked against stubs only; **`npm run build` has not been run.**

## 10.1 `frontend/src/lib/storage.ts`

The old storage helper still exists.

The core application is now API-driven, so review:

``` text
readStorage()
writeStorage()
generateId()
```

Remove obsolete localStorage data paths if they are no longer required.

Keep only utilities that are genuinely used.

------------------------------------------------------------------------

## 10.2 Dashboard / Users Naming

There is some naming ambiguity.

Current structure contains:

``` text
/users
/manage-users
/dashboard
```

`Users.tsx` behaves more like a team/dashboard view, while
`ManageUsers.tsx` is the actual user administration page.

Review naming so that future developers do not confuse:

``` text
Team Dashboard
```

with:

``` text
User Administration
```

------------------------------------------------------------------------

## 10.3 `/dashboard` Route

Review the existing `/dashboard` route and confirm whether it should
render the current dashboard/team page or redirect to the intended
dashboard.

Remove old compatibility routes if no longer needed.

------------------------------------------------------------------------

# 11. Documentation Cleanup

The previous HANDOFF contained outdated statements suggesting that the
application was still localStorage-based.

The documentation should now consistently state:

``` text
Core application data → Backend API → PostgreSQL
```

and:

``` text
R2 → Coded (Checkpoint 16), unverified against real R2
```

Do not mark R2 as supported until it is tested with real credentials (Section 17.5).

------------------------------------------------------------------------

# 12. Deployment Plan

Recommended order:

``` text
1. Finish Browser Verification
        ↓
2. Integrate R2
        ↓
3. Test R2 locally
        ↓
4. Test PostgreSQL production connection
        ↓
5. Run prisma migrate deploy
        ↓
6. Deploy Backend
        ↓
7. Configure production CORS
        ↓
8. Deploy Frontend
        ↓
9. Configure R2 production settings
        ↓
10. Run complete production smoke test
        ↓
11. Add E2E tests
        ↓
12. Final security review
```

------------------------------------------------------------------------

# 13. Final Definition of Done

The project should only be considered production-ready when all of the
following are true:

-   [ ] Browser verification completed for ADMIN
-   [ ] Browser verification completed for MANAGER
-   [ ] Browser verification completed for DESIGNER
-   [ ] Tasks fully tested
-   [ ] Time tracking tested
-   [ ] Subtasks tested
-   [ ] Comments tested
-   [ ] Feedback tested
-   [ ] Goals tested
-   [ ] Calendar tested
-   [ ] Manage Users tested
-   [ ] Profile tested
-   [ ] Password change tested
-   [ ] Permission restrictions tested
-   [ ] PostgreSQL production database connected
-   [ ] `prisma migrate deploy` succeeds
-   [ ] Production CORS verified
-   [ ] R2 integrated
-   [ ] R2 upload tested
-   [ ] R2 delete tested
-   [ ] R2 permissions tested
-   [ ] R2 production credentials configured
-   [ ] Frontend deployed
-   [ ] Backend deployed
-   [ ] Production smoke test passed
-   [ ] E2E tests added for critical flows
-   [ ] Old localStorage code cleaned up
-   [ ] Old/ambiguous routes reviewed
-   [ ] Documentation updated

------------------------------------------------------------------------

# 14. Priority Order

## 🔴 P0 --- Must do before production

1.  Browser test all three roles
2.  Verify authorization/permission boundaries
3.  Verify real PostgreSQL
4.  Verify `prisma migrate deploy`
5.  Verify production CORS
6.  Test all core CRUD/lifecycle flows

## 🟠 P1 --- Required if R2 is part of the final product

7.  Integrate Cloudflare R2
8.  Update attachment database model if necessary
9.  Implement secure upload flow
10. Implement delete flow
11. Test R2 permissions and persistence
12. Configure production R2

## 🟡 P2 --- Quality / maintainability

13. Add Playwright E2E tests
14. Remove obsolete localStorage code
15. Clean route/component naming
16. Update remaining documentation
17. Final security review

------------------------------------------------------------------------

# 15. Current Bottom Line

The project is **not at the stage where the core application needs to be
rebuilt**.

The current implementation is already substantially Full-Stack.

The remaining work is primarily:

``` text
Verification
+ Production PostgreSQL
+ R2 integration
+ Deployment
+ E2E testing
+ Cleanup
```

The most important immediate task is to run the complete application in
a browser and validate every role and workflow before making further
architectural changes.

------------------------------------------------------------------------

# 16. Addendum --- Verified Facts, Corrections, and Scoping (Checkpoint 14--15)

## 16.1 What is actually verified

-   **Backend:** vitest 97/97 (PGlite); `http-smoke` 35/35 and `services-smoke` 32/32 on real PostgreSQL 16 (earlier sessions).
-   **Browser (earlier session, Chromium + PostgreSQL 16):** 25/25 and 13/13 scenarios. The scripts were **not** saved in this repository, so they cannot be re-run from it.
-   **Checkpoint 14--15 frontend code** (`ManageUsers.tsx`, `UserModal.tsx`, Profile editing, subtasks label, cleanup below): syntax-checked and type-checked against stubbed React/lucide/router types only. **Not built, not linted, not tested in a browser.** First action on a machine with network: `cd frontend && npm install && npm run build && npm run lint`.

## 16.2 Cleanup applied (unbuilt)

-   `lib/storage.ts` removed. `readStorage` / `writeStorage` were unused; `generateId` moved to `lib/id.ts` (import updated in `ImageAttachments.tsx`). Remaining `localStorage` use is intentional: JWT (`tashkeel_token`) and theme (`tashkeel_theme`).
-   `pages/Users.tsx` renamed to `pages/TeamDashboard.tsx` (component `TeamDashboardPage`); URL stays `/users` (sidebar label "Dashboard"). User administration stays at `/manage-users`.
-   `/dashboard` now redirects to `/users`; the unused `dashboard` page permission was removed from `lib/permissions.ts`.
-   Subtask count label fixed (`TaskCard.tsx`).

## 16.3 Deployment corrections (Section 12 is otherwise unchanged)

-   **Render build command:** `npm install --include=dev && npm run build`. `prisma`, `typescript` and `tsx` are devDependencies and Render sets `NODE_ENV=production`, so a plain `npm install` breaks the build. Start command: `npx prisma migrate deploy && npm start`.
-   **Seed:** run once **from a developer machine** against the production DB (`tsx` is a devDependency). The seed gives all three system users (`lol`, `abdullah`, `amr`) the **same** `ADMIN_PASSWORD`; each must change it after first login (Profile page supports this).
-   `prisma migrate deploy` goes through Prisma's schema engine with `sslmode=require`, not through `pg`. Acceptance by Aiven is **unverified**; `DATABASE_CA_CERT` is used only by the runtime `pg` pool.

## 16.4 R2 --- status

Implemented in Checkpoint 16 (backend + frontend, no DB migration). Not run against real R2, not built, not run under vitest. Full details in Section 17.

## 16.5 Companion file

`HANDOFF_DETAILS.md` is the previous detailed handoff (checkpoint history, locked decisions, historical verification results, per-section status table). Keep it for decisions; use this file for current status and remaining work.

------------------------------------------------------------------------

# 17. Cloudflare R2 --- what Checkpoint 16 built

## 17.1 Design

-   Browser asks the backend for a presigned **PUT** URL, uploads the file **directly to R2**, then saves the task/feedback with a reference `{ id, name, objectKey, mimeType, size }`. The R2 secret never reaches the frontend.
-   Bucket is **private**. Display uses presigned **GET** URLs generated by the backend when it serializes a task/feedback (so access to an image follows access to the task). URLs are rounded to the hour and valid 1--2 h, so they are stable within an hour (browser cache) but expire. `R2_PUBLIC_URL` from the original recommendation is **not used**.
-   `attachments` stay `Json` columns: **no migration**. Old base64 attachments `{ id, name, dataUrl }` remain valid and can be mixed with new ones; they are **not** migrated to R2.
-   **R2 is optional.** Without the four `R2_*` variables the backend reports `enabled: false` at `GET /api/files/config` and the frontend falls back to the old base64 behaviour. Setting only some of the four makes the backend refuse to start (names the missing ones, never prints values).
-   Object keys: `<tasks|feedback>/<uploaderUserId>/<uuid>.<jpg|png|webp|gif>`. The original file name is never part of the key.
-   **No AWS SDK.** `utils/s3sign.ts` is a small SigV4 presigner using `node:crypto`. Reason: packages could not be installed in the session that wrote this, so an SDK could not be verified; the signer reproduces AWS's official test vector exactly. If you prefer the official SDK, swap `utils/r2Client.ts` (its interface is 4 methods) --- nothing else depends on the signer.
-   Images only (JPEG, PNG, WebP, GIF), default max 10 MB (`R2_MAX_FILE_MB`, 1--50). Profile images are not supported.

## 17.2 Backend surface

-   `GET /api/files/config` --- `{ enabled, maxFileSize, allowedTypes }`.
-   `POST /api/files/presign-upload` `{ scope, mimeType, size }` --- 400 unsupported type, 413 over limit, 503 `R2_NOT_CONFIGURED`. Returns `{ objectKey, uploadUrl, headers, previewUrl }`. `Content-Type` is part of the signature, so the browser must send exactly `headers["Content-Type"]`.
-   `DELETE /api/files?key=` --- only the uploader's own key, only if no task/feedback references it (409 otherwise). For files removed from a form before saving.
-   Saving a task/feedback with a **new** `objectKey` (`assertAttachmentsAllowed`): key shape valid and in the right scope (tasks vs feedback), uploader segment == current user (403 otherwise), extension matches `mimeType`, then a signed **HEAD** confirms the object exists, size equals the declared size and is within the limit, and content-type is allowed. Oversized/mismatched objects are deleted and the request gets 400. Keys already present on the record pass untouched (a manager editing a designer's task keeps the designer's images).
-   The upload-time size limit is **not** enforced by R2 (Content-Length is not signed); it is enforced at save time by the HEAD check.
-   Cleanup (best effort, after the DB write succeeds; never fails the request): removing an attachment via PATCH, deleting a task (including all descendants), deleting a feedback, and feedback bulk-delete all delete the R2 objects.
-   Files: `utils/{s3sign,r2Client,r2,attachmentKeys,attachments}.ts`, `validators/attachments.ts`, `routes/files.ts`; edits in `routes/{tasks,feedback}.ts`, both serializers, both validators, `app.ts`, `utils/env.ts`, `.env.example`.

## 17.3 Frontend surface

-   `ImageAttachmentsField` takes a required `scope` (`"tasks"` / `"feedback"`), asks `/files/config` once, and uploads each image straight to R2 with a "جارٍ رفع الصور…" state, per-file error messages (type, size, upload failure), and the 20-attachment cap. A file removed before saving is discarded via `DELETE /files`.
-   Images that fail to load (deleted object, expired link) show an `ImageOff` placeholder instead of a broken image.
-   `toAttachmentPayload` strips the temporary `url` before saving (also enforced by the backend).
-   New: `services/filesService.ts`, `lib/attachments.ts`; `types/attachment.ts` now has optional `dataUrl` and R2 fields.

## 17.4 Verified vs not verified

**Actually run in the session:**
-   `s3sign.ts` reproduces the official AWS SigV4 query-string test vector byte-for-byte.
-   `r2Client.ts` and `attachmentKeys.ts`: 9 assertions run against a fake fetch (URL shape, signed headers, hour-stable GET links, HEAD/DELETE outcomes, malicious keys rejected).
-   Strict `tsc` on `s3sign/r2Client/attachmentKeys`; syntax check on every new/edited file; type-check of `ImageAttachments.tsx` and the services against stubbed React/lucide (an injected error was caught).

**Written but NOT run** (no npm/Postgres in that session):
-   Vitest files `files.test.ts` (route-level: upload scope, 403 on other users' keys, size/type rejection, cleanup on patch/delete/bulk-delete, DELETE guard), `envR2.test.ts`, and the vitest wrappers of the pure tests. `globalSetup.ts` now sets fake R2 variables (endpoint `http://r2.test.invalid`, 1 MB limit); `files.test.ts` replaces `fetch` with an in-memory bucket.
-   The Prisma JSON filter `array_contains` in `isKeyReferenced` (guards `DELETE /api/files`).
-   `npm run build` / `lint` for the frontend; `lucide-react` icon `ImageOff` (used for the first time in this project).
-   **Everything against a real R2 bucket**: that R2 accepts the signature (signed headers: `host`, `content-type`), that CORS works for the browser PUT, that HEAD/DELETE presigned requests work from the server.

## 17.5 Steps on your machine (in order)

1.  `cd backend && npm install && npm test` --- fix anything in the new tests first (existing 97 tests must still pass).
2.  `cd frontend && npm install && npm run build && npm run lint`.
3.  Create the bucket in Cloudflare (private, no public access). Create an **R2 API token** with *Object Read & Write* scoped to that bucket; note Account ID, Access Key ID, Secret Access Key.
4.  Bucket **CORS** (needed for the browser PUT; replace the origin with your Pages URL, keep localhost for dev):

    ``` json
    [
      {
        "AllowedOrigins": ["https://<your-project>.pages.dev", "http://localhost:5173"],
        "AllowedMethods": ["PUT", "GET", "HEAD"],
        "AllowedHeaders": ["content-type"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600
      }
    ]
    ```
5.  Put `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` in `backend/.env` (and later in Render). Run both apps and go through the acceptance list in Section 6: upload image, reject unsupported type, reject oversized, refresh persistence, delete, deleted object no longer reachable, designer B cannot use designer A's key, production credentials.
6.  If the browser PUT fails with a network error, check CORS first; if R2 answers 403 `SignatureDoesNotMatch`, send me the response body --- the likely fix is in `utils/r2Client.ts` only.

## 17.6 Known limitations

-   A file uploaded and then abandoned by closing the modal without saving stays in R2 (orphan). Only "removed before saving" is cleaned. Consider an R2 lifecycle rule or a periodic cleanup job later.
-   Display links expire after 1--2 h; a page left open longer shows the placeholder until refreshed.
-   Old base64 rows are not migrated.
-   No virus scanning; only MIME/extension/size checks (the browser-declared MIME is checked, the file content is not sniffed).

