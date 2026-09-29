import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, WheelEvent } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  zoomInLabel: string;
  zoomOutLabel: string;
  resetZoomLabel: string;
  interactionHelp: string;
}

const WORLD_VIEWBOX = { x: -2.78, y: -1.48, width: 5.56, height: 2.96 };
const MAX_ZOOM = 8;

interface MapViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampViewBox(x: number, y: number, width: number): MapViewBox {
  const zoom = WORLD_VIEWBOX.width / width;
  const nextWidth = WORLD_VIEWBOX.width / Math.min(MAX_ZOOM, Math.max(1, zoom));
  const nextHeight = WORLD_VIEWBOX.height / Math.min(MAX_ZOOM, Math.max(1, zoom));
  return {
    x: Math.min(WORLD_VIEWBOX.x + WORLD_VIEWBOX.width - nextWidth, Math.max(WORLD_VIEWBOX.x, x)),
    y: Math.min(WORLD_VIEWBOX.y + WORLD_VIEWBOX.height - nextHeight, Math.max(WORLD_VIEWBOX.y, y)),
    width: nextWidth,
    height: nextHeight,
  };
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
  zoomInLabel,
  zoomOutLabel,
  resetZoomLabel,
  interactionHelp,
}: AnalyticsWorldMapProps) {
  const [focusedCode, setFocusedCode] = useState<string>();
  const [viewBox, setViewBox] = useState<MapViewBox>(WORLD_VIEWBOX);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStart = useRef<{ pointerId: number; clientX: number; clientY: number; viewBox: MapViewBox } | undefined>(undefined);
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
  const zoomLevel = WORLD_VIEWBOX.width / viewBox.width;

  function zoomMap(factor: number, clientX?: number, clientY?: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setViewBox((current) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(1, (WORLD_VIEWBOX.width / current.width) * factor));
      const nextWidth = WORLD_VIEWBOX.width / nextZoom;
      const nextHeight = WORLD_VIEWBOX.height / nextZoom;
      const focusX = clientX === undefined ? 0.5 : (clientX - rect.left) / rect.width;
      const focusY = clientY === undefined ? 0.5 : (clientY - rect.top) / rect.height;
      const anchorX = current.x + focusX * current.width;
      const anchorY = current.y + focusY * current.height;
      return clampViewBox(anchorX - focusX * nextWidth, anchorY - focusY * nextHeight, nextWidth);
    });
  }

  function resetMap() {
    setViewBox(WORLD_VIEWBOX);
  }

  function onMapWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    zoomMap(event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX, event.clientY);
  }

  function onMapPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, viewBox };
  }

  function onMapPointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = dragStart.current;
    const svg = svgRef.current;
    if (!start || !svg || start.pointerId !== event.pointerId) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((event.clientX - start.clientX) / rect.width) * start.viewBox.width;
    const dy = ((event.clientY - start.clientY) / rect.height) * start.viewBox.height;
    setViewBox(clampViewBox(start.viewBox.x - dx, start.viewBox.y - dy, start.viewBox.width));
  }

  function onMapPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (dragStart.current?.pointerId !== event.pointerId) return;
    dragStart.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onMapKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) return;
    const step = viewBox.width * 0.12;
    switch (event.key) {
      case "+":
      case "=":
        event.preventDefault();
        zoomMap(1.25);
        break;
      case "-":
        event.preventDefault();
        zoomMap(1 / 1.25);
        break;
      case "0":
        event.preventDefault();
        resetMap();
        break;
      case "ArrowLeft":
        event.preventDefault();
        setViewBox((current) => clampViewBox(current.x - step, current.y, current.width));
        break;
      case "ArrowRight":
        event.preventDefault();
        setViewBox((current) => clampViewBox(current.x + step, current.y, current.width));
        break;
      case "ArrowUp":
        event.preventDefault();
        setViewBox((current) => clampViewBox(current.x, current.y - current.height * 0.12, current.width));
        break;
      case "ArrowDown":
        event.preventDefault();
        setViewBox((current) => clampViewBox(current.x, current.y + current.height * 0.12, current.width));
        break;
      default:
        break;
    }
  }

  if (!hasMappedTraffic) {
    return <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return <div className="min-w-0" data-testid="analytics-world-map">
    <div className="relative">
      <div className="absolute right-3 top-3 z-10 flex gap-1.5">
        <Button type="button" variant="outline" size="icon" aria-label={zoomInLabel} title={zoomInLabel} disabled={zoomLevel >= MAX_ZOOM - 0.01} onClick={() => zoomMap(1.5)}>
          <ZoomIn aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label={zoomOutLabel} title={zoomOutLabel} disabled={zoomLevel <= 1.01} onClick={() => zoomMap(1 / 1.5)}>
          <ZoomOut aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label={resetZoomLabel} title={resetZoomLabel} disabled={zoomLevel <= 1.01} onClick={resetMap}>
          <RotateCcw aria-hidden="true" />
        </Button>
      </div>
      <svg
        ref={svgRef}
        className="block h-auto w-full cursor-grab overflow-hidden active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        data-zoom-level={zoomLevel.toFixed(2)}
        role="group"
        aria-label={title}
        aria-describedby="analytics-map-help"
        tabIndex={0}
        preserveAspectRatio="xMidYMid meet"
        style={{ touchAction: "none" }}
        onWheel={onMapWheel}
        onPointerDown={onMapPointerDown}
        onPointerMove={onMapPointerMove}
        onPointerUp={onMapPointerUp}
        onPointerCancel={onMapPointerUp}
        onKeyDown={onMapKeyDown}
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
              strokeWidth: 0.7,
              vectorEffect: "non-scaling-stroke",
            }}
            className="outline-none transition-colors focus-visible:stroke-foreground focus-visible:stroke-[2px]"
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
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span id="analytics-map-help">{interactionHelp}</span>
      <div className="flex items-center gap-2" aria-label={`${lessLabel} to ${moreLabel}`}>
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
    </div>
  </div>;
}
