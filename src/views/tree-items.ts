import * as vscode from "vscode";
import * as path from "path";

/**
 * Enum representing the possible file statuses
 */
export enum FileStatus {
  STAGED = "staged",
  UNSTAGED = "unstaged",
  COMMITTED = "committed",
}

/**
 * Class representing a file item in the tree view
 */
export class FileItem extends vscode.TreeItem {
  private _decorations?: vscode.FileDecoration[];

  constructor(
    public readonly filePath: string,
    public readonly status: FileStatus,
    public readonly workspaceRoot: string
  ) {
    // Use just the filename as the label
    const fileName = path.basename(filePath);
    const fullPath = path.join(workspaceRoot, filePath);

    super(fileName, vscode.TreeItemCollapsibleState.None);

    // Set the resource URI to get the file icon
    this.resourceUri = vscode.Uri.file(fullPath);

    // Set command to open file when clicked
    this.command = {
      command: "vscode.open",
      arguments: [vscode.Uri.file(fullPath)],
      title: "Open File",
    };

    // Add tooltip with full path and status
    this.tooltip = `${fullPath} (${status})`;

    this.configureDecorationByStatus(fileName, status);
  }

  /**
   * Configure the item decoration based on file status
   */
  private configureDecorationByStatus(
    fileName: string,
    status: FileStatus
  ): void {
    let statusChar = "";
    let statusColor: vscode.ThemeColor;
    let tooltipText = "";

    switch (status) {
      case FileStatus.STAGED:
        statusChar = "S";
        statusColor = new vscode.ThemeColor(
          "gitDecoration.addedResourceForeground"
        );
        this.contextValue = "stagedFile";
        tooltipText = "Staged changes";
        break;

      case FileStatus.UNSTAGED:
        statusChar = "U";
        statusColor = new vscode.ThemeColor(
          "gitDecoration.modifiedResourceForeground"
        );
        this.contextValue = "unstagedFile";
        tooltipText = "Unstaged changes";
        break;

      case FileStatus.COMMITTED:
        statusChar = "C";
        statusColor = new vscode.ThemeColor(
          "gitDecoration.untrackedResourceForeground"
        );
        this.contextValue = "committedFile";
        tooltipText = "Committed changes";
        break;
    }

    // Let resourceUri handle the file icon
    this.iconPath = undefined;

    // Use standard label (just filename)
    this.label = fileName;

    // Add colored status character on right using decorations
    this.decorations = [
      {
        badge: statusChar,
        color: statusColor,
        tooltip: tooltipText,
      },
    ];
  }

  /**
   * Getter for decorations
   */
  get decorations(): vscode.FileDecoration[] | undefined {
    return this._decorations;
  }

  /**
   * Setter for decorations
   */
  set decorations(value: vscode.FileDecoration[] | undefined) {
    this._decorations = value;
  }
}

/**
 * Class representing a folder item in the tree view
 */
export class FolderItem extends vscode.TreeItem {
  children: Map<string, FolderItem | FileItem> = new Map();

  constructor(public readonly name: string, public readonly path: string) {
    super(name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "folder";
    this.iconPath = new vscode.ThemeIcon("folder");
    this.tooltip = path;
  }

  /**
   * Add a child item to this folder or its subfolders
   * @param pathParts Array of path parts to process
   * @param file The file item to add
   * @param currentPath Current accumulated path
   */
  addChild(
    pathParts: string[],
    file: FileItem,
    currentPath: string = ""
  ): void {
    if (pathParts.length === 1) {
      // This is a file, add it directly to this folder
      this.children.set(pathParts[0], file);
    } else {
      // This is a subfolder
      const folderName = pathParts[0];
      const newPath = path.join(currentPath, folderName);

      // Create folder if it doesn't exist
      if (!this.children.has(folderName)) {
        this.children.set(folderName, new FolderItem(folderName, newPath));
      }

      // Get the folder and add the child to it
      const folder = this.children.get(folderName) as FolderItem;
      folder.addChild(pathParts.slice(1), file, newPath);
    }
  }
}
