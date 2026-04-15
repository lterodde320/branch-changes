import * as vscode from "vscode";
import * as path from "path";
import { parseDiffHunks, DiffHunk } from "./diff-parser";
import { getWorkspaceRoot } from "../utils/workspace";
import {
  getFileDiff,
  getMergeBase,
  getFileContentAtRevision,
} from "../git/git-utils";

/** URI scheme used for serving base-branch file content to the diff editor */
export const BRANCH_CHANGES_SCHEME = "branch-changes";

/**
 * Provides read-only document content for a file at the comparison branch's
 * merge-base, so VS Code's diff editor can show it on the left side.
 *
 * URI format:  branch-changes:/<encoded-file-path>?<branch>
 */
export class BranchContentProvider
  implements vscode.TextDocumentContentProvider
{
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return "";
    }

    // The file path is stored URI-encoded in uri.path (leading '/' stripped)
    const filePath = decodeURIComponent(uri.path.replace(/^\//, ""));
    const branch = uri.query;

    if (!filePath || !branch) {
      return "";
    }

    try {
      const mergeBase = await getMergeBase(workspaceRoot, branch);
      return await getFileContentAtRevision(workspaceRoot, filePath, mergeBase);
    } catch {
      // File doesn't exist at the merge base (new file on this branch)
      return "";
    }
  }

  /** Force VS Code to re-fetch content for a URI (call after branch change) */
  notify(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }
}

/**
 * Manages gutter decorations and CodeLens entries for diff hunks in the
 * active text editor.
 *
 * - Green bar  = lines added since the comparison branch's merge-base
 * - Blue bar   = lines that replaced removed content (modifications)
 * - Red arrow  = marker where lines were purely deleted
 * - CodeLens   = click "Show diff" to open the full file diff
 */
export class GutterProvider implements vscode.CodeLensProvider {
  private readonly addedDecoration: vscode.TextEditorDecorationType;
  private readonly modifiedDecoration: vscode.TextEditorDecorationType;
  private readonly removedDecoration: vscode.TextEditorDecorationType;

  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /** Hunks per document URI string, populated by updateEditor() */
  private readonly fileHunks = new Map<string, DiffHunk[]>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getComparisonBranch: () => string | null
  ) {
    const icon = (name: string) =>
      vscode.Uri.file(context.asAbsolutePath(`resources/${name}`));

    this.addedDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: icon("gutter-added.svg"),
      gutterIconSize: "contain",
    });

    this.modifiedDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: icon("gutter-modified.svg"),
      gutterIconSize: "contain",
    });

    this.removedDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: icon("gutter-removed.svg"),
      gutterIconSize: "contain",
    });
  }

  // ── CodeLensProvider ────────────────────────────────────────────────────────

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const hunks = this.fileHunks.get(document.uri.toString()) ?? [];
    const workspaceRoot = getWorkspaceRoot();
    const branch = this.getComparisonBranch();

    if (!workspaceRoot || !branch) {
      return [];
    }

    return hunks.map((hunk) => {
      const lineIndex = Math.max(0, hunk.newStart - 1); // 0-indexed
      const range = new vscode.Range(lineIndex, 0, lineIndex, 0);

      const addedCount = hunk.changes.filter((c) => c.type === "added").length;
      const removedCount = hunk.changes.filter(
        (c) => c.type === "removed"
      ).length;

      let label = "$(git-commit) ";
      if (addedCount && removedCount) {
        label += `+${addedCount} -${removedCount}`;
      } else if (addedCount) {
        label += `+${addedCount}`;
      } else {
        label += `-${removedCount}`;
      }
      label += " \u2014 Show diff";

      const filePath = path.relative(workspaceRoot, document.uri.fsPath);

      return new vscode.CodeLens(range, {
        title: label,
        command: "gitChangedFiles.showHunkDiff",
        arguments: [document.uri, filePath, hunk, branch],
      });
    });
  }

  // ── Decoration management ───────────────────────────────────────────────────

  /**
   * Fetch the diff for the file open in `editor` and apply gutter decorations
   * + refresh CodeLenses. Safe to call on every editor focus change.
   */
  async updateEditor(editor: vscode.TextEditor): Promise<void> {
    // Only decorate real on-disk files
    if (editor.document.uri.scheme !== "file") {
      return;
    }

    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    const branch = this.getComparisonBranch();
    if (!branch) {
      return;
    }

    const filePath = path.relative(workspaceRoot, editor.document.uri.fsPath);

    // Skip files outside the workspace
    if (filePath.startsWith("..") || path.isAbsolute(filePath)) {
      this.clearEditor(editor);
      return;
    }

    try {
      const diffOutput = await getFileDiff(workspaceRoot, filePath, branch);

      if (!diffOutput.trim()) {
        this.clearEditor(editor);
        this.fileHunks.delete(editor.document.uri.toString());
        this._onDidChangeCodeLenses.fire();
        return;
      }

      const hunks = parseDiffHunks(diffOutput);
      this.fileHunks.set(editor.document.uri.toString(), hunks);

      const { added, modified, removed } = this.buildRanges(hunks);
      editor.setDecorations(this.addedDecoration, added);
      editor.setDecorations(this.modifiedDecoration, modified);
      editor.setDecorations(this.removedDecoration, removed);
    } catch {
      this.clearEditor(editor);
      this.fileHunks.delete(editor.document.uri.toString());
    }

    this._onDidChangeCodeLenses.fire();
  }

  /** Re-run updateEditor for the currently active editor (e.g. after branch change) */
  refresh(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.updateEditor(editor);
    }
  }

  dispose(): void {
    this.addedDecoration.dispose();
    this.modifiedDecoration.dispose();
    this.removedDecoration.dispose();
    this._onDidChangeCodeLenses.dispose();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.addedDecoration, []);
    editor.setDecorations(this.modifiedDecoration, []);
    editor.setDecorations(this.removedDecoration, []);
  }

  /**
   * Convert a list of diff hunks into three sets of editor ranges:
   *
   * - `added`    — lines that are new (no corresponding removed lines in hunk)
   * - `modified` — new lines that replace removed lines (mixed hunk)
   * - `removed`  — a single indicator range for hunks that only delete lines
   */
  private buildRanges(hunks: DiffHunk[]): {
    added: vscode.Range[];
    modified: vscode.Range[];
    removed: vscode.Range[];
  } {
    const added: vscode.Range[] = [];
    const modified: vscode.Range[] = [];
    const removed: vscode.Range[] = [];

    for (const hunk of hunks) {
      const hasAdded = hunk.changes.some((c) => c.type === "added");
      const hasRemoved = hunk.changes.some((c) => c.type === "removed");
      const isMixed = hasAdded && hasRemoved;

      let newLineNum = hunk.newStart; // 1-indexed line in the new file

      for (const change of hunk.changes) {
        if (change.type === "added") {
          const r = new vscode.Range(newLineNum - 1, 0, newLineNum - 1, 0);
          if (isMixed) {
            modified.push(r);
          } else {
            added.push(r);
          }
          newLineNum++;
        } else if (change.type === "context") {
          newLineNum++;
        }
        // "removed" lines don't exist in the new file — don't advance newLineNum
      }

      // For pure deletions, place a downward-arrow indicator at the line just
      // before the deletion point (the last surviving line above the gap).
      if (hasRemoved && !hasAdded) {
        const indicatorLine = Math.max(0, hunk.newStart - 1); // 0-indexed
        removed.push(new vscode.Range(indicatorLine, 0, indicatorLine, 0));
      }
    }

    return { added, modified, removed };
  }
}
