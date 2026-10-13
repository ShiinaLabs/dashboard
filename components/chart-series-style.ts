/** Shared visual defaults for time-series strokes across dashboard charts. */
export const TREND_SERIES_STYLE = {
  type: "monotone",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  connectNulls: false,
  dot: false,
  activeDot: { r: 4, strokeWidth: 2 },
} as const;
