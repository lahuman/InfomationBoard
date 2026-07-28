import { z } from "zod";

export const BOARD_TITLE_MAX_LENGTH = 120;
export const BOARD_SUMMARY_MAX_LENGTH = 300;
export const BOARD_MARKDOWN_MAX_LENGTH = 200_000;
export const BOARD_PASSWORD_MIN_LENGTH = 8;
export const BOARD_PASSWORD_MAX_LENGTH = 128;

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

export const editorDraftSchema = boardDraftSchema
  .omit({ template: true })
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

const publicationIdentityFields = {
  id: z.uuid(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
};

const boardPasswordSchema = z.string().refine(
  (password) => {
    const length = Array.from(password).length;
    return (
      length >= BOARD_PASSWORD_MIN_LENGTH &&
      length <= BOARD_PASSWORD_MAX_LENGTH
    );
  },
  {
    message: `비밀번호는 ${BOARD_PASSWORD_MIN_LENGTH}자 이상 ${BOARD_PASSWORD_MAX_LENGTH}자 이하여야 합니다.`,
  },
);

export const publicPublicationInputSchema = z
  .object({
    ...publicationIdentityFields,
    mode: z.literal("public"),
    allowIndexing: z.boolean(),
  })
  .strict();

export const passwordPublicationInputSchema = z
  .object({
    ...publicationIdentityFields,
    mode: z.literal("password"),
    password: boardPasswordSchema,
  })
  .strict();

export const privateDraftPublicationInputSchema = z
  .object({
    ...publicationIdentityFields,
    mode: z.literal("private-draft"),
  })
  .strict();

export const publicationInputSchema = z.discriminatedUnion("mode", [
  publicPublicationInputSchema,
  passwordPublicationInputSchema,
  privateDraftPublicationInputSchema,
]);

export type BoardTemplate = z.infer<typeof boardTemplateSchema>;
export type BoardTheme = z.infer<typeof boardThemeSchema>;
export type BoardDraft = z.infer<typeof boardDraftSchema>;
export type CreateBoardInput = z.infer<typeof createBoardInputSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardInputSchema>;
export type PublicationInput = z.infer<typeof publicationInputSchema>;
