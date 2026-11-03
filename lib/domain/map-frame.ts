/**
 * Where the guide's maps sit on the page, and how a latitude and longitude
 * lands on them: millimetres from the frame's top left, north up. At
 * Jersey's size a flat projection, scaled for the latitude, is true to
 * well under a millimetre.
 */
export type MapFrame = {
  /** The frame on the page, mm. */
  width: number;
  height: number;
  /** The point at the frame's centre. */
  lat: number;
  lon: number;
  /** Millimetres on the page per kilometre on the ground. */
  mmPerKm: number;
};

const KM_PER_DEG_LAT = 111.2;

/**
 * The island across a spread, 230 × 165mm, sea to the edges: 1cm to the
 * kilometre, the island in the lower part, the index across the sea above.
 */
export const ISLAND_FRAME: MapFrame = { width: 230, height: 165, lat: 49.2280, lon: -2.135, mmPerKm: 10 };

/**
 * St Helier, 13 columns by 11 rows (A–M, 1–11) of 13.5mm squares, the
 * left of a spread; the place locator takes the rest of it.
 */
export const TOWN_GRID = { cols: 13, rows: 11, cell: 13.5 } as const;
export const TOWN_FRAME: MapFrame = {
  width: TOWN_GRID.cols * TOWN_GRID.cell,
  height: TOWN_GRID.rows * TOWN_GRID.cell,
  lat: 49.1846,
  lon: -2.1078,
  mmPerKm: 60,
};

export function project(f: MapFrame, lat: number, lon: number): [number, number] {
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((f.lat * Math.PI) / 180);
  const x = f.width / 2 + (lon - f.lon) * kmPerDegLon * f.mmPerKm;
  const y = f.height / 2 - (lat - f.lat) * KM_PER_DEG_LAT * f.mmPerKm;
  return [x, y];
}

export function inside(f: MapFrame, lat: number, lon: number): boolean {
  const [x, y] = project(f, lat, lon);
  return x >= 0 && y >= 0 && x <= f.width && y <= f.height;
}

/** A point's square on the St Helier grid, "F7"; null off the map. */
export function gridRef(lat: number, lon: number): string | null {
  const [x, y] = project(TOWN_FRAME, lat, lon);
  const col = Math.floor(x / TOWN_GRID.cell);
  const row = Math.floor(y / TOWN_GRID.cell);
  if (col < 0 || row < 0 || col >= TOWN_GRID.cols || row >= TOWN_GRID.rows) return null;
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}
