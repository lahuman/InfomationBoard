# InformationBoard Sample Board Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let landing-page visitors open complete store, event, and meeting sample boards that use the same visual presentation as published boards without authentication or Supabase.

**Architecture:** A typed, static catalogue is the single source for landing cards and example routes. The existing public-board view exposes its board sheet as a focused reusable component, while `/examples/[slug]` supplies sample-specific navigation, metadata, and not-found handling around that shared presentation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, React Markdown, Vitest, Testing Library, Playwright, CSS.

## Global Constraints

- Keep the existing `#examples` landing destination and the three approved use cases.
- Use stable routes `/examples/cafe-guide`, `/examples/summer-festival`, and `/examples/book-club`.
- Render complete static Korean sample data without authentication, Supabase, runtime fetches, or production-derived records.
- Reuse the same board sheet, theme classes, and safe Markdown renderer as `/b/[slug]`.
- Identify example pages as samples; never label them as live published boards.
- Every sample page links to `/login` and `/#examples` and is non-indexable.
- Unknown slugs call `notFound()` and never fall back to another sample.
- Preserve the current public-board route markup and behavior.
- Do not add dependencies, QR codes, analytics, editing, or cloning behavior.

## File Structure

- Create `src/features/boards/examples/sample-boards.ts`: typed catalogue, stable slugs, and lookup API.
- Create `src/features/boards/examples/sample-boards.test.ts`: catalogue completeness and lookup tests.
- Create `src/features/boards/examples/sample-board-page.tsx`: sample navigation plus shared board sheet.
- Create `src/features/boards/examples/sample-board-page.test.tsx`: sample label and CTA tests.
- Create `src/app/examples/[slug]/page.tsx`: static params, metadata, lookup, and not-found route boundary.
- Create `src/app/examples/[slug]/page.test.tsx`: route, metadata, and invalid-slug tests.
- Modify `src/features/boards/public/public-board-view.tsx`: export a reusable `PublicBoardSheet` while retaining live chrome.
- Modify `src/features/boards/public/public-board-view.test.tsx`: protect both reusable sheet and live publication chrome.
- Modify `src/components/landing/use-cases.tsx`: render catalogue-driven linked cards.
- Modify `src/app/page.test.tsx`: assert the three sample destinations.
- Modify `src/app/globals.css`: linked-card affordance and responsive sample navigation.
- Modify `tests/e2e/landing.spec.ts`: browser journey and mobile overflow coverage.

---

### Task 1: Typed Static Sample Catalogue

**Files:**
- Create: `src/features/boards/examples/sample-boards.ts`
- Create: `src/features/boards/examples/sample-boards.test.ts`

**Interfaces:**
- Consumes: `PublicBoard` from `@/features/boards/public/public-board`.
- Produces: `SampleBoardSlug`, `SampleBoard`, `SAMPLE_BOARDS`, `SAMPLE_BOARD_SLUGS`, and `getSampleBoard(slug: string): SampleBoard | null`.

- [ ] **Step 1: Write the failing catalogue tests**

```ts
import { describe, expect, it } from "vitest";
import {
  SAMPLE_BOARDS,
  SAMPLE_BOARD_SLUGS,
  getSampleBoard,
} from "./sample-boards";

describe("sample board catalogue", () => {
  it("provides the three ordered landing examples", () => {
    expect(SAMPLE_BOARDS.map(({ number, label, slug }) => ({ number, label, slug }))).toEqual([
      { number: "01", label: "매장 안내", slug: "cafe-guide" },
      { number: "02", label: "행사 안내", slug: "summer-festival" },
      { number: "03", label: "모임 안내", slug: "book-club" },
    ]);
    expect(SAMPLE_BOARD_SLUGS).toEqual([
      "cafe-guide",
      "summer-festival",
      "book-club",
    ]);
  });

  it("resolves known samples and rejects unknown slugs", () => {
    expect(getSampleBoard("summer-festival")?.board.title).toBe("한강 여름 음악 축제");
    expect(getSampleBoard("missing-example")).toBeNull();
  });

  it("contains complete non-indexable boards with distinct themes", () => {
    expect(SAMPLE_BOARDS.map(({ board }) => board.theme.palette)).toEqual([
      "lime",
      "coral",
      "blue",
    ]);
    for (const { board } of SAMPLE_BOARDS) {
      expect(board.title.length).toBeGreaterThan(0);
      expect(board.summary.length).toBeGreaterThan(0);
      expect(board.contentMarkdown).toContain("## ");
      expect(board.allowIndexing).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm run test:run -- src/features/boards/examples/sample-boards.test.ts`

Expected: FAIL because `./sample-boards` does not exist.

- [ ] **Step 3: Implement the static catalogue**

Create the declared types and constants. Use this public shape:

```ts
import type { PublicBoard } from "../public/public-board";

export type SampleBoardSlug =
  | "cafe-guide"
  | "summer-festival"
  | "book-club";

export type SampleBoard = {
  number: "01" | "02" | "03";
  slug: SampleBoardSlug;
  label: string;
  description: string;
  board: PublicBoard;
};

export const SAMPLE_BOARD_SLUGS = SAMPLE_BOARDS.map(({ slug }) => slug);

export function getSampleBoard(slug: string): SampleBoard | null {
  return SAMPLE_BOARDS.find((sample) => sample.slug === slug) ?? null;
}
```

Declare `SAMPLE_BOARDS` between `SampleBoard` and `SAMPLE_BOARD_SLUGS` as an
array containing the three objects specified next, followed by
`as const satisfies readonly SampleBoard[]`. Use deterministic UUIDs
`40000000-0000-4000-8000-000000000001`,
`40000000-0000-4000-8000-000000000002`, and
`40000000-0000-4000-8000-000000000003`, plus
`updatedAt: "2026-07-29T00:00:00.000Z"` and
`publishedAt: "2026-07-29T00:00:00.000Z"`. The board slugs equal the sample
slugs and `allowIndexing` is `false` for all entries.

Use these exact presentation values:

```ts
{
  number: "01",
  slug: "cafe-guide",
  label: "매장 안내",
  description: "영업시간, 위치, 이용 방법을 한 화면에",
  board: {
    title: "파도책방 카페 이용 안내",
    summary: "책과 커피를 천천히 즐기는 작은 동네 공간입니다.",
    template: "store",
    theme: { palette: "lime", density: "comfortable", alignment: "left" },
    contentMarkdown: `## 영업시간\n\n- 화–금: 11:00–20:00\n- 토–일: 10:00–21:00\n- 월요일: 정기 휴무\n\n## 오시는 길\n\n서울 마포구 성미산로 12길 8, 1층\n\n홍대입구역 3번 출구에서 도보 8분 거리입니다.\n\n## 이용 안내\n\n- 모든 좌석에서 무료 Wi-Fi를 이용할 수 있습니다.\n- 조용한 독서를 위해 통화는 입구 앞에서 부탁드립니다.\n- 반려동물은 이동 가방 안에서 함께할 수 있습니다.\n\n## 문의\n\n[인스타그램에서 새 소식 보기](https://www.instagram.com/)`,
  },
}
```

```ts
{
  number: "02",
  slug: "summer-festival",
  label: "행사 안내",
  description: "일정, 장소, 준비물을 강한 포스터로",
  board: {
    title: "한강 여름 음악 축제",
    summary: "노을이 지는 강변에서 만나는 음악과 여름밤의 맛.",
    template: "event",
    theme: { palette: "coral", density: "comfortable", alignment: "left" },
    contentMarkdown: `## 일정과 장소\n\n- 날짜: 2026년 8월 15일 토요일\n- 시간: 오후 4시–9시\n- 장소: 여의도 한강공원 물빛무대\n\n## 프로그램\n\n1. 16:00 로컬 마켓 오픈\n2. 18:00 어쿠스틱 라이브\n3. 20:00 여름밤 헤드라이너 공연\n\n## 오시는 길\n\n대중교통 이용을 권장합니다. 여의나루역 2번 출구에서 안내 표지를 따라오세요.\n\n## 비가 올 때\n\n우천 시 프로그램은 인근 실내 무대로 이동하며, 당일 정오에 안내판을 업데이트합니다.`,
  },
}
```

```ts
{
  number: "03",
  slug: "book-club",
  label: "모임 안내",
  description: "참여자에게 필요한 내용을 빠짐없이",
  board: {
    title: "퇴근 후 한 장 독서모임",
    summary: "읽은 문장 하나를 가져와 가볍게 이야기하는 저녁 모임입니다.",
    template: "meeting",
    theme: { palette: "blue", density: "compact", alignment: "center" },
    contentMarkdown: `## 이번 모임\n\n- 일시: 2026년 8월 20일 목요일 오후 7시 30분\n- 장소: 파도책방 커뮤니티 테이블\n- 정원: 8명\n\n## 함께 나눌 것\n\n1. 이번 달에 발견한 문장 한 줄\n2. 그 문장을 고른 이유\n3. 다음 달에 함께 읽고 싶은 책\n\n## 준비물\n\n책 전체를 읽지 않아도 괜찮습니다. 나누고 싶은 문장과 편안한 마음만 준비해 주세요.\n\n> 서로의 해석을 고치기보다 궁금해하고 질문합니다.`,
  },
}
```

Include each object's required `id`, `slug`, `updatedAt`, `publishedAt`, and
`allowIndexing` fields alongside the shown values.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm run test:run -- src/features/boards/examples/sample-boards.test.ts`

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit the catalogue**

```bash
git add src/features/boards/examples/sample-boards.ts src/features/boards/examples/sample-boards.test.ts
git commit -m "feat: add sample board catalogue"
```

### Task 2: Reusable Published Board Sheet

**Files:**
- Modify: `src/features/boards/public/public-board-view.tsx`
- Modify: `src/features/boards/public/public-board-view.test.tsx`

**Interfaces:**
- Consumes: existing `PublicBoard` and `BoardMarkdown`.
- Produces: `PublicBoardSheet({ board }: PublicBoardViewProps)` and unchanged `PublicBoardView({ board }: PublicBoardViewProps)`.

- [ ] **Step 1: Write the failing reusable-sheet test**

Update the import to include `PublicBoardSheet`, then add:

```tsx
it("renders the reusable board sheet without publication chrome", () => {
  render(<PublicBoardSheet board={board} />);

  expect(screen.getByRole("heading", { name: board.title, level: 1 })).toBeVisible();
  expect(screen.getByRole("heading", { name: "운영 시간", level: 2 })).toBeVisible();
  expect(screen.queryByText("공개 안내판")).not.toBeInTheDocument();
  expect(screen.queryByText("게시된 안내판")).not.toBeInTheDocument();
});
```

Extend the existing live-view test with:

```tsx
expect(screen.getByText("공개 안내판")).toBeVisible();
expect(screen.getByText("게시된 안내판")).toBeVisible();
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm run test:run -- src/features/boards/public/public-board-view.test.tsx`

Expected: FAIL because `PublicBoardSheet` is not exported.

- [ ] **Step 3: Extract the board sheet**

Move the existing `public-board-sheet` article—its `public-board-hero` header
and `BoardMarkdown` child—into this export:

```tsx
export function PublicBoardSheet({ board }: PublicBoardViewProps) {
  return (
    <article className="public-board-sheet">
      <header className="public-board-hero">
        <p className="public-board-kicker">{templateLabels[board.template]}</p>
        <h1>{board.title}</h1>
        {board.summary ? (
          <p className="public-board-summary" data-testid="public-board-summary">
            {board.summary}
          </p>
        ) : null}
      </header>
      <BoardMarkdown className="public-board-content" markdown={board.contentMarkdown} />
    </article>
  );
}
```

Replace the original article in `PublicBoardView` with
`<PublicBoardSheet board={board} />`. Do not change the live `<main>`, brand,
header, or published footer.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm run test:run -- src/features/boards/public/public-board-view.test.tsx`

Expected: all tests PASS.

- [ ] **Step 5: Commit the extraction**

```bash
git add src/features/boards/public/public-board-view.tsx src/features/boards/public/public-board-view.test.tsx
git commit -m "refactor: reuse public board sheet"
```

### Task 3: Static Example Page and Route

**Files:**
- Create: `src/features/boards/examples/sample-board-page.tsx`
- Create: `src/features/boards/examples/sample-board-page.test.tsx`
- Create: `src/app/examples/[slug]/page.tsx`
- Create: `src/app/examples/[slug]/page.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `SampleBoard`, `SAMPLE_BOARD_SLUGS`, `getSampleBoard`, and `PublicBoardSheet`.
- Produces: `SampleBoardPageView({ sample }: { sample: SampleBoard })`, `generateStaticParams()`, `generateMetadata({ params })`, and the default example page.

- [ ] **Step 1: Write the failing sample-view test**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SAMPLE_BOARDS } from "./sample-boards";
import { SampleBoardPageView } from "./sample-board-page";

it("labels the page as a sample and provides both next actions", () => {
  const sample = SAMPLE_BOARDS[0];
  render(<SampleBoardPageView sample={sample} />);

  expect(screen.getByText("활용 예시 · 매장 안내")).toBeVisible();
  expect(screen.getByRole("heading", { name: sample.board.title, level: 1 })).toBeVisible();
  expect(screen.getByRole("link", { name: "내 안내판 만들기" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "다른 예시 보기" })).toHaveAttribute("href", "/#examples");
  expect(screen.queryByText("게시된 안내판")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing route tests**

Mock only `next/navigation` and use the real catalogue:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExampleBoardPage, { generateMetadata, generateStaticParams } from "./page";

const mocks = vi.hoisted(() => ({ notFound: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

describe("ExampleBoardPage", () => {
  it("renders a known sample", async () => {
    render(await ExampleBoardPage({ params: Promise.resolve({ slug: "summer-festival" }) }));
    expect(screen.getByRole("heading", { name: "한강 여름 음악 축제", level: 1 })).toBeVisible();
  });

  it("returns not found for an unknown sample", async () => {
    mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
    await expect(ExampleBoardPage({ params: Promise.resolve({ slug: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("pre-renders all sample slugs", () => {
    expect(generateStaticParams()).toEqual([
      { slug: "cafe-guide" },
      { slug: "summer-festival" },
      { slug: "book-club" },
    ]);
  });

  it("creates non-indexable sample metadata", async () => {
    await expect(generateMetadata({ params: Promise.resolve({ slug: "book-club" }) })).resolves.toEqual({
      title: "퇴근 후 한 장 독서모임 · 활용 예시",
      description: "읽은 문장 하나를 가져와 가볍게 이야기하는 저녁 모임입니다.",
      robots: { index: false, follow: false },
    });
  });
});
```

- [ ] **Step 3: Run both tests and confirm RED**

Run: `npm run test:run -- src/features/boards/examples/sample-board-page.test.tsx 'src/app/examples/[slug]/page.test.tsx'`

Expected: FAIL because the view and route do not exist.

- [ ] **Step 4: Implement the sample view**

```tsx
import Link from "next/link";
import { PublicBoardSheet } from "../public/public-board-view";
import type { SampleBoard } from "./sample-boards";

export function SampleBoardPageView({ sample }: { sample: SampleBoard }) {
  const { board } = sample;
  return (
    <main className={`public-board-page sample-board-page theme-${board.theme.palette} density-${board.theme.density} align-${board.theme.alignment}`}>
      <nav className="sample-board-nav" aria-label="활용 예시 안내">
        <p>활용 예시 · {sample.label}</p>
        <div>
          <Link href="/#examples">다른 예시 보기</Link>
          <Link className="sample-board-primary-action" href="/login">내 안내판 만들기</Link>
        </div>
      </nav>
      <PublicBoardSheet board={board} />
    </main>
  );
}
```

- [ ] **Step 5: Implement the static route**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SampleBoardPageView } from "@/features/boards/examples/sample-board-page";
import { SAMPLE_BOARD_SLUGS, getSampleBoard } from "@/features/boards/examples/sample-boards";

type ExampleBoardPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return SAMPLE_BOARD_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ExampleBoardPageProps): Promise<Metadata> {
  const sample = getSampleBoard((await params).slug);
  if (!sample) return { title: "활용 예시를 찾을 수 없습니다", robots: { index: false, follow: false } };
  return {
    title: `${sample.board.title} · 활용 예시`,
    description: sample.board.summary,
    robots: { index: false, follow: false },
  };
}

export default async function ExampleBoardPage({ params }: ExampleBoardPageProps) {
  const sample = getSampleBoard((await params).slug);
  if (!sample) notFound();
  return <SampleBoardPageView sample={sample} />;
}
```

- [ ] **Step 6: Add responsive sample navigation styles**

Add adjacent to the public-board rules:

```css
.sample-board-nav {
  display: flex;
  min-height: 5.5rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--foreground);
  font-size: 0.75rem;
  font-weight: 800;
}

.sample-board-nav p { margin: 0; }
.sample-board-nav div { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.sample-board-nav a { text-underline-offset: 0.25rem; }
.sample-board-primary-action { padding: 0.7rem 0.85rem; background: var(--foreground); color: var(--public-surface); text-decoration: none; }
.sample-board-nav a:focus-visible { outline: 3px solid var(--public-accent); outline-offset: 3px; }
```

Within the existing `@media (max-width: 42rem)` block add:

```css
.sample-board-nav { align-items: flex-start; flex-direction: column; padding-block: 1rem; }
```

- [ ] **Step 7: Run both tests and confirm GREEN**

Run: `npm run test:run -- src/features/boards/examples/sample-board-page.test.tsx 'src/app/examples/[slug]/page.test.tsx'`

Expected: all tests PASS.

- [ ] **Step 8: Commit the example route**

```bash
git add src/features/boards/examples/sample-board-page.tsx src/features/boards/examples/sample-board-page.test.tsx 'src/app/examples/[slug]/page.tsx' 'src/app/examples/[slug]/page.test.tsx' src/app/globals.css
git commit -m "feat: add static sample board pages"
```

### Task 4: Catalogue-Driven Landing Cards

**Files:**
- Modify: `src/components/landing/use-cases.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `SAMPLE_BOARDS` from the catalogue.
- Produces: three semantic linked use-case cards with stable sample URLs.

- [ ] **Step 1: Write the failing landing-link assertions**

Append to the current page test:

```tsx
expect(screen.getByRole("link", { name: /매장 안내 샘플 보드 보기/ })).toHaveAttribute("href", "/examples/cafe-guide");
expect(screen.getByRole("link", { name: /행사 안내 샘플 보드 보기/ })).toHaveAttribute("href", "/examples/summer-festival");
expect(screen.getByRole("link", { name: /모임 안내 샘플 보드 보기/ })).toHaveAttribute("href", "/examples/book-club");
```

- [ ] **Step 2: Run the page test and confirm RED**

Run: `npm run test:run -- src/app/page.test.tsx`

Expected: FAIL because the use cases are not links.

- [ ] **Step 3: Render linked cards from the shared catalogue**

Replace the local tuple array with the shared catalogue and render:

```tsx
import Link from "next/link";
import { SAMPLE_BOARDS } from "@/features/boards/examples/sample-boards";

{SAMPLE_BOARDS.map(({ number, slug, label, description }) => (
  <article key={slug} className="use-case">
    <Link href={`/examples/${slug}`} aria-label={`${label} 샘플 보드 보기`}>
      <span aria-hidden="true">{number}</span>
      <h3>{label}</h3>
      <p>{description}</p>
      <span className="use-case-action" aria-hidden="true">샘플 보드 보기 →</span>
    </Link>
  </article>
))}
```

- [ ] **Step 4: Add card interaction styles**

Keep `.use-case` as the grid item and move its padding to the anchor:

```css
.use-case { border-bottom: 1px solid var(--line); }
.use-case > a { display: block; height: 100%; padding: 1.5rem 1rem 1.5rem 0; text-decoration: none; }
.use-case > a:hover .use-case-action { transform: translateX(0.25rem); }
.use-case > a:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
.use-case-action { display: inline-block; margin-top: 1rem; font-size: 0.78rem; font-weight: 800; text-decoration: underline; text-underline-offset: 0.25rem; transition: transform 150ms ease; }
@media (prefers-reduced-motion: reduce) { .use-case-action { transition: none; } }
```

- [ ] **Step 5: Run the page test and confirm GREEN**

Run: `npm run test:run -- src/app/page.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the landing integration**

```bash
git add src/components/landing/use-cases.tsx src/app/page.test.tsx src/app/globals.css
git commit -m "feat: link landing examples to sample boards"
```

### Task 5: Browser Journey and Full Verification

**Files:**
- Modify: `tests/e2e/landing.spec.ts`

**Interfaces:**
- Consumes: the completed landing links and `/examples/[slug]` route.
- Produces: browser evidence for navigation, responsive layout, and no horizontal overflow.

- [ ] **Step 1: Add the failing browser journey**

```ts
test("visitor opens a complete sample board from the landing page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /행사 안내 샘플 보드 보기/ }).click();

  await expect(page).toHaveURL(/\/examples\/summer-festival$/);
  await expect(page.getByText("활용 예시 · 행사 안내")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "한강 여름 음악 축제" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "프로그램" })).toBeVisible();
  await expect(page.getByRole("link", { name: "내 안내판 만들기" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "다른 예시 보기" })).toHaveAttribute("href", "/#examples");
});
```

Extend the mobile test after the landing assertions:

```ts
await page.getByRole("link", { name: /모임 안내 샘플 보드 보기/ }).click();
await expect(page.getByRole("heading", { level: 1, name: "퇴근 후 한 장 독서모임" })).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
```

- [ ] **Step 2: Run the landing browser spec**

Run: `npm run test:e2e -- tests/e2e/landing.spec.ts`

Expected: all landing tests PASS. If the first run is RED, fix only selectors or
responsive CSS defects demonstrated by the output, then rerun until GREEN.

- [ ] **Step 3: Run focused unit coverage together**

Run: `npm run test:run -- src/features/boards/examples src/features/boards/public/public-board-view.test.tsx src/app/page.test.tsx 'src/app/examples/[slug]/page.test.tsx'`

Expected: all focused tests PASS.

- [ ] **Step 4: Run repository verification**

Run: `npm run verify`

Expected: lint, TypeScript, all Vitest tests, production build, and client-secret
security check all exit 0.

- [ ] **Step 5: Inspect desktop and mobile screenshots**

Start the existing dev server with `npm run dev`, open `/` and
`/examples/summer-festival` at 1440×900, then open
`/examples/book-club` at 390×844. Confirm:

- all card content is readable and the action is visibly interactive;
- sample status and both CTA links are visible;
- the sample board uses the expected palette and real board typography;
- no content is clipped and there is no horizontal overflow.

- [ ] **Step 6: Commit browser coverage and any verified CSS correction**

```bash
git add tests/e2e/landing.spec.ts src/app/globals.css
git commit -m "test: cover sample board visitor journey"
```
