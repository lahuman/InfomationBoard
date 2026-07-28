import { z } from "zod";

export const BOARD_TITLE_MAX_LENGTH = 120;
export const BOARD_SUMMARY_MAX_LENGTH = 300;
export const BOARD_MARKDOWN_MAX_LENGTH = 200_000;

export const boardTemplateSchema = z.enum(["store", "event", "meeting"]);

export const boardThemeSchema = z
  .object({
    palette: z.enum(["coral", "blue", "lime"]),
    density: z.enum(["compact", "comfortable"]),
    alignment: z.enum(["left", "center"]),
  })
  .strict();

const boardTitleSchema = z
  .string()
  .trim()
  .min(1, "제목을 입력해 주세요.")
  .max(
    BOARD_TITLE_MAX_LENGTH,
    `제목은 ${BOARD_TITLE_MAX_LENGTH}자 이하여야 합니다.`,
  );

const boardSummarySchema = z
  .string()
  .trim()
  .max(
    BOARD_SUMMARY_MAX_LENGTH,
    `요약은 ${BOARD_SUMMARY_MAX_LENGTH}자 이하여야 합니다.`,
  );

const boardMarkdownSchema = z
  .string()
  .max(
    BOARD_MARKDOWN_MAX_LENGTH,
    `본문은 ${BOARD_MARKDOWN_MAX_LENGTH}자 이하여야 합니다.`,
  );

export const boardDraftSchema = z
  .object({
    title: boardTitleSchema,
    summary: boardSummarySchema,
    contentMarkdown: boardMarkdownSchema,
    template: boardTemplateSchema,
    theme: boardThemeSchema,
  })
  .strict();

export const createBoardInputSchema = z
  .object({
    template: boardTemplateSchema,
  })
  .strict();

export const updateBoardInputSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    title: boardTitleSchema,
    summary: boardSummarySchema,
    contentMarkdown: boardMarkdownSchema,
    theme: boardThemeSchema,
  })
  .strict();

export type BoardTemplate = z.infer<typeof boardTemplateSchema>;
export type BoardTheme = z.infer<typeof boardThemeSchema>;
export type BoardDraft = z.infer<typeof boardDraftSchema>;
export type CreateBoardInput = z.infer<typeof createBoardInputSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardInputSchema>;

