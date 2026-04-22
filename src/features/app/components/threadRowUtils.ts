type RootRowGroup<Row extends { depth: number }> = {
  root: Row;
  rootIndex: number;
  rows: Row[];
};

export function splitRowsByRoot<Row extends { depth: number }>(
  rows: Row[],
): RootRowGroup<Row>[] {
  const groups: RootRowGroup<Row>[] = [];
  let current: Row[] = [];
  let currentRootIndex = 0;

  rows.forEach((row, rowIndex) => {
    if (row.depth === 0 && current.length > 0) {
      groups.push({
        root: current[0],
        rootIndex: currentRootIndex,
        rows: current,
      });
      current = [row];
      currentRootIndex = rowIndex;
      return;
    }
    if (current.length === 0) {
      currentRootIndex = rowIndex;
    }
    current.push(row);
  });

  if (current.length > 0) {
    groups.push({
      root: current[0],
      rootIndex: currentRootIndex,
      rows: current,
    });
  }

  return groups;
}

export function countRootRows<Row extends { depth: number }>(rows: Row[]) {
  return splitRowsByRoot(rows).length;
}
