import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { getBuiltInGitApi } from "./git-utils";
import { getWorkspaceRoot, isGitRepository } from "../utils/workspace";

/**
 * Sets up watchers to detect Git branch changes
 * @param context Extension context
 * @param refreshCallback Function to call when changes are detected
 * @param lastKnownBranchGetter Function to get the last known branch
 * @returns Promise that resolves when setup is complete
 */
export async function setupGitBranchWatcher(
  context: vscode.ExtensionContext,
  refreshCallback: () => void,
  lastKnownBranchGetter: () => string | null
): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();

  if (!workspaceRoot) {
    console.log("No workspace found, can't set up Git branch watcher");
    return;
  }

  // Check if this is a Git repository
  if (!isGitRepository(workspaceRoot)) {
    console.log("Not a Git repository, skipping branch watcher setup");
    // Show a status bar message to inform the user
    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    statusBarItem.text = "$(warning) Not a Git repository";
    statusBarItem.tooltip =
      "Git Changed Files extension requires a Git repository";
    statusBarItem.command = "gitChangedFiles.refresh"; // Allow manual refresh
    statusBarItem.show();

    // Add the status bar item to context subscriptions for cleanup
    context.subscriptions.push(statusBarItem);
    return;
  }

  // Set up VS Code Git API watcher
  await setupGitApiWatcher(context, refreshCallback);

  // Set up file system watchers
  setupFileSystemWatchers(context, workspaceRoot, refreshCallback);

  // Set up fallback poller for environments where file watchers don't work
  setupFallbackBranchPoller(
    context,
    workspaceRoot,
    refreshCallback,
    lastKnownBranchGetter
  );
}

/**
 * Sets up a watcher using the VS Code Git API
 */
async function setupGitApiWatcher(
  context: vscode.ExtensionContext,
  refreshCallback: () => void
): Promise<void> {
  const gitAPI = await getBuiltInGitApi();

  gitAPI?.onDidOpenRepository((repo) => {
    repo.state.onDidChange(() => {
      console.log("Repository state changed, refreshing view");
      refreshCallback();
    });
  });
}

/**
 * Sets up file system watchers for Git reference files
 */
function setupFileSystemWatchers(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  refreshCallback: () => void
): void {
  // Set up file watcher for the Git HEAD file
  const gitHeadPath = path.join(workspaceRoot, ".git", "HEAD");
  const projectFilePath = workspaceRoot;

  if (fs.existsSync(gitHeadPath) && fs.existsSync(projectFilePath)) {
    // Watch the Git HEAD file
    const gitHeadFileWatcher =
      vscode.workspace.createFileSystemWatcher(gitHeadPath);
    console.log("Git HEAD file watcher set up at:", gitHeadPath);

    gitHeadFileWatcher.onDidChange(() => {
      console.log("Git HEAD changed (branch change detected), refreshing view");
      refreshCallback();
    });

    // Watch the project root
    const projectFileWatcher =
      vscode.workspace.createFileSystemWatcher(projectFilePath);
    console.log("Project file watcher set up at:", projectFilePath);

    projectFileWatcher.onDidChange(() => {
      console.log("Project changed, refreshing view");
      refreshCallback();
    });

    // Add the watchers to context subscriptions for cleanup
    context.subscriptions.push(gitHeadFileWatcher, projectFileWatcher);

    // Also set up a watcher for the refs directory
    setupRefsWatcher(context, workspaceRoot, refreshCallback);
  }
}

/**
 * Sets up a watcher for the Git refs directory
 */
function setupRefsWatcher(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  refreshCallback: () => void
): void {
  const gitRefsPath = path.join(workspaceRoot, ".git", "refs");

  if (fs.existsSync(gitRefsPath)) {
    const refsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitRefsPath, "**")
    );
    console.log("Git refs directory watcher set up at:", gitRefsPath);

    // Watch for all types of changes in the refs directory
    refsWatcher.onDidChange(() => {
      console.log("Git refs changed, refreshing view");
      refreshCallback();
    });

    refsWatcher.onDidCreate(() => {
      console.log("New git ref created, refreshing view");
      refreshCallback();
    });

    refsWatcher.onDidDelete(() => {
      console.log("Git ref deleted, refreshing view");
      refreshCallback();
    });

    context.subscriptions.push(refsWatcher);
  }
}

/**
 * Sets up a fallback poller for environments where file watchers don't work
 */
function setupFallbackBranchPoller(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  refreshCallback: () => void,
  lastKnownBranchGetter: () => string | null
): void {
  // Alternative: poll for branch changes periodically
  const branchPoller = setInterval(() => {
    const lastKnownBranch = lastKnownBranchGetter();

    if (lastKnownBranch) {
      exec(
        "git rev-parse --abbrev-ref HEAD",
        { cwd: workspaceRoot },
        (error, currentBranch) => {
          if (!error && currentBranch.trim() !== lastKnownBranch) {
            console.log(
              `Branch changed from ${lastKnownBranch} to ${currentBranch.trim()}`
            );
            refreshCallback();
          }
        }
      );
    }
  }, 5000); // Check every 5 seconds

  // Register the interval for disposal
  context.subscriptions.push({ dispose: () => clearInterval(branchPoller) });
}
