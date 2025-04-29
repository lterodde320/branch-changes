import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Get the root workspace folder path if available
 * @returns The workspace root path or null if no workspace is open
 */
export function getWorkspaceRoot(): string | null {
  return vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri.fsPath
    : null;
}

/**
 * Shows an information message if no workspace is open
 * @returns True if a workspace is open, false otherwise
 */
export function checkWorkspace(): boolean {
  const workspaceRoot = getWorkspaceRoot();

  if (!workspaceRoot) {
    vscode.window.showInformationMessage(
      "No workspace open. Please open a Git repository."
    );
    return false;
  }

  return true;
}

/**
 * Check if the current workspace is a Git repository
 * @param workspaceRoot The workspace root path
 * @returns True if the workspace is a Git repository, false otherwise
 */
export function isGitRepository(workspaceRoot: string): boolean {
  if (!workspaceRoot) {
    return false;
  }

  const gitDir = path.join(workspaceRoot, ".git");
  return fs.existsSync(gitDir);
}

/**
 * Shows an information message if the workspace is not a Git repository
 * @param workspaceRoot The workspace root path
 * @returns True if the workspace is a Git repository, false otherwise
 */
export function checkGitRepository(workspaceRoot: string): boolean {
  if (!isGitRepository(workspaceRoot)) {
    vscode.window.showInformationMessage(
      "Not a Git repository. Please open a folder containing a Git repository."
    );
    return false;
  }

  return true;
}

/**
 * Create a delay using setTimeout wrapped in a Promise
 * @param ms Milliseconds to delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
