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

const SQRT3 = Math.sqrt(3);

function project([longitude, latitude]: number[]): [number, number] {
  const phi = (Math.max(-90, Math.min(90, latitude)) * Math.PI) / 180;
  const lambda = (longitude * Math.PI) / 180;
  const theta = Math.asin((SQRT3 / 2) * Math.sin(phi));
  const theta2 = theta * theta;
  const xFactor = 0.8707 + theta2 * (-0.131979 + theta2 * (-0.013791 + theta2 * (0.003971 - 0.001529 * theta2)));
  const yFactor = 1.007226 + theta2 * (0.015085 + theta2 * (-0.044475 + theta2 * (0.028874 - 0.005916 * theta2)));
  return [lambda * Math.cos(theta) * xFactor, theta * yFactor];
}

function ringPath(ring: number[][]): string {
  return ring.map((coordinate, index) => {
    const [x, y] = project(coordinate);
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
