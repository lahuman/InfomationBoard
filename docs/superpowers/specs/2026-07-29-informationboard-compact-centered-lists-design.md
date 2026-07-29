# Compact Centered Markdown Lists Design

## Context

InformationBoard renders authored Markdown in editor previews and published
boards through `BoardMarkdown`. A list item that contains a blank line is a
Markdown "loose list" item, so `react-markdown` wraps its text in a block-level
`p` element. The current centered-list rule uses
`list-style-position: inside`. The marker occupies the first inline line while
the block paragraph begins on the next line, leaving the number or bullet above
its text. Default paragraph and nested-list margins also make related lines,
such as a program name and its cost, appear too far apart.

## Approved Behavior

- Centered lists keep each number or bullet on the same line as its first text.
- The complete list remains centered, including its visible markers.
- A nested cost list sits close to its parent program item, with a `0.35rem`
  block margin.
- Left- and right-aligned lists retain their existing marker types and overall
  alignment behavior.
- Markdown source and semantic list structure remain unchanged.
- Multi-paragraph list items remain readable and do not collapse all paragraphs
  into one inline run.

## Implementation Design

Keep the renderer and saved Markdown unchanged. Normalize only the presentation
of list-item children in `src/app/globals.css`:

1. Render the first direct paragraph child of a list item inline. This allows an
   inside marker and the first text to share one line, including for loose lists.
2. Remove the first paragraph's block margin so blank Markdown lines do not add
   unintended vertical space.
3. Give direct nested lists a compact block margin while preserving their
   indentation and marker type.
4. Leave later paragraphs block-level so genuinely multi-paragraph list items
   retain visual separation.

The existing centered-list `fit-content` container and inside marker strategy
remain in place. Keeping the marker inside the centered content box centers the
marker and text together and avoids renderer-specific markup or pseudo-markers.

## Testing

Add a regression case based on the reported Markdown:

```markdown
1. 얼굴 브로치 만들기

   - 비용 - 15,000 원

2. 종이로 만드는 어린이 집

   - 비용 : 15,000 원

3. 8월 1일 전시 연계 프로그램 진행
```

The component test will confirm that the source produces the expected nested,
semantic list structure. The browser test will verify that, under centered
alignment, each first paragraph computes to inline display and the nested list
uses the compact margin. Existing list marker and alignment checks remain as
regression coverage.

## Scope

This change affects Markdown list presentation only. It does not alter the rich
text editor's document model, Markdown serialization, board data, unrelated
typography, or non-list paragraph spacing.
