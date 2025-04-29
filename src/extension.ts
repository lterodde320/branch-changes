import * as vscode from "vscode";
import { delay } from "./utils/workspace";
import { GitChangedFilesProvider } from "./views/git-changes-provider";
import { setupGitBranchWatcher } from "./git/branch-watcher";

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

  // Register commands
  registerCommands(context, treeDataProvider);

  // Set up file watchers for git repository changes
  await setupGitBranchWatcher(
    context,
    () => treeDataProvider.refresh(),
    () => treeDataProvider.lastKnownBranch
  );

  // Set up workspace event listeners
  setupWorkspaceListeners(context, treeDataProvider);
}

/**
 * Register extension commands
 * @param context The extension context
 * @param treeDataProvider The tree data provider
 */
function registerCommands(
  context: vscode.ExtensionContext,
  treeDataProvider: GitChangedFilesProvider
): void {
  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("gitChangedFiles.refresh", () => {
      console.log("Refresh command triggered");
      treeDataProvider.refresh();
    })
  );

  // Register branch selection command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitChangedFiles.selectBranch",
      async () => {
        await treeDataProvider.selectComparisonBranch();
      }
    )
  );
}

/**
 * Set up listeners for workspace events
 * @param context The extension context
 * @param treeDataProvider The tree data provider
 */
function setupWorkspaceListeners(
  context: vscode.ExtensionContext,
  treeDataProvider: GitChangedFilesProvider
): void {
  // Refresh when the active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      console.log("Active editor changed, refreshing view");
      treeDataProvider.refresh();
    })
  );

  // Refresh when files are saved with a small delay
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      console.log("File saved:", document.fileName);
      // Add a small delay to allow git to process the change
      setTimeout(() => treeDataProvider.refresh(), 300);
    })
  );

  // Refresh when files are created, deleted or renamed
  setupFileChangeListeners(context, treeDataProvider);
}

/**
 * Set up listeners for file system changes
 * @param context The extension context
 * @param treeDataProvider The tree data provider
 */
function setupFileChangeListeners(
  context: vscode.ExtensionContext,
  treeDataProvider: GitChangedFilesProvider
): void {
  // File creation events
  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(() => {
      console.log("Files created, refreshing view");
      setTimeout(() => treeDataProvider.refresh(), 300);
    })
  );

  // File deletion events
  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles(() => {
      console.log("Files deleted, refreshing view");
      setTimeout(() => treeDataProvider.refresh(), 300);
    })
  );

  // File rename events
  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles(() => {
      console.log("Files renamed, refreshing view");
      setTimeout(() => treeDataProvider.refresh(), 300);
    })
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  console.log("Git Changed Files extension deactivated");
}
