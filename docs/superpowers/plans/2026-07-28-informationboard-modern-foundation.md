# InformationBoard Modern Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unmaintained CRA/Express runtime with a tested Next.js foundation while preserving the legacy behavior as historical reference.

**Architecture:** One root Next.js App Router application replaces the separate frontend and upload server. Legacy sources move under `legacy/` as read-only migration reference, while focused `src/app`, `src/components`, and `src/lib` units provide the new runtime, validation, and test boundaries.

**Tech Stack:** Next.js 16.2.12, React 19.2.8, TypeScript 6.0.3, Tailwind CSS 4.3.3, Zod 4.4.3, ESLint 10.8.0, Vitest 4.1.10, Testing Library 16.3.2, Playwright 1.62.0, npm

## Global Constraints

- Use Node.js 20.9.0 or newer; set the project engine floor to `>=20.9.0`.
- Keep the first release free, non-commercial, and compatible with Vercel Hobby.
- Preserve the legacy `information.json` behavior in the archived source and
  documentation only.
- Do not run or expose the legacy Express upload server.
- Do not add Supabase credentials or authentication behavior in this phase.
- Raw user-authored HTML, JavaScript, and CSS remain unsupported.
- Use exact dependency versions in `package.json` and commit `package-lock.json`.
- Every task ends with lint, type, focused test, or build evidence appropriate to its deliverable.

---

## File Structure

### Legacy reference

- `legacy/client/src/**`: archived CRA source used only to understand migration behavior.
- `legacy/client/public/**`: archived CRA public assets.
- `legacy/server/**`: archived Express server; excluded from lint, build, and deployment.
- `docs/legacy-behavior.md`: explicit behavior inventory and retirement conditions.

### Runtime

- `src/app/layout.tsx`: root document metadata, fonts, and application shell.
- `src/app/page.tsx`: free-beta landing page composition.
- `src/app/globals.css`: Tailwind import, theme tokens, base styles, and poster utilities.
- `src/components/landing/hero.tsx`: accessible bold-poster hero.
- `src/components/landing/use-cases.tsx`: store, event, and meeting use-case cards.
- `src/lib/env/schema.ts`: pure environment schema and parser.
- `src/lib/env/server.ts`: cached server environment accessor.
- `src/lib/security/policy.ts`: nonce-aware CSP and immutable static headers.
- `src/proxy.ts`: per-request CSP nonce boundary for Next.js-generated scripts.

### Configuration and verification

- `package.json` and `package-lock.json`: exact runtime and tooling versions.
- `.nvmrc`: Node major used locally and on CI.
- `tsconfig.json`: strict TypeScript and `@/*` alias.
- `next.config.ts`: security headers and safe Next.js defaults.
- `postcss.config.mjs`: Tailwind PostCSS integration.
- `eslint.config.mjs`: Next.js core-web-vitals and TypeScript flat configuration.
- `vitest.config.ts`: jsdom test environment and source alias.
- `vitest.setup.ts`: Testing Library DOM matchers and cleanup.
- `playwright.config.ts`: local web server and Chromium smoke configuration.
- `.github/workflows/ci.yml`: install, lint, typecheck, test, build, audit, and E2E jobs.
- `.env.example`: documented non-secret application URL.
- `tests/e2e/landing.spec.ts`: deployed-surface smoke test.

---

### Task 1: Archive and characterize the legacy prototype

**Files:**
- Move: `src/**` → `legacy/client/src/**`
- Move: `public/**` → `legacy/client/public/**`
- Move: `server/**` → `legacy/server/**`
- Create: `docs/legacy-behavior.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the approved design and modern-foundation plan commits.
- Produces: archived sources that no runtime script references.

- [ ] **Step 1: Record the current tracked-file baseline**

Run:

```bash
git status --short
git ls-files src public server > /tmp/informationboard-legacy-files.txt
wc -l /tmp/informationboard-legacy-files.txt
```

Expected: the worktree is clean and the legacy file count is non-zero.

- [ ] **Step 2: Move the legacy sources without deleting history**

Run:

```bash
mkdir -p legacy/client
git mv src legacy/client/src
git mv public legacy/client/public
git mv server legacy/server
```

Expected: Git records renames rather than delete-and-recreate changes.

- [ ] **Step 3: Document exactly what is being preserved and retired**

Create `docs/legacy-behavior.md`:

```markdown
# Legacy prototype behavior

The 2019 application:

1. edits Markdown in a textarea and renders a live preview;
2. accepts a URL string and renders a QR data URL;
3. exports `{ "md": string, "qr": string }` as `information.json`;
4. uploads that JSON to an Express endpoint and reloads the two fields;
5. enters a fullscreen preview.

The archived Express server is unsafe for public use because it stores the
original filename in a public directory and parses uploaded JSON without schema
or size validation. It must never be started or deployed.

The archive may be removed only after the legacy behavior inventory is retained
and automated tests cover safe Markdown preview, QR creation from a stable board
URL, and the new attachment flow.
```

- [ ] **Step 4: Exclude generated modern tooling without hiding the archive**

Append to `.gitignore`:

```gitignore
# Next.js
/.next/
/out/
/test-results/
/playwright-report/
*.tsbuildinfo

# Local environment
.env
.env.*
!.env.example
```

Keep the existing `/.superpowers/` entry.

- [ ] **Step 4: Verify the archive**

Run:

```bash
test -f legacy/client/src/App.js
test -f legacy/server/app.js
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the characterized archive**

```bash
git add .gitignore legacy docs/legacy-behavior.md
git commit -m "chore: archive legacy prototype"
```

---

### Task 2: Establish the Next.js TypeScript and test toolchain

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `.nvmrc`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: archived legacy tree from Task 1.
- Produces: npm scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:run`, and `audit`; React root page with accessible heading `InformationBoard`.

- [ ] **Step 1: Replace the old manifest with exact modern dependencies**

Write `package.json`:

```json
{
  "name": "informationboard",
  "version": "0.2.0",
  "private": true,
  "overrides": {
    "postcss": "8.5.23",
    "sharp": "0.35.3"
  },
  "engines": {
    "node": ">=20.9.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "audit": "npm audit --audit-level=high"
  },
  "dependencies": {
    "next": "16.2.12",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "server-only": "0.0.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@next/eslint-plugin-next": "16.2.12",
    "@tailwindcss/postcss": "4.3.3",
    "@testing-library/jest-dom": "7.0.0",
    "@testing-library/react": "16.3.2",
    "@types/node": "26.1.2",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.4",
    "eslint": "10.8.0",
    "jsdom": "29.1.1",
    "tailwindcss": "4.3.3",
    "typescript": "6.0.3",
    "typescript-eslint": "8.65.0",
    "vitest": "4.1.10"
  }
}
```

Write `.nvmrc`:

```text
24
```

- [ ] **Step 2: Install and lock the dependency graph**

Run:

```bash
npm install
```

Expected: npm creates lockfile version 3 and installs without peer dependency
errors.

- [ ] **Step 3: Configure strict TypeScript, Next.js, Tailwind, ESLint, and Vitest**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules", "legacy"]
}
```

Write `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Write `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
```

Write `postcss.config.mjs`:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

Write `eslint.config.mjs`:

```js
import eslint from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  globalIgnores(["legacy/**", ".next/**", "coverage/**", "playwright-report/**"]),
]);
```

Write `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

Write `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
```

- [ ] **Step 4: Write the failing root-page test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import HomePage from "./page";

it("introduces InformationBoard as a free beta", () => {
  render(<HomePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: "InformationBoard" }),
  ).toBeInTheDocument();
  expect(screen.getByText("무료 베타")).toBeInTheDocument();
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/app/page.test.tsx
```

Expected: FAIL because `src/app/page.tsx` does not exist.

- [ ] **Step 6: Add the minimal Next.js root**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "InformationBoard",
  description: "매장, 행사, 모임 안내를 만들고 QR로 공유하세요.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main>
      <p>무료 베타</p>
      <h1>InformationBoard</h1>
    </main>
  );
}
```

Create `src/app/globals.css`:

```css
@import "tailwindcss";

:root {
  color-scheme: light;
  --background: #f7f3ea;
  --foreground: #171717;
  --accent: #ff5b35;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 7: Verify the toolchain**

Run:

```bash
npm run test:run -- src/app/page.test.tsx
npm run lint
npm run typecheck
npm run build
```

Expected: all four commands pass; Next.js builds `/` successfully.

- [ ] **Step 8: Commit the foundation**

```bash
git add package.json package-lock.json .nvmrc tsconfig.json next-env.d.ts next.config.ts postcss.config.mjs eslint.config.mjs vitest.config.ts vitest.setup.ts src/app
git commit -m "build: establish nextjs foundation"
```

---

### Task 3: Validate environment configuration

**Files:**
- Create: `.env.example`
- Create: `src/lib/env/schema.ts`
- Create: `src/lib/env/schema.test.ts`
- Create: `src/lib/env/server.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: Zod 4.4.3 from Task 2.
- Produces: `parseAppEnv(source: Record<string, string | undefined>): AppEnv`; `getServerEnv(): AppEnv`; `AppEnv.NEXT_PUBLIC_APP_URL` as a normalized URL string.

- [ ] **Step 1: Write the failing environment-schema tests**

Create `src/lib/env/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAppEnv } from "./schema";

describe("parseAppEnv", () => {
  it("accepts and normalizes an http application URL", () => {
    expect(
      parseAppEnv({ NEXT_PUBLIC_APP_URL: "http://localhost:3000/" }),
    ).toEqual({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
  });

  it("rejects a missing application URL", () => {
    expect(() => parseAppEnv({})).toThrow(
      "NEXT_PUBLIC_APP_URL: Invalid input: expected string",
    );
  });

  it("rejects non-http protocols", () => {
    expect(() =>
      parseAppEnv({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" }),
    ).toThrow("NEXT_PUBLIC_APP_URL: URL must use http or https");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/lib/env/schema.test.ts
```

Expected: FAIL because `./schema` does not exist.

- [ ] **Step 3: Implement the pure parser and server accessor**

Create `src/lib/env/schema.ts`:

```ts
import { z } from "zod";

const httpUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "URL must use http or https",
  })
  .transform((value) => value.replace(/\/$/, ""));

const appEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: httpUrl,
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(
  source: Record<string, string | undefined>,
): AppEnv {
  const result = appEnvSchema.safeParse(source);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${message}`);
  }

  return result.data;
}
```

Create `src/lib/env/server.ts`:

```ts
import "server-only";
import { cache } from "react";
import { parseAppEnv } from "./schema";

export const getServerEnv = cache(() =>
  parseAppEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  }),
);
```

Create `.env.example`:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Use validated origin for canonical metadata**

Modify `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerEnv } from "@/lib/env/server";
import "./globals.css";

export function generateMetadata(): Metadata {
  const env = getServerEnv();

  return {
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
    title: "InformationBoard",
    description: "매장, 행사, 모임 안내를 만들고 QR로 공유하세요.",
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Verify the parser and build-time contract**

Run:

```bash
npm run test:run -- src/lib/env/schema.test.ts
NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run build
```

Expected: tests pass and the build succeeds with a validated metadata base.

- [ ] **Step 6: Commit environment validation**

```bash
git add .env.example src/lib/env src/app/layout.tsx
git commit -m "feat: validate application environment"
```

---

### Task 4: Add and verify application security headers

**Files:**
- Create: `src/lib/security/policy.ts`
- Create: `src/lib/security/policy.test.ts`
- Create: `src/proxy.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: Next.js configuration from Task 2.
- Produces: `buildContentSecurityPolicy(nonce: string): string`;
  `STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }>`;
  request-specific CSP nonce applied by `proxy(request: NextRequest)`.

- [ ] **Step 1: Write the failing header-policy test**

Create `src/lib/security/policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  STATIC_SECURITY_HEADERS,
} from "./policy";

describe("security policy", () => {
  it("sets the required static browser security policies", () => {
    expect(
      Object.fromEntries(
        STATIC_SECURITY_HEADERS.map(({ key, value }) => [key, value]),
      ),
    ).toMatchObject({
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": expect.stringContaining("camera=()"),
    });
  });

  it("requires the request nonce for scripts", () => {
    const csp = buildContentSecurityPolicy("abc123");

    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/lib/security/policy.test.ts
```

Expected: FAIL because `./policy` does not exist.

- [ ] **Step 3: Implement the nonce-aware policy**

Create `src/lib/security/policy.ts`:

```ts
export function buildContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}

export const STATIC_SECURITY_HEADERS = Object.freeze([
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
]);
```

Create `src/proxy.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/security/policy";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
```

Modify `next.config.ts`:

```ts
import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security/policy";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [{ source: "/(.*)", headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Verify policy and production configuration**

Run:

```bash
npm run test:run -- src/lib/security/policy.test.ts
NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run build
```

Expected: tests pass and Next.js accepts `proxy.ts` plus the static-header
configuration without CSP warnings.

- [ ] **Step 5: Commit security headers**

```bash
git add next.config.ts src/proxy.ts src/lib/security
git commit -m "security: add baseline response headers"
```

---

### Task 5: Build the approved bold-poster landing experience

**Files:**
- Create: `src/components/landing/hero.tsx`
- Create: `src/components/landing/use-cases.tsx`
- Create: `src/components/landing/hero.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: root app and design tokens from Task 2.
- Produces: `Hero()` and `UseCases()` server components; landing links to `/login` and `#examples`.

- [ ] **Step 1: Write failing behavior tests for the landing page**

Create `src/components/landing/hero.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Hero } from "./hero";

it("offers one clear sign-in action and beta status", () => {
  render(<Hero />);

  expect(screen.getByText("무료 베타")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "무료로 안내판 만들기" }),
  ).toHaveAttribute("href", "/login");
});
```

Replace `src/app/page.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import HomePage from "./page";

it("presents the three approved use cases", () => {
  render(<HomePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: /한 번 만들고/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "매장 안내" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "행사 안내" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "모임 안내" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm run test:run -- src/components/landing/hero.test.tsx src/app/page.test.tsx
```

Expected: FAIL because `Hero`, the new heading, and use-case headings do not
exist.

- [ ] **Step 3: Implement focused landing components**

Create `src/components/landing/hero.tsx`:

```tsx
import Link from "next/link";

export function Hero() {
  return (
    <section className="poster-hero" aria-labelledby="hero-title">
      <div className="poster-orb" aria-hidden="true" />
      <p className="poster-kicker">무료 베타 · INFORMATION FOR EVERYONE</p>
      <h1 id="hero-title">
        <span className="poster-title-line">
          <span className="poster-title-chunk">한 번 만들고,</span>
        </span>
        <span className="poster-title-line">
          <span className="poster-title-chunk">QR로 바로</span>{" "}
          <span className="poster-title-chunk">알리세요.</span>
        </span>
      </h1>
      <p className="poster-summary">
        매장, 행사, 모임 안내를 보기 좋게 만들고 링크와 QR로 공유하세요.
      </p>
      <div className="poster-actions">
        <Link className="primary-action" href="/login">
          무료로 안내판 만들기
        </Link>
        <a className="text-action" href="#examples">
          활용 예시 보기
        </a>
      </div>
    </section>
  );
}
```

Create `src/components/landing/use-cases.tsx`:

```tsx
const useCases = [
  ["01", "매장 안내", "영업시간, 위치, 이용 방법을 한 화면에"],
  ["02", "행사 안내", "일정, 장소, 준비물을 강한 포스터로"],
  ["03", "모임 안내", "참여자에게 필요한 내용을 빠짐없이"],
] as const;

export function UseCases() {
  return (
    <section id="examples" className="use-cases" aria-labelledby="examples-title">
      <p className="section-kicker">USE CASES</p>
      <h2 id="examples-title">필요한 안내를 선명하게</h2>
      <div className="use-case-grid">
        {useCases.map(([number, title, description]) => (
          <article key={title} className="use-case">
            <span aria-hidden="true">{number}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
```

Replace `src/app/page.tsx`:

```tsx
import { Hero } from "@/components/landing/hero";
import { UseCases } from "@/components/landing/use-cases";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <UseCases />
    </main>
  );
}
```

- [ ] **Step 4: Add responsive theme tokens and poster layout**

Extend `src/app/globals.css` with focused styles:

```css
:root {
  --background: #f7f3ea;
  --foreground: #171717;
  --accent: #ff5b35;
  --accent-soft: #ffb59f;
  --line: color-mix(in srgb, var(--foreground) 18%, transparent);
}

a {
  color: inherit;
}

.poster-hero {
  position: relative;
  min-height: 42rem;
  overflow: hidden;
  padding: clamp(1.25rem, 4vw, 4rem);
  border-bottom: 1px solid var(--line);
}

.poster-orb {
  position: absolute;
  top: -8rem;
  right: -7rem;
  width: clamp(18rem, 48vw, 42rem);
  aspect-ratio: 1;
  border-radius: 999px;
  background: var(--accent-soft);
}

.poster-kicker,
.section-kicker {
  position: relative;
  display: inline-block;
  margin: 0;
  padding: 0.45rem 0.65rem;
  background: var(--foreground);
  color: var(--background);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.poster-hero h1 {
  position: relative;
  max-width: 16ch;
  margin: clamp(5rem, 12vw, 9rem) 0 1.5rem;
  font-size: clamp(3.2rem, 9.2vw, 7.3rem);
  line-height: 0.92;
  letter-spacing: -0.07em;
}

.poster-title-line {
  display: block;
}

.poster-title-chunk {
  white-space: nowrap;
}

.poster-summary {
  position: relative;
  max-width: 34rem;
  font-size: clamp(1rem, 2.2vw, 1.35rem);
  word-break: keep-all;
}

.poster-actions {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;
}

.primary-action {
  padding: 0.9rem 1.1rem;
  background: var(--foreground);
  color: var(--background);
  text-decoration: none;
}

.text-action {
  text-underline-offset: 0.25rem;
}

.use-cases {
  padding: clamp(3rem, 8vw, 7rem) clamp(1.25rem, 4vw, 4rem);
}

.use-cases h2 {
  max-width: 12ch;
  margin: 2rem 0;
  font-size: clamp(2.25rem, 6vw, 5rem);
  line-height: 1;
  letter-spacing: -0.05em;
  word-break: keep-all;
}

.use-case-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--line);
}

.use-case {
  padding: 1.5rem 1rem 1.5rem 0;
  border-bottom: 1px solid var(--line);
}

.use-case h3 {
  margin: 2.5rem 0 0.5rem;
  font-size: 1.5rem;
}

.use-case p {
  max-width: 20rem;
  word-break: keep-all;
}

@media (max-width: 42rem) {
  .poster-hero {
    min-height: 38rem;
  }

  .use-case-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Verify component behavior, types, and build**

Run:

```bash
npm run test:run -- src/components/landing/hero.test.tsx src/app/page.test.tsx
npm run lint
npm run typecheck
NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run build
```

Expected: all commands pass and `/` is a generated route.

- [ ] **Step 6: Commit the approved landing direction**

```bash
git add src/app src/components/landing
git commit -m "feat: add bold poster landing page"
```

---

### Task 6: Add browser smoke coverage and continuous integration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/landing.spec.ts`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: working landing page, validated environment, and all quality scripts.
- Produces: npm scripts `test:e2e` and `verify`; CI workflow on pushes and pull requests.

- [ ] **Step 1: Install the pinned Playwright test runner**

Run:

```bash
npm install --save-dev --save-exact @playwright/test@1.62.0
```

Expected: `package.json` and `package-lock.json` record exactly `1.62.0`.

- [ ] **Step 2: Write the failing browser smoke test**

Create `tests/e2e/landing.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("landing page introduces the beta and primary action", async ({ page }) => {
  const response = await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /한 번 만들고/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "무료로 안내판 만들기" }),
  ).toHaveAttribute("href", "/login");
  await expect(page.getByText("무료 베타")).toBeVisible();
  expect(response?.headers()["content-security-policy"]).toContain("nonce-");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
});

test("landing page remains usable without horizontal overflow on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /한 번 만들고/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "무료로 안내판 만들기" }),
  ).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
```

Run:

```bash
npx playwright test tests/e2e/landing.spec.ts
```

Expected: FAIL because Playwright has no web-server configuration.

- [ ] **Step 3: Configure the local browser test server**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    env: { NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000" },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "verify": "npm run lint && npm run typecheck && npm run test:run && npm run build"
  }
}
```

- [ ] **Step 4: Install Chromium and verify the smoke test**

Run:

```bash
npx playwright install chromium
npm run test:e2e -- tests/e2e/landing.spec.ts
```

Expected: two Chromium tests pass.

- [ ] **Step 5: Add CI quality gates**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

env:
  NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:run
      - run: npm run build
      - run: npm audit --audit-level=high

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 6: Replace the prototype README with verified setup instructions**

Create `README.md`:

```markdown
# InformationBoard

InformationBoard is a free-beta service for creating store, event, and meeting
guides and sharing them through a stable link or QR code.

## Requirements

- Node.js 20.9 or newer; Node.js 24 is used in CI.
- npm.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Run `npm ci`.
3. Run `npm run dev`.
4. Open <http://localhost:3000>.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run build`
- `npm run test:e2e`
- `npm audit --audit-level=high`

The archived 2019 prototype lives under `legacy/` and must not be deployed.
```

- [ ] **Step 7: Run the complete phase verification**

Run:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run verify
npm run test:e2e
npm audit --audit-level=high
git diff --check
git status --short
```

Expected:

- lint, type checking, all unit/component tests, build, and E2E pass;
- npm reports zero high or critical production vulnerabilities;
- whitespace check passes;
- status contains only the intended Task 7 changes.

- [ ] **Step 8: Commit CI and browser verification**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e .github/workflows/ci.yml README.md
git commit -m "ci: verify modern application foundation"
```

---

## Phase 1 Completion Check

Run from a clean checkout:

```bash
npm ci
NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run verify
npm run test:e2e
npm audit --audit-level=high
git status --short
```

The phase is complete only when every command passes, the worktree is clean,
the legacy Express server has no root npm script, and the landing page matches
the approved bold-poster direction at desktop and mobile widths.
