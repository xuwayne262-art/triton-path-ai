import { test, describe } from "node:test";
import assert from "node:assert/strict";
// The data fetch's batching, which decides which sections get a seat time.
import { BATCH_COURSES, BATCH_SECTIONS, seatBatches } from "../../scripts/fetch-classplanner.mjs";

const course = (subject: string, number: string, sections: number) => ({
  subject_code: subject,
  course_code: number,
  sections: Array.from({ length: sections }, (_, i) => ({ section_id: `E ${subject}${number}-${String(i).padStart(3, "0")}` })),
});

describe("asking Class Planner when each section's seats were counted", () => {
  test("asks about every section, not one per course", () => {
    const courses = [course("BILD", "004", 36), course("CSE", "011", 6)];
    const asked = seatBatches(courses).flat();
    assert.equal(asked.length, 42);
    assert.equal(new Set(asked).size, 42);
  });

  test("keeps within the server's limits: 128 sections and 15 courses a request, ids sorted", () => {
    const courses = [
      course("SIO", "299", 156), // more sections than one request may hold
      ...Array.from({ length: 40 }, (_, i) => course("MATH", String(i + 1).padStart(3, "0"), 7)),
    ];
    const batches = seatBatches(courses);
    for (const ids of batches) {
      assert.ok(ids.length <= BATCH_SECTIONS, `${ids.length} sections`);
      const subjects = new Set(ids.map((id: string) => id.slice(2, id.indexOf("-"))));
      assert.ok(subjects.size <= BATCH_COURSES, `${subjects.size} courses`);
      assert.deepEqual(ids, [...ids].sort());
    }
    assert.equal(batches.flat().length, 156 + 40 * 7);
  });
});
