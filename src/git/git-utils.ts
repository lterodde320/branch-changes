import { exec } from "child_process";
import * as vscode from "vscode";
import { GitExtension, API } from "../git";
import { isGitRepository } from "../utils/workspace";

/**
 * Execute a Git command and return the result as a Promise
 * @param command Git command to execute
 * @param workspaceRoot Path to the workspace root
 * @returns Promise with command stdout
 */
export function executeGitCommand(
  command: string,
  workspaceRoot: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Check if we're in a Git repository before executing commands
    if (!isGitRepository(workspaceRoot)) {
      reject(new Error("Not a Git repository"));
      return;
    }

    console.log(`Executing Git command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
      if (error) {
        console.log("Git error:", error);
        console.log("stderr:", stderr);
        console.log("stdout:", stdout);
        reject(error);
        return;
      }

      resolve(stdout.trim());
    });
  });
}

/**
 * Get the current branch name
 * @param workspaceRoot Path to the workspace root
 * @returns Promise with the current branch name
 */
export function getCurrentBranch(workspaceRoot: string): Promise<string> {
  // First check if we're in a Git repository
  if (!isGitRepository(workspaceRoot)) {
    return Promise.resolve("Not a Git repository");
  }
  return executeGitCommand("git rev-parse --abbrev-ref HEAD", workspaceRoot);
}

/**
 * Get all available branches in the repository
 * @param workspaceRoot Path to the workspace root
 * @returns Promise with an array of branch names
 */
export function getAllBranches(workspaceRoot: string): Promise<string[]> {
  if (!isGitRepository(workspaceRoot)) {
    return Promise.resolve([]);
  }
  return executeGitCommand(
    'git branch --format="%(refname:short)"',
    workspaceRoot
  ).then((output) => output.split("\n").filter((b) => b.trim() !== ""));
}

/**
 * Detect the default source branch to compare against
 * @param workspaceRoot Path to the workspace root
 * @returns Promise with the default source branch name
 */
export function getDefaultSourceBranch(workspaceRoot: string): Promise<string> {
  if (!isGitRepository(workspaceRoot)) {
    return Promise.resolve("main"); // Default when not in a Git repo
  }

  return new Promise((resolve) => {
    // Try to get the tracking branch first
    executeGitCommand(
      "git for-each-ref --format='%(upstream:short)' \"$(git symbolic-ref -q HEAD)\"",
      workspaceRoot
    )
      .then((upstream) => {
        if (upstream) {
          // Remove remote part if present (e.g., origin/main -> main)
          const sourceBranch = upstream.includes("/")
            ? upstream.split("/")[1]
            : upstream;
          resolve(sourceBranch);
          return sourceBranch; // Return the value to maintain Promise chain
        }

        // If no tracking branch, look for common base branches
        return executeGitCommand(
          "git branch -l main master develop",
          workspaceRoot
        );
      })
      .then((branches) => {
        if (!branches) {
          resolve("main"); // Default fallback
          return;
        }

        const branchList = branches
          .split("\n")
          .map((b) => b.trim().replace("* ", ""))
          .filter((b) => b !== "");

        if (branchList.length > 0) {
          resolve(branchList[0]);
          return;
        }

        // Last resort
        resolve("main");
      })
      .catch(() => resolve("main")); // Default fallback on error
  });
}

/**
 * Get staged files in the repository
 * @param workspaceRoot Path to the workspace root
 * @returns Promise with an array of staged file paths
 */
export function getStagedFiles(workspaceRoot: string): Promise<string[]> {
  if (!isGitRepository(workspaceRoot)) {
    return Promise.resolve([]);
  }

  return executeGitCommand("git diff --name-only --cached", workspaceRoot)
    .then((output) => {
      const files = output.split("\n").filter((line) => line !== "");
      console.log("Staged files:", files);
      return files;
    })
    .catch((error) => {
      console.log("Git error getting staged files:", error);
      return [];
    });
}

/**
 * Get unstaged files in the repository
 * @param workspaceRoot Path to the workspace root
 * @returns Promise with an array of unstaged file paths
 */
export function getUnstagedFiles(workspaceRoot: string): Promise<string[]> {
  if (!isGitRepository(workspaceRoot)) {
    return Promise.resolve([]);
  }

  return executeGitCommand("git diff --name-only", workspaceRoot)
    .then((output) => {
      const files = output.split("\n").filter((line) => line !== "");
      console.log("Unstaged files:", files);
      return files;
    })
    .catch((error) => {
      console.log("Git error getting unstaged files:", error);
      return [];
    });
}

/**
 * Get files changed between current branch and source branch
 * @param workspaceRoot Path to the workspace root
 * @param sourceBranch Source branch to compare against
 * @returns Promise with an array of committed file paths
 */
export function getCommittedFiles(
  workspaceRoot: string,
  sourceBranch: string
): Promise<string[]> {
  if (!isGitRepository(workspaceRoot)) {
    return Promise.resolve([]);
  }

  const gitCommand = `git diff --name-only $(git merge-base HEAD ${sourceBranch})..HEAD 2>&1`;

  return executeGitCommand(gitCommand, workspaceRoot)
    .then((output) => {
      const files = output.split("\n").filter((line) => line !== "");
      console.log("Committed changed files:", files);
      return files;
    })
    .catch((error) => {
      vscode.window.showErrorMessage(
        "Error fetching changed files: " + error.message
      );
      return [];
    });
}

/**
 * Get the VS Code built-in Git API
 * @returns Promise with the Git API instance
 */
export async function getBuiltInGitApi(): Promise<API | undefined> {
  try {
    const extension = vscode.extensions.getExtension(
      "vscode.git"
    ) as vscode.Extension<GitExtension>;

    if (extension !== undefined) {
      const gitExtension = extension.isActive
        ? extension.exports
        : await extension.activate();

      return gitExtension.getAPI(1);
    }
  } catch (error) {
    console.error("Failed to get Git API:", error);
  }

  return undefined;
}
