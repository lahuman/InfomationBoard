# Magic Link PKCE Callback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supabase's default emailed magic link create a server-side session for both first-time signup and returning-user login before redirecting to the requested internal page.

**Architecture:** Route magic-link and Google PKCE redirects through the existing `/auth/callback` handler. Build that callback URL from the configured application origin and a `safeNextPath` result, then let the callback exchange Supabase's authorization code for cookie-backed session credentials.

**Tech Stack:** Next.js 16 App Router, TypeScript 6, Supabase SSR 0.12, Supabase JS 2.110, Vitest 4, Playwright 1.62.

## Global Constraints

- Preserve `shouldCreateUser: true` so one flow supports signup and login.
- Accept only internal post-authentication destinations through `safeNextPath`.
- Do not expose provider errors, authorization codes, access tokens, or refresh tokens.
- Use the hosted project's default Magic Link email template; custom SMTP and custom email templates are not required.
- Keep `/auth/confirm` for direct token-hash verification and existing live E2E setup.
- Stop and report if the same error occurs five or more times.

---

## File Map

- `src/features/auth/actions.test.ts`: regression coverage for the callback URL passed to Supabase and unsafe `next` normalization.
- `src/features/auth/actions.ts`: shared callback URL construction used by magic-link and Google requests.
- `src/app/auth/callback/route.test.ts`: describe the route as the shared PKCE callback rather than a Google-only endpoint.
- `README.md`: document the default-template callback flow and optional token-hash endpoint accurately.

### Task 1: Lock the Magic Link Callback Contract

**Files:**
- Modify: `src/features/auth/actions.test.ts:48-96`
- Test: `src/features/auth/actions.test.ts`

**Interfaces:**
- Consumes: `requestMagicLink(previousState: AuthActionState, formData: FormData): Promise<AuthActionState>`
- Produces: regression expectations for `options.emailRedirectTo` and unsafe `next` handling.

- [ ] **Step 1: Change the existing successful request expectation**

Replace the expected direct dashboard URL with the callback URL:

```ts
emailRedirectTo:
  "http://localhost:3000/auth/callback?next=%2Fdashboard",
```

- [ ] **Step 2: Add a failing unsafe-destination test**

Add this case inside `describe("requestMagicLink")`:

```ts
it("replaces an external destination in the callback with the dashboard", async () => {
  const formData = new FormData();
  formData.set("email", "owner@example.com");
  formData.set("next", "https://evil.test/steal");

  await requestMagicLink(idle, formData);

  expect(mocks.signInWithOtp).toHaveBeenCalledWith({
    email: "owner@example.com",
    options: {
      shouldCreateUser: true,
      emailRedirectTo:
        "http://localhost:3000/auth/callback?next=%2Fdashboard",
    },
  });
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npm run test:run -- src/features/auth/actions.test.ts
```

Expected: both callback URL expectations fail because production still passes
`http://localhost:3000/dashboard` to `signInWithOtp`.

### Task 2: Route Magic Links Through the Shared PKCE Callback

**Files:**
- Modify: `src/features/auth/actions.ts:15-88`
- Test: `src/features/auth/actions.test.ts`

**Interfaces:**
- Produces: `authCallbackUrl(appUrl: string, next: string): string` as a private module helper.
- Consumes: normalized `next` values from `safeNextPath`.

- [ ] **Step 1: Add a focused private callback builder**

Add below `emailSchema`:

```ts
function authCallbackUrl(appUrl: string, next: string) {
  const callbackUrl = new URL("/auth/callback", appUrl);
  callbackUrl.searchParams.set("next", next);
  return callbackUrl.toString();
}
```

- [ ] **Step 2: Use the callback for email and Google authentication**

In `requestMagicLink`, replace the direct destination with:

```ts
emailRedirectTo: authCallbackUrl(env.NEXT_PUBLIC_APP_URL, next),
```

In `signInWithGoogle`, replace the local `URL` construction with:

```ts
const callbackUrl = authCallbackUrl(env.NEXT_PUBLIC_APP_URL, next);
```

and pass `redirectTo: callbackUrl`.

- [ ] **Step 3: Run the focused tests and verify GREEN**

Run:

```bash
npm run test:run -- src/features/auth/actions.test.ts src/app/auth/callback/route.test.ts
```

Expected: all focused auth action and callback tests pass.

- [ ] **Step 4: Run the mutation check**

Temporarily reason through these mutations without changing the worktree:

- direct `/dashboard` redirect: both magic-link callback tests fail;
- external `next` passthrough: the unsafe-destination test fails;
- `shouldCreateUser: false`: the existing literal request expectation fails;
- callback code exchange removed: the existing callback success test fails.

### Task 3: Align Names and Hosted Configuration Documentation

**Files:**
- Modify: `src/app/auth/callback/route.test.ts:22`
- Modify: `README.md:75-91`

**Interfaces:**
- Consumes: the shared `/auth/callback` behavior implemented in Task 2.
- Produces: accurate test naming and deployment instructions.

- [ ] **Step 1: Generalize the callback test description**

Change:

```ts
describe("Google auth callback", () => {
```

to:

```ts
describe("PKCE auth callback", () => {
```

- [ ] **Step 2: Document the default Magic Link flow**

Replace the required custom template instruction with:

```md
- Magic Link uses Supabase's default email template and redirects through
  `<application-origin>/auth/callback`, where the PKCE authorization code is
  exchanged for a server-side session.
- `/auth/confirm` remains available for direct token-hash verification in live
  tests or an optional custom email template. Custom SMTP/template configuration
  is not required for the default signup and login flow.
```

- [ ] **Step 3: Check the documentation and diff**

Run:

```bash
git diff --check
git diff -- src/features/auth/actions.ts src/features/auth/actions.test.ts src/app/auth/callback/route.test.ts README.md
```

Expected: no whitespace errors; the diff contains only the approved auth flow,
test naming, and documentation changes.

### Task 4: Verify the Complete Authentication Change

**Files:**
- Verify: all files changed by Tasks 1-3

**Interfaces:**
- Consumes: the completed magic-link PKCE callback implementation.
- Produces: fresh evidence for correctness, compatibility, and build integrity.

- [ ] **Step 1: Run focused auth tests**

```bash
npm run test:run -- src/features/auth/actions.test.ts src/app/auth/callback/route.test.ts src/app/auth/confirm/route.test.ts src/features/auth/login-form.test.tsx
```

Expected: every focused test passes.

- [ ] **Step 2: Run the complete repository verifier**

```bash
npm run verify
```

Expected: lint, type checking, all Vitest tests, production build, and the
client-secret scanner exit successfully.

- [ ] **Step 3: Run browser E2E tests**

```bash
npm run test:e2e
```

Expected: login-page and anonymous-dashboard behavior pass, together with the
rest of the browser suite.

- [ ] **Step 4: Run dependency security verification**

```bash
npm audit --audit-level=high
```

Expected: no high or critical vulnerabilities.

- [ ] **Step 5: Review final scope and commit**

```bash
git status --short
git diff --check
git diff --stat HEAD~1..HEAD
```

Expected: only the design, plan, auth implementation, regression tests, and
README documentation are part of this goal. Commit with:

```bash
git add docs/superpowers/plans/2026-07-29-magic-link-pkce-callback.md README.md src/features/auth/actions.ts src/features/auth/actions.test.ts src/app/auth/callback/route.test.ts
git commit -m "fix: complete magic link PKCE login"
```
