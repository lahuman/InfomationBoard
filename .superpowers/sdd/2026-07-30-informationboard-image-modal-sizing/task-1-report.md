# Task 1 Report: Define and Render the Image Width Contract

## Implementation

- Added the shared `ImageWidth` contract: a readonly `[25, 50, 75, 100]` allowlist, default width `100`, exact title parser, serializer, and class-name mapper.
- Updated Markdown image rendering to normalize the Markdown `title`, apply the resulting width class, and omit the HTML `title` attribute.
- Added explicit CSS width selectors for 25%, 50%, 75%, and 100% board Markdown images.

## Files Changed

- `src/features/boards/images/presentation.ts`
- `src/features/boards/images/presentation.test.ts`
- `src/features/boards/markdown/board-markdown.tsx`
- `src/features/boards/markdown/board-markdown.test.tsx`
- `src/app/globals.css`

## RED Verification

Command:

```bash
npm run test:run -- src/features/boards/images/presentation.test.ts src/features/boards/markdown/board-markdown.test.tsx
```

Result: failed as expected. `presentation.test.ts` could not resolve `./presentation`, and the two new renderer tests failed because images had no width classes. This demonstrated the tests exercised the missing width contract and renderer behavior rather than an unrelated failure. The pre-existing Node `--localstorage-file` warning was also emitted.

## GREEN Verification

Command:

```bash
npm run test:run -- src/features/boards/images/presentation.test.ts src/features/boards/markdown/board-markdown.test.tsx
git diff --check
```

Result: passed — 2 test files and 20 tests passed; `git diff --check` had no output. The pre-existing Node warning remained.

## Full Suite

Command:

```bash
npm run test:run
```

Result: passed — 70 test files and 411 tests passed. The known pre-existing Node `--localstorage-file` warning was emitted by test workers.

## Self-Review

- The parser regex is exact, so unlisted widths and compound titles default to 100.
- The renderer consumes the title only as the width control and does not expose it as an HTML tooltip.
- The test suite covers both the shared contract and rendered DOM behavior, including an invalid-title fallback.
- CSS uses explicit allowlisted selectors, so arbitrary title input cannot determine a CSS class or width.

## Concerns

None. The unchanged Node `--localstorage-file` warning is a known baseline condition.
