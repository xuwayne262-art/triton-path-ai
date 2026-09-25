import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sectionTssUrl, sectionWaitlist } from "./sections";
import type { SectionTuple } from "./plat";

/** A section tuple in the shape fetch-classplanner.mjs emits. */
function section(over: Partial<{
  code: string; type: string; avail: number | null; limit: number | null;
  waitlist: number; pkg: string[];
}> = {}): SectionTuple {
  return [
    over.code ?? "A01", over.type ?? "DI", "Tu", "3:00p", "3:50p",
    "RCLAS", "", "Michael Overton",
    over.avail ?? 5, over.limit ?? 82, 0,
    over.waitlist ?? 0, 77, "E 00004126", over.pkg ?? ["151469"], 900, 950,
  ];
}

/** The real URL UCSD's own Class Planner hands out for BIEB 102 / package 151469. */
const COURSE_URL =
  "https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD"
  + "&/Detail/EventPackage/SM/1456/00000000/0/0/0"
  + "/00000000-0000-0000-0000-000000000000/151469/2026/2/?";

describe("sectionTssUrl", () => {
  test("swaps in the picked section's own enrolment package", () => {
    const url = sectionTssUrl(section({ pkg: ["151472"] }), COURSE_URL);
    assert.equal(
      url,
      "https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD"
      + "&/Detail/EventPackage/SM/1456/00000000/0/0/0"
      + "/00000000-0000-0000-0000-000000000000/151472/2026/2/?",
    );
  });

  test("keeps the module, year and period untouched", () => {
    const url = sectionTssUrl(section({ pkg: ["151470"] }), COURSE_URL);
    assert.match(url, /\/SM\/1456\//);
    assert.match(url, /\/151470\/2026\/2\/\?$/);
  });

  test("leaves the route unescaped — SAP's router cannot match an encoded one", () => {
    const url = sectionTssUrl(section(), COURSE_URL);
    assert.ok(!url.includes("%2F"), "no encoded slashes");
    assert.ok(url.includes("#ZUSModule-display?TileType=MYMOD&/"), "fragment kept raw");
  });

  test("falls back to the course link when the section spans several packages", () => {
    // A lecture's package list covers every discussion under it, so it cannot
    // name one section to book.
    const lecture = section({ code: "A00", type: "LE", pkg: ["151469", "151470", "151471"] });
    assert.equal(sectionTssUrl(lecture, COURSE_URL), COURSE_URL);
  });

  test("returns nothing when the course has no TSS module", () => {
    assert.equal(sectionTssUrl(section(), null), "");
    assert.equal(sectionTssUrl(section({ pkg: [] }), null), "");
  });
});

describe("sectionWaitlist", () => {
  test("reads the queue length", () => {
    assert.equal(sectionWaitlist(section({ waitlist: 15 })), 15);
  });

  test("distinguishes an empty queue from an unknown one", () => {
    assert.equal(sectionWaitlist(section({ waitlist: 0 })), 0);
    // A tuple cached before the field existed stops at position 10.
    const legacy = ["A01", "DI", "Tu", "3:00p", "3:50p", "RCLAS", "", "X", 5, 82, 0] as unknown as SectionTuple;
    assert.equal(sectionWaitlist(legacy), null);
  });
});
