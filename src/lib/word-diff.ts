export type DiffPart = { text: string; type: "same" | "added" | "removed" };

/** Word-level LCS diff between an original and an adapted transcript. */
export function diffWords(
  original: string,
  adapted: string,
): { original: DiffPart[]; adapted: DiffPart[] } {
  const a = original.trim().split(/\s+/).filter(Boolean);
  const b = adapted.trim().split(/\s+/).filter(Boolean);
  const width = b.length + 1;
  // Flat (a.length+1) × (b.length+1) LCS table.
  const table = new Uint32Array((a.length + 1) * width);
  const at = (i: number, j: number) => table[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const left: DiffPart[] = [];
  const right: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const wa = a[i] as string;
    const wb = b[j] as string;
    if (wa === wb) {
      left.push({ text: wa, type: "same" });
      right.push({ text: wb, type: "same" });
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      left.push({ text: wa, type: "removed" });
      i++;
    } else {
      right.push({ text: wb, type: "added" });
      j++;
    }
  }
  for (; i < a.length; i++) left.push({ text: a[i] as string, type: "removed" });
  for (; j < b.length; j++) right.push({ text: b[j] as string, type: "added" });
  return { original: left, adapted: right };
}
