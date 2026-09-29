import { useMemo, useState } from "react";
import { countryGeometries, projectedCountryPaths, resolveCountryGeometryCode } from "./world-map/geometry";

export interface CountryTraffic {
  country: string;
  views: number;
}

interface AnalyticsWorldMapProps {
  countries: CountryTraffic[];
  totalViews: number;
  locale: string;
  title: string;
  emptyMessage: string;
  lessLabel: string;
  moreLabel: string;
  viewsLabel: string;
}

function displayCountryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function AnalyticsWorldMap({
  countries,
  totalViews,
  locale,
  title,
  emptyMessage,
  lessLabel,
  moreLabel,
  viewsLabel,
}: AnalyticsWorldMapProps) {
  const [focusedCode, setFocusedCode] = useState<string>();
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const percent = useMemo(() => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }), [locale]);
  const trafficByCode = useMemo(() => {
    const values = new Map<string, number>();
    for (const country of countries) {
      if (country.country === "Unknown" || country.views <= 0) continue;
      const code = resolveCountryGeometryCode(country.country);
      if (code) values.set(code, (values.get(code) ?? 0) + country.views);
    }
    return values;
  }, [countries]);
  const maxViews = Math.max(0, ...trafficByCode.values());
  const hasMappedTraffic = projectedCountryPaths.some(({ code }) => trafficByCode.has(code));
  const visibleCountries = countryGeometries.filter(({ code }) => trafficByCode.has(code));
  const focusedCountry = visibleCountries.find(({ code }) => code === focusedCode);
  const focusedViews = focusedCountry ? trafficByCode.get(focusedCountry.code) ?? 0 : 0;

  if (!hasMappedTraffic) {
    return <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return <div className="min-w-0" data-testid="analytics-world-map">
    <div className="sr-only" role="img" aria-label={title} />
    <div className="relative">
      <svg
        className="block h-auto w-full overflow-visible"
        viewBox="-2.78 -1.48 5.56 2.96"
        role="group"
        aria-label={title}
        preserveAspectRatio="xMidYMid meet"
      >
        {projectedCountryPaths.map(({ code, d }) => {
          const views = trafficByCode.get(code) ?? 0;
          const active = views > 0;
          const intensity = active && maxViews > 0
            ? Math.max(1, Math.ceil((Math.log1p(views) / Math.log1p(maxViews)) * 5))
            : 0;
          const label = active
            ? `${displayCountryName(code, locale)}, ${number.format(views)} ${viewsLabel.toLocaleLowerCase(locale)}, ${percent.format(totalViews > 0 ? views / totalViews : 0)}`
            : displayCountryName(code, locale);
          return <path
            key={code}
            d={d}
            data-country-code={code}
            data-active={String(active)}
            data-intensity={intensity}
            aria-label={active ? label : undefined}
            aria-describedby={active && focusedCode === code ? "analytics-map-tooltip" : undefined}
            role={active ? "button" : undefined}
            tabIndex={active ? 0 : undefined}
            onFocus={() => active && setFocusedCode(code)}
            onBlur={() => setFocusedCode(undefined)}
            onMouseEnter={() => active && setFocusedCode(code)}
            onMouseLeave={() => setFocusedCode(undefined)}
            style={{
              fill: active ? `color-mix(in srgb, var(--chart-1) ${20 + intensity * 12}%, var(--muted))` : "var(--muted)",
              stroke: "var(--border)",
              strokeWidth: 0.008,
            }}
            className="outline-none transition-colors focus-visible:stroke-foreground focus-visible:stroke-[0.02px]"
          />;
        })}
      </svg>
      {focusedCountry ? <div
        id="analytics-map-tooltip"
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      >
        <div className="font-medium">{displayCountryName(focusedCountry.code, locale)}</div>
        <div>{number.format(focusedViews)} {viewsLabel.toLocaleLowerCase(locale)} · {percent.format(totalViews > 0 ? focusedViews / totalViews : 0)}</div>
      </div> : null}
    </div>
    <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground" aria-label={`${lessLabel} to ${moreLabel}`}>
      <span>{lessLabel}</span>
      <span className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((intensity) => <span
          key={intensity}
          className="size-3 rounded-sm border border-border"
          style={{ backgroundColor: `color-mix(in srgb, var(--chart-1) ${20 + intensity * 12}%, var(--muted))` }}
        />)}
      </span>
      <span>{moreLabel}</span>
    </div>
  </div>;
}
