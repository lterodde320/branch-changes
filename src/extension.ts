import * as vscode from "vscode";
import * as path from "path";
import { GitChangedFilesProvider } from "./views/git-changes-provider";
import { setupGitBranchWatcher } from "./git/branch-watcher";
import { getWorkspaceRoot } from "./utils/workspace";
import {
  GutterProvider,
  BranchContentProvider,
  BRANCH_CHANGES_SCHEME,
} from "./gutter/gutter-provider";
import { DiffHunk } from "./gutter/diff-parser";
import { getMergeBase } from "./git/git-utils";

/**
 * Main extension activation
 * @param context The extension context
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log("Git Changed Files extension activated");

  // Create tree data provider
  const treeDataProvider = new GitChangedFilesProvider();

  // Register the tree data provider for our view
  vscode.window.registerTreeDataProvider(
    "gitChangedFilesView",
    treeDataProvider
  );

  // Create the gutter provider (decorations + CodeLens)
  const gutterProvider = new GutterProvider(
    context,
    () => treeDataProvider.selectedComparisonBranch
  );
  context.subscriptions.push(gutterProvider);

  // Register the virtual document content provider for base-branch file content
  const contentProvider = new BranchContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      BRANCH_CHANGES_SCHEME,
      contentProvider
    )
  );

  // Register CodeLens provider for all file types
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, gutterProvider)
  );

  // Register commands
  registerCommands(context, treeDataProvider, gutterProvider, contentProvider);

  // Set up file watchers for git repository changes
  await setupGitBranchWatcher(
    context,
    () => {
      treeDataProvider.refresh();
      gutterProvider.refresh();
    },
    () => treeDataProvider.lastKnownBranch
  );

  // Set up workspace event listeners
  setupWorkspaceListeners(context, treeDataProvider, gutterProvider);

  // Decorate the editor that is already active when the extension loads
  if (vscode.window.activeTextEditor) {
    gutterProvider.updateEditor(vscode.window.activeTextEditor);
  }
}

/**
 * Register extension commands
 */
function registerCommands(
  context: vscode.ExtensionContext,
  treeDataProvider: GitChangedFilesProvider,
  gutterProvider: GutterProvider,
  contentProvider: BranchContentProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gitChangedFiles.refresh", () => {
      console.log("Refresh command triggered");
      treeDataProvider.refresh();
      gutterProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitChangedFiles.selectBranch",
      async () => {
        await treeDataProvider.selectComparisonBranch();
        // Re-decorate the active editor after the branch changes
        gutterProvider.refresh();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitChangedFiles.showHunkDiff",
      async (
        documentUri: vscode.Uri,
        filePath: string,
        hunk: DiffHunk,
        branch: string
      ) => {
        await showHunkDiff(documentUri, filePath, hunk, branch, contentProvider);
      }
    )
  );
}

/**
 * Open VS Code's diff editor comparing the file at the merge-base (left)
 * against the current working-tree file (right), then scroll to the hunk.
 */
async function showHunkDiff(
  documentUri: vscode.Uri,
  filePath: string,
  hunk: DiffHunk,
  branch: string,
  _contentProvider: BranchContentProvider
): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  try {
    // Verify we can resolve the merge base before opening the diff
    await getMergeBase(workspaceRoot, branch);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to resolve merge base: ${err}`);
    return;
  }

  // Virtual URI for the base-branch file content
  const baseUri = vscode.Uri.from({
    scheme: BRANCH_CHANGES_SCHEME,
    path: `/${encodeURIComponent(filePath)}`,
    query: branch,
  });

  const title = `${path.basename(filePath)}: ${branch} \u2194 Working Tree`;

  await vscode.commands.executeCommand("vscode.diff", baseUri, documentUri, title);

  // After the diff editor opens, scroll the right (working-tree) side to the
  // hunk start so the user lands in the right spot.
  setTimeout(() => {
    const targetLine = Math.max(0, hunk.newStart - 1);
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === documentUri.toString()) {
        const range = new vscode.Range(targetLine, 0, targetLine, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        break;
      }
    }
  }, 300);
}

/**
 * Set up listeners for workspace events
 */
function setupWorkspaceListeners(
  context: vscode.ExtensionContext,
  treeDataProvider: GitChangedFilesProvider,
  gutterProvider: GutterProvider
): void {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      console.log("Active editor changed, refreshing view");
      treeDataProvider.refresh();
      if (editor) {
        gutterProvider.updateEditor(editor);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      console.log("File saved:", document.fileName);
      setTimeout(() => {
        treeDataProvider.refresh();
        gutterProvider.refresh();
      }, 300);
    })
  );

  setupFileChangeListeners(context, treeDataProvider, gutterProvider);
}

/**
 * Set up listeners for file system changes
 */
function setupFileChangeListeners(
  context: vscode.ExtensionContext,
  treeDataProvider: GitChangedFilesProvider,
  gutterProvider: GutterProvider
): void {
  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(() => {
      console.log("Files created, refreshing view");
      setTimeout(() => {
        treeDataProvider.refresh();
        gutterProvider.refresh();
      }, 300);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles(() => {
      console.log("Files deleted, refreshing view");
      setTimeout(() => {
        treeDataProvider.refresh();
        gutterProvider.refresh();
      }, 300);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles(() => {
      console.log("Files renamed, refreshing view");
      setTimeout(() => {
        treeDataProvider.refresh();
        gutterProvider.refresh();
      }, 300);
    })
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  console.log("Git Changed Files extension deactivated");
}
