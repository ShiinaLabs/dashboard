import { prepareWithSegments, measureNaturalWidth } from "@chenglou/pretext";

const TICK_FONT = "11px system-ui";
const PADDING = 12;

export function calcYAxisWidth<T extends object>(data: T[], ...keys: string[]) {
  if (!data.length || !keys.length) return 30;
  const max = Math.max(...data.map(item => {
    const values = item as Record<string, unknown>;
    return Math.max(...keys.map(key => Number(values[key] ?? 0)));
  }));
  const formatted = max.toLocaleString();
  const prepared = prepareWithSegments(formatted, TICK_FONT);
  const textWidth = measureNaturalWidth(prepared);
  return Math.max(30, Math.ceil(textWidth) + PADDING);
}
