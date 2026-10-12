/** Mark isolated zeroes and sample long runs so 90-day charts stay legible. */
export function zeroMarkerIndices(values: (number | null)[]): Set<number> {
  const indices = new Set<number>();
  for (let index = 0; index < values.length; index++) {
    if (values[index] !== 0) continue;
    const adjacentToOtherValue = (index > 0 && values[index - 1] !== 0) || (index < values.length - 1 && values[index + 1] !== 0);
    if (index % 7 === 0 || adjacentToOtherValue) indices.add(index);
  }
  return indices;
}
