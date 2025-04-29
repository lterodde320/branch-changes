import * as vscode from "vscode";
import { FileItem, FolderItem, FileStatus } from "./tree-items";
import {
  getWorkspaceRoot,
  isGitRepository,
  checkGitRepository,
} from "../utils/workspace";
import {
  getCurrentBranch,
  getAllBranches,
  getDefaultSourceBranch,
  getStagedFiles,
  getUnstagedFiles,
  getCommittedFiles,
} from "../git/git-utils";

/**
 * Provider for the Git Changed Files Tree View
 */
export class GitChangedFilesProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  // Track the last known branch
  lastKnownBranch: string | null = null;

  // Store selected comparison branch
  selectedComparisonBranch: string | null = null;

  // Root folder for the file tree
  private rootFolder: FolderItem | null = null;

  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | null | undefined
  > = new vscode.EventEmitter<vscode.TreeItem | null | undefined>();

  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | null | undefined
  > = this._onDidChangeTreeData.event;

  /**
   * Refresh the tree view
   */
  refresh(): void {
    console.log("Refreshing Git changed files view");
    this.rootFolder = null; // Clear the cache
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get a tree item for display
   */
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Show branch selection dialog and update the selected branch
   */
  async selectComparisonBranch(): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();

    if (!workspaceRoot) {
      vscode.window.showInformationMessage(
        "No workspace open. Please open a Git repository."
      );
      return;
    }

    // Check if we're in a Git repository
    if (!checkGitRepository(workspaceRoot)) {
      return;
    }

    try {
      // Get all available branches
      const branches = await getAllBranches(workspaceRoot);

      // Get current branch for the picker
      const currentBranch = await getCurrentBranch(workspaceRoot);

      // Find the most likely source branch
      let defaultBranch = await getDefaultSourceBranch(workspaceRoot);

      // Create quick pick items with the current selection highlighted
      const quickPickItems = branches.map((branch) => ({
        label: branch,
        description:
          branch === defaultBranch
            ? "Auto-detected source branch"
            : branch === currentBranch
            ? "Current branch"
            : "",
        picked: branch === defaultBranch,
      }));

      // Show the branch selection dialog
      const selectedBranch = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: `Select a branch to compare with ${currentBranch}`,
        title: "Select Comparison Branch",
      });

      if (selectedBranch) {
        this.selectedComparisonBranch = selectedBranch.label;
        console.log(
          `Set comparison branch to: ${this.selectedComparisonBranch}`
        );
        this.refresh();
      }
    } catch (error) {
      console.error("Error selecting branch:", error);
      vscode.window.showErrorMessage(`Failed to get branches: ${error}`);
    }
  }

  /**
   * Get children of the tree item
   */
  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const workspaceRoot = getWorkspaceRoot();

    if (!workspaceRoot) {
      vscode.window.showInformationMessage(
        "No workspace open. Please open a Git repository."
      );
      return [this.createInfoMessage("No workspace open")];
    }

    // Check if this is a Git repository
    if (!isGitRepository(workspaceRoot)) {
      return [this.createInfoMessage("Not a Git repository")];
    }

    // If we're getting children of a folder item
    if (element instanceof FolderItem) {
      return Array.from(element.children.values());
    }

    // Root level - show branch selector and file tree
    try {
      // Get the current branch name
      const currentBranch = await getCurrentBranch(workspaceRoot);
      this.lastKnownBranch = currentBranch;

      // If no comparison branch is selected, try to auto-detect
      if (!this.selectedComparisonBranch) {
        this.selectedComparisonBranch = await getDefaultSourceBranch(
          workspaceRoot
        );
      }

      // Add a branch selector item at the top of the tree
      const branchSelectorItem = new vscode.TreeItem(
        `${this.selectedComparisonBranch}`,
        vscode.TreeItemCollapsibleState.None
      );
      branchSelectorItem.iconPath = new vscode.ThemeIcon("git-branch");
      branchSelectorItem.contextValue = "branchSelector";

      // Build or get the file tree
      if (!this.rootFolder) {
        await this.buildFileTree(workspaceRoot);
      }

      if (this.rootFolder && this.rootFolder.children.size > 0) {
        return [
          branchSelectorItem,
          ...Array.from(this.rootFolder.children.values()),
        ];
      } else {
        const emptyMessage = new vscode.TreeItem(`No changes detected`);
        emptyMessage.tooltip = "No staged, unstaged, or branch changes found";
        return [branchSelectorItem, emptyMessage];
      }
    } catch (error) {
      console.log("Error in getChildren:", error);
      vscode.window.showErrorMessage(`Error: ${error}`);
      return [this.createInfoMessage(`Error: ${error}`)];
    }
  }

  /**
   * Creates an info message tree item
   * @param message The message to display
   * @returns A tree item with the message
   */
  private createInfoMessage(message: string): vscode.TreeItem {
    const item = new vscode.TreeItem(
      message,
      vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = new vscode.ThemeIcon("info");
    return item;
  }

  /**
   * Build the file tree structure
   */
  private async buildFileTree(workspaceRoot: string): Promise<void> {
    // Create root folder
    this.rootFolder = new FolderItem("root", "");

    try {
      // Get all changed files
      const stagedFiles = await getStagedFiles(workspaceRoot);
      const unstagedFiles = await getUnstagedFiles(workspaceRoot);
      const committedFiles = await getCommittedFiles(
        workspaceRoot,
        this.selectedComparisonBranch!
      );

      // Add all files to the folder structure
      this.addFilesToTree(stagedFiles, FileStatus.STAGED, workspaceRoot);
      this.addFilesToTree(unstagedFiles, FileStatus.UNSTAGED, workspaceRoot);
      this.addFilesToTree(committedFiles, FileStatus.COMMITTED, workspaceRoot);
    } catch (error) {
      console.error("Error building file tree:", error);
    }
  }

  /**
   * Add files to the tree structure
   */
  private addFilesToTree(
    files: string[],
    status: FileStatus,
    workspaceRoot: string
  ): void {
    for (const filePath of files) {
      // Create file item
      const fileItem = new FileItem(filePath, status, workspaceRoot);

      // Split path into parts
      const pathParts = filePath.split("/");

      // If it's a file in the root directory
      if (pathParts.length === 1) {
        this.rootFolder!.children.set(filePath, fileItem);
      } else {
        // Add to the appropriate subfolder
        this.rootFolder!.addChild(pathParts, fileItem);
      }
    }
  }
}
