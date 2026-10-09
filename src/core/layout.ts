export interface Block {
  key: string;
  start: number;
  end: number;
}

export interface Placed {
  key: string;
  /** Zero-based column within its overlap cluster. */
  col: number;
  /** Number of columns in the cluster, so width = 1 / cols. */
  cols: number;
}

/**
 * Lays out overlapping blocks side by side (as in a week view day column).
 * Blocks that merely touch (a.end === b.start) do not overlap.
 */
export function layoutColumns(blocks: readonly Block[]): Map<string, Placed> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map<string, Placed>();

  let cluster: { block: Block; col: number }[] = [];
  let clusterEnd = -Infinity;
  let columnEnds: number[] = [];

  const flush = () => {
    const cols = columnEnds.length;
    for (const { block, col } of cluster) result.set(block.key, { key: block.key, col, cols });
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const block of sorted) {
    if (block.start >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= block.start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(block.end);
    } else {
      columnEnds[col] = block.end;
    }
    cluster.push({ block, col });
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  flush();
  return result;
}
