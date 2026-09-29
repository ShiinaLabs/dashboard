import countries from "./countries.json";

export interface CountryGeometry {
  code: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][][] | number[][][];
  };
}

const geometryAliases: Record<string, string> = {
  GBR: "GB",
  USA: "US",
};

export function resolveCountryGeometryCode(code: string): string | undefined {
  const normalized = geometryAliases[code] ?? code;
  return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

export const countryGeometries = countries as CountryGeometry[];

export function projectNaturalEarth1Coordinate([longitude, latitude]: number[]): [number, number] {
  const clippedLatitude = Math.max(-90, Math.min(90, latitude));
  const phi = (clippedLatitude * Math.PI) / 180;
  const lambda = (longitude * Math.PI) / 180;
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  // Natural Earth 1 raw projection polynomial, equivalent to d3-geo's geoNaturalEarth1.
  const x = lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4)));
  const y = phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
  return [x, y];
}

function ringPath(ring: number[][]): string {
  return ring.map((coordinate, index) => {
    const [x, y] = projectNaturalEarth1Coordinate(coordinate);
    return `${index === 0 ? "M" : "L"}${x.toFixed(4)},${(-y).toFixed(4)}`;
  }).join("") + "Z";
}

function polygonPath(polygon: number[][][]): string {
  return polygon.map(ringPath).join("");
}

function geometryPath(geometry: CountryGeometry["geometry"]): string {
  return geometry.type === "Polygon"
    ? polygonPath(geometry.coordinates as number[][][])
    : (geometry.coordinates as number[][][][]).map(polygonPath).join("");
}

export const projectedCountryPaths = countryGeometries.map(({ code, geometry }) => ({
  code,
  d: geometryPath(geometry),
}));
