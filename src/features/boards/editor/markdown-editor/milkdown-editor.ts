import {
  commandsCtx,
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { lift } from "@milkdown/kit/prose/commands";
import {
  NodeSelection,
  TextSelection,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  blockquoteSchema,
  bulletListSchema,
  commonmark,
  emphasisSchema,
  headingSchema,
  insertImageCommand,
  insertHrCommand,
  imageSchema,
  liftListItemCommand,
  linkSchema,
  orderedListSchema,
  strongSchema,
  toggleEmphasisCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm, remarkGFMPlugin } from "@milkdown/kit/preset/gfm";
import { history, redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import { callCommand, getMarkdown, replaceAll } from "@milkdown/kit/utils";
import {
  DEFAULT_IMAGE_WIDTH,
  IMAGE_WIDTHS,
  parseImageWidthTitle,
  serializeImageWidthTitle,
  type ImageWidth,
} from "../../images/presentation";
import { sanitizeBoardImageUrl, sanitizeBoardUrl } from "../../markdown/url";
import type {
  CreateMarkdownEditorController,
  MarkdownEditorCommand,
  MarkdownEditorController,
  ToolbarState,
} from "./types";

const commands: MarkdownEditorCommand[] = [
  "heading-2",
  "heading-3",
  "bold",
  "italic",
  "link",
  "image",
  "bullet-list",
  "ordered-list",
  "blockquote",
  "horizontal-rule",
  "undo",
  "redo",
];

const editors = new WeakMap<MarkdownEditorController, Editor>();
const failNextImageSerialization = new WeakSet<MarkdownEditorController>();

export class MarkdownParseError extends Error {
  constructor() {
    super("Markdown could not be parsed.");
    this.name = "MarkdownParseError";
  }
}

function normalizeMarkdown(markdown: string): string {
  return markdown.endsWith("\n") ? markdown.slice(0, -1) : markdown;
}

function createDefaultToolbarState(): ToolbarState {
  return Object.fromEntries(
    commands.map((command) => [command, { active: false, enabled: true }]),
  ) as ToolbarState;
}

function hasAncestorOfType(
  selection: { $from: { depth: number; node(depth: number): { type: unknown } } },
  type: unknown,
): boolean {
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    if (selection.$from.node(depth).type === type) return true;
  }
  return false;
}

function hasSelectedMark(
  selection: {
    empty: boolean;
    from: number;
    to: number;
    $from: { marks(): readonly { type: unknown }[] };
  },
  doc: { rangeHasMark(from: number, to: number, type: unknown): boolean },
  storedMarks: readonly { type: unknown }[] | null,
  markType: unknown,
): boolean {
  if (selection.empty) {
    return (storedMarks ?? selection.$from.marks()).some(
      (mark) => mark.type === markType,
    );
  }

  return doc.rangeHasMark(selection.from, selection.to, markType);
}

function toolbarStatesEqual(left: ToolbarState, right: ToolbarState): boolean {
  return commands.every(
    (command) =>
      left[command].active === right[command].active &&
      left[command].enabled === right[command].enabled,
  );
}

function isImageWidth(value: unknown): value is ImageWidth {
  return IMAGE_WIDTHS.some((width) => width === value);
}

function runProseCommand(editor: Editor, command: typeof lift): boolean {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    return command(view.state, view.dispatch, view);
  });
}

export const createMilkdownEditorController: CreateMarkdownEditorController =
  async ({
    root,
    markdown,
    ariaLabelledBy,
    ariaDescribedBy,
    onMarkdownChange,
    onToolbarStateChange,
  }) => {
    let lastPublishedMarkdown = normalizeMarkdown(markdown);
    let markdownPublicationTimer: ReturnType<typeof setTimeout> | null = null;
    let currentToolbarState = createDefaultToolbarState();
    let getToolbarState = () => currentToolbarState;
    let publishToolbarState = () => {};

    const cancelPendingMarkdownPublication = () => {
      if (markdownPublicationTimer === null) return;
      clearTimeout(markdownPublicationTimer);
      markdownPublicationTimer = null;
    };

    const synchronizeMarkdownPublication = (nextMarkdown: string) => {
      cancelPendingMarkdownPublication();
      lastPublishedMarkdown = normalizeMarkdown(nextMarkdown);
    };

    const publishMarkdown = (nextMarkdown: string) => {
      const normalizedNext = normalizeMarkdown(nextMarkdown);
      if (normalizedNext === lastPublishedMarkdown) return;

      lastPublishedMarkdown = normalizedNext;
      onMarkdownChange(normalizedNext);
    };

    const scheduleMarkdownPublication = () => {
      cancelPendingMarkdownPublication();
      markdownPublicationTimer = setTimeout(() => {
        markdownPublicationTimer = null;
        try {
          publishMarkdown(controller.getMarkdown());
        } catch {
          // Preserve the last accepted Markdown when serialization fails.
        }
      }, 200);
    };

    const observeTransaction = (
      transaction: Transaction,
      previousSelection: typeof transaction.selection,
    ) => {
      if (
        (transaction.docChanged || transaction.storedMarksSet) &&
        transaction.getMeta("addToHistory") !== false
      ) {
        scheduleMarkdownPublication();
      }

      if (
        transaction.docChanged ||
        transaction.storedMarksSet ||
        !transaction.selection.eq(previousSelection)
      ) {
        publishToolbarState();
      }
    };

    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, markdown);
        ctx.update(editorViewOptionsCtx, (options) => {
          const dispatchTransaction = options.dispatchTransaction;
          return {
            ...options,
            attributes: {
              ...options.attributes,
              role: "textbox",
              "aria-multiline": "true",
              ...(ariaLabelledBy
                ? { "aria-labelledby": ariaLabelledBy }
                : {}),
              ...(ariaDescribedBy
                ? { "aria-describedby": ariaDescribedBy }
                : {}),
            },
            dispatchTransaction: function (
              this: EditorView,
              transaction: Transaction,
            ) {
              const previousSelection = this.state.selection;
              if (dispatchTransaction) {
                dispatchTransaction.call(this, transaction);
              } else {
                this.updateState(this.state.apply(transaction));
              }
              observeTransaction(transaction, previousSelection);
            },
          };
        });
        ctx.update(remarkStringifyOptionsCtx, (options) => ({
          ...options,
          bullet: "-" as const,
          rule: "-" as const,
        }));
        ctx.update(remarkGFMPlugin.options.key, (options) => ({
          ...options,
          tablePipeAlign: false,
        }));
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .create();

    getToolbarState = () =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { doc, selection, storedMarks } = view.state;
        const manager = ctx.get(commandsCtx);
        const headingType = headingSchema.type(ctx);
        const strongType = strongSchema.type(ctx);
        const emphasisType = emphasisSchema.type(ctx);
        const linkType = linkSchema.type(ctx);
        const bulletListType = bulletListSchema.type(ctx);
        const orderedListType = orderedListSchema.type(ctx);
        const blockquoteType = blockquoteSchema.type(ctx);

        return {
          "heading-2": {
            active:
              selection.$from.parent.type === headingType &&
              selection.$from.parent.attrs.level === 2,
            enabled: manager.get(wrapInHeadingCommand.key)(2)(view.state),
          },
          "heading-3": {
            active:
              selection.$from.parent.type === headingType &&
              selection.$from.parent.attrs.level === 3,
            enabled: manager.get(wrapInHeadingCommand.key)(3)(view.state),
          },
          bold: {
            active: hasSelectedMark(selection, doc, storedMarks, strongType),
            enabled: manager.get(toggleStrongCommand.key)()(view.state),
          },
          italic: {
            active: hasSelectedMark(selection, doc, storedMarks, emphasisType),
            enabled: manager.get(toggleEmphasisCommand.key)()(view.state),
          },
          link: {
            active: hasSelectedMark(selection, doc, storedMarks, linkType),
            enabled: manager.get(toggleLinkCommand.key)()(view.state),
          },
          image: {
            active: false,
            enabled: true,
          },
          "bullet-list": {
            active: hasAncestorOfType(selection, bulletListType),
            enabled: manager.get(wrapInBulletListCommand.key)()(view.state),
          },
          "ordered-list": {
            active: hasAncestorOfType(selection, orderedListType),
            enabled: manager.get(wrapInOrderedListCommand.key)()(view.state),
          },
          blockquote: {
            active: hasAncestorOfType(selection, blockquoteType),
            enabled: manager.get(wrapInBlockquoteCommand.key)()(view.state),
          },
          "horizontal-rule": {
            active: false,
            enabled: manager.get(insertHrCommand.key)()(view.state),
          },
          undo: {
            active: false,
            enabled: manager.get(undoCommand.key)()(view.state),
          },
          redo: {
            active: false,
            enabled: manager.get(redoCommand.key)()(view.state),
          },
        };
      });

    publishToolbarState = () => {
      const nextToolbarState = getToolbarState();
      if (toolbarStatesEqual(currentToolbarState, nextToolbarState)) return;

      currentToolbarState = nextToolbarState;
      onToolbarStateChange(nextToolbarState);
    };

    const createImageTransaction = (
      payload: Parameters<MarkdownEditorController["applyImage"]>[0],
    ): Transaction | null => {
      const src = payload.src;
      const width = payload.width ?? DEFAULT_IMAGE_WIDTH;
      if (
        typeof src !== "string" ||
        sanitizeBoardImageUrl(src) !== src ||
        !isImageWidth(width) ||
        (payload.alt !== undefined && typeof payload.alt !== "string")
      ) {
        return null;
      }

      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { selection } = view.state;
        const imageType = imageSchema.type(ctx);
        const attributes = {
          src,
          alt: payload.alt ?? "",
          title: serializeImageWidthTitle(width),
        };

        if (payload.replaceSelectedImage) {
          if (
            !(selection instanceof NodeSelection) ||
            selection.node.type !== imageType
          ) {
            return null;
          }

          return view.state.tr
            .setNodeMarkup(selection.from, undefined, attributes)
            .scrollIntoView();
        }

        if (
          selection instanceof NodeSelection &&
          selection.node.type === imageType
        ) {
          const imageNode = imageType.create(attributes);
          const transaction = view.state.tr.insert(selection.to, imageNode);
          return transaction
            .setSelection(NodeSelection.create(transaction.doc, selection.to))
            .scrollIntoView();
        }

        let candidate: Transaction | null = null;
        const didRun = ctx
          .get(commandsCtx)
          .get(insertImageCommand.key)(attributes)(
            view.state,
            (transaction) => {
              candidate = transaction;
            },
            view,
          );
        return didRun ? candidate : null;
      });
    };

    const controller: MarkdownEditorController = {
      getMarkdown: () => normalizeMarkdown(editor.action(getMarkdown())),
      getSelectedImage: () =>
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { selection } = view.state;
          if (
            !(selection instanceof NodeSelection) ||
            selection.node.type !== imageSchema.type(ctx)
          ) {
            return null;
          }

          const src = sanitizeBoardImageUrl(selection.node.attrs.src);
          if (!src) return null;

          return {
            src,
            alt: selection.node.attrs.alt ?? "",
            width: parseImageWidthTitle(selection.node.attrs.title),
          };
        }),
      replaceMarkdown: (next) => {
        const normalizedNext = normalizeMarkdown(next);
        try {
          if (controller.getMarkdown() === normalizedNext) {
            synchronizeMarkdownPublication(normalizedNext);
            return;
          }
        } catch {
          // Replacing the document is also the recovery path for serialization.
        }

        editor.action((ctx) => {
          if (!ctx.get(parserCtx)(next)) throw new MarkdownParseError();
        });

        cancelPendingMarkdownPublication();
        editor.action(replaceAll(next, true));
        synchronizeMarkdownPublication(
          normalizeMarkdown(editor.action(getMarkdown())),
        );
        publishToolbarState();
      },
      applyImage: (payload, maxLength) => {
        const previousMarkdown = normalizeMarkdown(editor.action(getMarkdown()));
        let candidate: Transaction | null;
        try {
          candidate = createImageTransaction(payload);
        } catch {
          return { status: "rejected" };
        }
        if (!candidate) return { status: "rejected" };

        let nextMarkdown: string;
        try {
          if (failNextImageSerialization.delete(controller)) {
            throw new Error("Forced image serialization failure.");
          }
          nextMarkdown = editor.action((ctx) =>
            normalizeMarkdown(ctx.get(serializerCtx)(candidate.doc)),
          );
        } catch {
          return { status: "serialization_error" };
        }

        if (nextMarkdown === previousMarkdown) {
          return { status: "unchanged" };
        }

        if (nextMarkdown.length > maxLength) {
          return { status: "too_long" };
        }

        try {
          editor.action((ctx) =>
            ctx.get(editorViewCtx).dispatch(candidate),
          );
        } catch {
          try {
            controller.replaceMarkdown(previousMarkdown);
          } catch {
            // The caller must leave rich mode if an applied transaction cannot
            // be restored after an editor-view failure.
          }
          return { status: "restore_failed" };
        }

        synchronizeMarkdownPublication(nextMarkdown);
        onMarkdownChange(nextMarkdown);
        return { status: "applied", markdown: nextMarkdown };
      },
      run: (command, payload) => {
        const activeState = getToolbarState();
        const commandActions: Record<
          Exclude<MarkdownEditorCommand, "link" | "image">,
          () => boolean
        > = {
          "heading-2": () =>
            activeState["heading-2"].active
              ? editor.action(callCommand(turnIntoTextCommand.key))
              : editor.action(callCommand(wrapInHeadingCommand.key, 2)),
          "heading-3": () =>
            activeState["heading-3"].active
              ? editor.action(callCommand(turnIntoTextCommand.key))
              : editor.action(callCommand(wrapInHeadingCommand.key, 3)),
          bold: () => editor.action(callCommand(toggleStrongCommand.key)),
          italic: () => editor.action(callCommand(toggleEmphasisCommand.key)),
          "bullet-list": () =>
            activeState["bullet-list"].active
              ? editor.action(callCommand(liftListItemCommand.key))
              : editor.action(callCommand(wrapInBulletListCommand.key)),
          "ordered-list": () =>
            activeState["ordered-list"].active
              ? editor.action(callCommand(liftListItemCommand.key))
              : editor.action(callCommand(wrapInOrderedListCommand.key)),
          blockquote: () =>
            activeState.blockquote.active
              ? runProseCommand(editor, lift)
              : editor.action(callCommand(wrapInBlockquoteCommand.key)),
          "horizontal-rule": () =>
            editor.action(callCommand(insertHrCommand.key)),
          undo: () => editor.action(callCommand(undoCommand.key)),
          redo: () => editor.action(callCommand(redoCommand.key)),
        };

        const didRun =
          command === "link"
            ? (() => {
                const href = payload?.href;
                if (href == null || href.trim() === "") {
                  return editor.action(callCommand(toggleLinkCommand.key));
                }

                const safeHref = sanitizeBoardUrl(href);
                return safeHref
                  ? editor.action(
                      callCommand(toggleLinkCommand.key, { href: safeHref }),
                    )
                  : false;
              })()
            : command === "image"
              ? controller.applyImage(
                  payload ?? {},
                  Number.POSITIVE_INFINITY,
                ).status === "applied"
            : commandActions[command]();

        if (didRun) publishToolbarState();
        return didRun;
      },
      getToolbarState: () => getToolbarState(),
      focus: () => editor.action((ctx) => ctx.get(editorViewCtx).focus()),
      destroy: async () => {
        cancelPendingMarkdownPublication();
        editors.delete(controller);
        await editor.destroy();
      },
    };

    editors.set(controller, editor);
    currentToolbarState = getToolbarState();
    onToolbarStateChange(currentToolbarState);
    return controller;
  };

export const __testing = {
  failNextImageSerialization(controller: MarkdownEditorController) {
    if (!editors.has(controller)) {
      throw new Error("Markdown editor controller is unavailable.");
    }
    failNextImageSerialization.add(controller);
  },
  selectNode(controller: MarkdownEditorController, position: number) {
    const editor = editors.get(controller);
    if (!editor) throw new Error("Markdown editor controller is unavailable.");

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(
        view.state.tr.setSelection(
          NodeSelection.create(view.state.doc, position),
        ),
      );
    });
  },
  selectText(controller: MarkdownEditorController, from: number, to: number) {
    const editor = editors.get(controller);
    if (!editor) throw new Error("Markdown editor controller is unavailable.");

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)),
      );
    });
  },
};
