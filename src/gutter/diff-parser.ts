/**
 * Represents a single change line within a diff hunk
 */
export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
}

/**
 * Represents a unified diff hunk (@@ ... @@)
 */
export interface DiffHunk {
  /** 1-indexed start line in the old file */
  oldStart: number;
  /** Number of lines from the old file in this hunk */
  oldLines: number;
  /** 1-indexed start line in the new file */
  newStart: number;
  /** Number of lines from the new file in this hunk */
  newLines: number;
  /** Raw hunk header line */
  header: string;
  changes: DiffLine[];
}

/**
 * Parse the output of `git diff` into an array of DiffHunk objects.
 * Lines before the first @@ header (file metadata) are ignored.
 */
export function parseDiffHunks(diffOutput: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffOutput.split("\n");

  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);

    if (match) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parseInt(match[1], 10),
        oldLines: match[2] !== undefined ? parseInt(match[2], 10) : 1,
        newStart: parseInt(match[3], 10),
        newLines: match[4] !== undefined ? parseInt(match[4], 10) : 1,
        header: line,
        changes: [],
      };
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith("+")) {
      currentHunk.changes.push({ type: "added", content: line.slice(1) });
    } else if (line.startsWith("-")) {
      currentHunk.changes.push({ type: "removed", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      currentHunk.changes.push({ type: "context", content: line.slice(1) });
    }
    // Lines starting with '\' (e.g. "\ No newline at end of file") are skipped
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}
