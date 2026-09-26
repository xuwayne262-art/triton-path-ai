import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  areaOf, clipToBox, footprintAt, metersToPolygon, polygonsOf, tileBox, tileOf, toPiece,
  type Box, type LngLat, type Polygon,
} from "./footprint";

const Z = 14;

/** A rectangle as a closed ring, [west, south] to [east, north]. */
const rect = (w: number, s: number, e: number, n: number): Polygon => [
  [[w, s], [e, s], [e, n], [w, n], [w, s]],
];

/** HSS, where UCSD's pin sits just outside the building's outline. */
const HSS: LngLat = [-117.24167, 32.87851];

describe("picking one building out of a merged tile feature", () => {
  test("a MultiPolygon of many buildings yields only the one under the pin", () => {
    // How OpenFreeMap ships them: every building of one height in one feature.
    const merged: GeoJSON.MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        rect(-117.2440, 32.8700, -117.2436, 32.8703),
        rect(-117.2420, 32.8783, -117.2413, 32.8788), // the one HSS's pin is in
        rect(-117.2300, 32.8790, -117.2290, 32.8799),
      ],
    };
    const pieces = polygonsOf(merged).map(toPiece);
    const fp = footprintAt([-117.2416, 32.8785], pieces, Z);
    assert.ok(fp);
    assert.equal(fp.parts.length, 1);
    assert.deepEqual(fp.parts[0][0][0], [-117.2420, 32.8783]);
  });

  test("a pin in a courtyard still names the building around it", () => {
    const withCourtyard: Polygon = [
      rect(-117.2420, 32.8780, -117.2410, 32.8790)[0],
      rect(-117.2417, 32.8783, -117.2413, 32.8787)[0].slice().reverse(),
    ];
    const fp = footprintAt([-117.2415, 32.8785], [toPiece(withCourtyard)], Z);
    assert.ok(fp);
    assert.equal(fp.parts[0].length, 2, "the courtyard stays a hole");
  });

  test("a pin at the door, a few metres outside, is close enough", () => {
    // 0.00008° of latitude is about 9 m.
    const building = rect(-117.2420, 32.8786, -117.2410, 32.8792);
    assert.ok(metersToPolygon(HSS, building) > 5);
    assert.ok(footprintAt(HSS, [toPiece(building)], Z));
  });

  test("a pin in a courtyard lights the wings around it, not just the nearest", () => {
    // HSS: four wings within 20 m, the named one not the closest. About 1e-4°
    // of latitude is 11 m; of longitude here, 9.3 m.
    const [x, y] = HSS;
    const north = rect(x - 0.0001, y + 0.00007, x + 0.0001, y + 0.00017); // ~8 m away
    const east = rect(x + 0.00012, y - 0.0001, x + 0.00022, y + 0.0001); // ~11 m
    const south = rect(x - 0.0001, y - 0.00022, x + 0.0001, y - 0.00012); // ~13 m
    const acrossTheWalk = rect(x - 0.0004, y - 0.0001, x - 0.0003, y + 0.0001); // ~28 m
    const fp = footprintAt(HSS, [north, east, south, acrossTheWalk].map(toPiece), Z);
    assert.ok(fp);
    assert.equal(fp.parts.length, 3);
  });

  test("from a door, the building across the walkway is not included", () => {
    const [x, y] = HSS;
    const door = rect(x - 0.0001, y + 0.00002, x + 0.0001, y + 0.00012); // ~2 m away
    const across = rect(x - 0.0001, y - 0.00022, x + 0.0001, y - 0.00012); // ~13 m away
    const fp = footprintAt(HSS, [door, across].map(toPiece), Z);
    assert.ok(fp);
    assert.equal(fp.parts.length, 1);
    assert.deepEqual(fp.parts[0][0][0], door[0][0]);
  });

  test("nothing within 20 m means no highlight rather than the wrong one", () => {
    const far = rect(-117.2420, 32.8792, -117.2410, 32.8800); // ~45 m north of the pin
    assert.equal(footprintAt(HSS, [toPiece(far)], Z), null);
  });

  test("lines and points are not buildings", () => {
    assert.deepEqual(polygonsOf({ type: "LineString", coordinates: [[0, 0], [1, 1]] }), []);
    assert.deepEqual(polygonsOf(null), []);
  });
});

describe("tiles", () => {
  test("a point is inside the box of the tile it belongs to", () => {
    const t = tileOf(HSS, Z);
    const [w, s, e, n] = tileBox(t, Z);
    assert.ok(HSS[0] >= w && HSS[0] < e && HSS[1] >= s && HSS[1] < n);
  });

  test("neighbouring tiles share an edge exactly", () => {
    const t = tileOf(HSS, Z);
    assert.equal(tileBox(t, Z)[3], tileBox({ x: t.x, y: t.y - 1 }, Z)[1]);
    assert.equal(tileBox(t, Z)[2], tileBox({ x: t.x + 1, y: t.y }, Z)[0]);
  });

  test("clipping keeps what is inside the box and cuts on its edge", () => {
    const clipped = clipToBox(rect(0, 0, 10, 10), [5, -1, 20, 20]);
    assert.ok(clipped);
    assert.ok(clipped[0].every(([x]) => x >= 5));
    assert.ok(Math.abs(areaOf(clipped) - areaOf(rect(5, 0, 10, 10))) < 1e-3 * areaOf(rect(5, 0, 10, 10)));
    assert.equal(clipToBox(rect(0, 0, 1, 1), [5, 5, 6, 6]), null);
  });
});

describe("a building cut in two by a tile edge", () => {
  // A tile edge runs through the middle of campus near Price Center. Build a
  // building straddling it, then cut it the way the tile server does: each
  // tile keeps its own share plus a margin of its neighbour's ground.
  const south = tileOf([-117.2360, 32.8790], Z);
  const edge = tileBox(south, Z)[3];
  const building = rect(-117.2366, edge - 0.0006, -117.2354, edge + 0.0004);
  const margin = 0.0003; // ~30 m, about what the tiles carry
  const southBox = tileBox(south, Z);
  const northBox = tileBox({ x: south.x, y: south.y - 1 }, Z);
  const grow = ([w, s, e, n]: Box, d: number): Box => [w - d, s - d, e + d, n + d];
  const pieces = [
    clipToBox(building, grow(southBox, margin))!,
    clipToBox(building, grow(northBox, margin))!,
  ].map(toPiece);

  test("both tiles' shares come back, from either side of the edge", () => {
    for (const pin of [[-117.2360, edge - 0.0003], [-117.2360, edge + 0.0002]] as LngLat[]) {
      const fp = footprintAt(pin, pieces, Z);
      assert.ok(fp);
      assert.equal(fp.parts.length, 2);
    }
  });

  test("the shares meet without overlapping, so the fill is even", () => {
    const fp = footprintAt([-117.2360, edge - 0.0003], pieces, Z)!;
    const total = fp.parts.reduce((a, p) => a + areaOf(p), 0);
    assert.ok(Math.abs(total - areaOf(building)) / areaOf(building) < 0.01, `${total} vs ${areaOf(building)}`);
  });

  test("the outline has no seam along the tile edge", () => {
    const fp = footprintAt([-117.2360, edge - 0.0003], pieces, Z)!;
    const onEdge = (p: LngLat) => Math.abs(p[1] - edge) < 1e-9;
    for (const line of fp.outline) {
      for (let i = 0; i + 1 < line.length; i++) {
        assert.ok(!(onEdge(line[i]) && onEdge(line[i + 1])), "a segment runs along the seam");
      }
    }
  });

  test("with the neighbour's tile not loaded, the share in view still shows", () => {
    const fp = footprintAt([-117.2360, edge - 0.0003], [pieces[0]], Z)!;
    assert.ok(fp.parts.length >= 1);
    assert.ok(fp.parts.every((p) => p[0].every(([, y]) => y <= edge + margin + 1e-9)));
  });
});
