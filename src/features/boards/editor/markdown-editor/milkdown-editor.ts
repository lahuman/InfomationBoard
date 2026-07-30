import {
  commandsCtx,
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { lift } from "@milkdown/kit/prose/commands";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
  blockquoteSchema,
  bulletListSchema,
  commonmark,
  emphasisSchema,
  headingSchema,
  insertImageCommand,
  insertHrCommand,
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
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { callCommand, getMarkdown, replaceAll } from "@milkdown/kit/utils";
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
    let lastExternalMarkdown = normalizeMarkdown(markdown);
    let applyingExternalValue = false;
    let currentToolbarState = createDefaultToolbarState();
    let getToolbarState = () => currentToolbarState;
    let publishToolbarState = () => {};

    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, markdown);
        ctx.update(editorViewOptionsCtx, (options) => ({
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
        }));
        ctx.update(remarkStringifyOptionsCtx, (options) => ({
          ...options,
          bullet: "-" as const,
          rule: "-" as const,
        }));
        ctx.update(remarkGFMPlugin.options.key, (options) => ({
          ...options,
          tablePipeAlign: false,
        }));
        ctx.get(listenerCtx).markdownUpdated((_ctx, next, previous) => {
          const normalizedNext = normalizeMarkdown(next);
          if (
            applyingExternalValue ||
            normalizedNext === normalizeMarkdown(previous) ||
            normalizedNext === lastExternalMarkdown
          ) {
            publishToolbarState();
            return;
          }

          lastExternalMarkdown = normalizedNext;
          onMarkdownChange(normalizedNext);
          publishToolbarState();
        });
        ctx.get(listenerCtx).selectionUpdated(() => {
          publishToolbarState();
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
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

    const controller: MarkdownEditorController = {
      getMarkdown: () => normalizeMarkdown(editor.action(getMarkdown())),
      replaceMarkdown: (next) => {
        if (normalizeMarkdown(next) === lastExternalMarkdown) return;

        editor.action((ctx) => {
          if (!ctx.get(parserCtx)(next)) throw new MarkdownParseError();
        });

        applyingExternalValue = true;
        try {
          editor.action(replaceAll(next, true));
          lastExternalMarkdown = normalizeMarkdown(editor.action(getMarkdown()));
        } finally {
          applyingExternalValue = false;
        }
        publishToolbarState();
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
              ? (() => {
                  const src = payload?.src;
                  if (!src || sanitizeBoardImageUrl(src) !== src) return false;

                  return editor.action(
                    callCommand(insertImageCommand.key, {
                      src,
                      alt: payload?.alt ?? "",
                      title: "",
                    }),
                  );
                })()
            : commandActions[command]();

        if (didRun) publishToolbarState();
        return didRun;
      },
      getToolbarState: () => getToolbarState(),
      focus: () => editor.action((ctx) => ctx.get(editorViewCtx).focus()),
      destroy: async () => {
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
