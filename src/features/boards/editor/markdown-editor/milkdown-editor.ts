import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown, replaceAll } from "@milkdown/kit/utils";
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
  "bullet-list",
  "ordered-list",
  "blockquote",
  "horizontal-rule",
  "undo",
  "redo",
];

function createDefaultToolbarState(): ToolbarState {
  return Object.fromEntries(
    commands.map((command) => [command, { active: false, enabled: true }]),
  ) as ToolbarState;
}

export const createMilkdownEditorController: CreateMarkdownEditorController =
  async ({ root, markdown, onMarkdownChange, onToolbarStateChange }) => {
    let lastExternalMarkdown = markdown;
    let applyingExternalValue = false;

    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, markdown);
        ctx.get(listenerCtx).markdownUpdated((_ctx, next, previous) => {
          if (applyingExternalValue || next === previous) return;
          lastExternalMarkdown = next;
          onMarkdownChange(next);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .create();

    const controller: MarkdownEditorController = {
      getMarkdown: () =>
        editor.action(getMarkdown()).replace(/^(\s*)\* /gm, "$1- "),
      replaceMarkdown: (next) => {
        if (next === lastExternalMarkdown) return;
        applyingExternalValue = true;
        editor.action(replaceAll(next, true));
        lastExternalMarkdown = next;
        applyingExternalValue = false;
      },
      run: () => false,
      getToolbarState: () => createDefaultToolbarState(),
      focus: () => editor.action((ctx) => ctx.get(editorViewCtx).focus()),
      destroy: async () => {
        await editor.destroy();
      },
    };

    onToolbarStateChange(controller.getToolbarState());
    return controller;
  };
