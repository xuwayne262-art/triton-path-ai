import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { minimizeForModel, outboundVocab, withinOutboundVocab } from "./outbound";

const vocab = outboundVocab({
  subjects: [{ code: "CSE", name: "Computer Science and Engineering" }, { code: "ECON", name: "Economics" }],
  areas: [{ area: "Humanities" }],
  titles: ["Climate Change and Society", "Film History", "The Great Depression"],
});

describe("minimizeForModel", () => {
  test("ordinary planning requests go out unchanged", () => {
    for (const text of [
      "warren social science pofc with no prerequisites",
      "Build a 12-16 unit quarter, no classes before 10am",
      "find a course about climate that fits",
      "keep ECON 110B and find a GE after 10 a.m.",
      "add the second option",
      "move CSE 11 to year 2 winter",
    ]) {
      const m = minimizeForModel(text, vocab);
      assert.deepEqual(m.withheld, [], text);
      assert.equal(m.meaningful, true, text);
    }
  });

  test("words outside the public vocabulary stay here", () => {
    const m = minimizeForModel("I need easy classes because my roommate Jordan keeps me up", vocab);
    assert.ok(m.withheld.includes("roommate"));
    assert.ok(m.withheld.includes("Jordan"));
    assert.ok(!m.text.includes("roommate") && !m.text.includes("Jordan"));
    assert.match(m.text, /easy classes/);
  });

  test("a public word after a first-person lead is still withheld", () => {
    // "depression" is in a course title, but "my depression" is about the student.
    const m = minimizeForModel("light load, my depression is bad this quarter", vocab);
    assert.ok(m.withheld.includes("depression"), JSON.stringify(m));
    const ok = minimizeForModel("my plan needs a film course", vocab);
    assert.deepEqual(ok.withheld, []);
  });

  test("a request that is nothing but filler is not worth sending", () => {
    assert.equal(minimizeForModel("please help me", vocab).meaningful, false);
    assert.equal(minimizeForModel("my probation", vocab).meaningful, false);
  });
});

describe("withinOutboundVocab", () => {
  test("accepts what the browser may send, placeholders included", () => {
    const m = minimizeForModel("a GE after 10 because of my shift at Target", vocab);
    assert.ok(m.withheld.length > 0);
    assert.equal(withinOutboundVocab(m.text, vocab), true, m.text);
  });

  test("refuses words the browser should have withheld", () => {
    assert.equal(withinOutboundVocab("a GE after 10 because of my shift at Target", vocab), false);
  });
});

describe("a clause that withheld a word", () => {
  const v = outboundVocab({ subjects: [{ code: "CSE", name: "Computer Science" }], titles: ["Cancer Biology"] });

  test("sends only planning words for the rest of it", () => {
    const m = minimizeForModel("my mom has cancer so mornings only", v);
    assert.ok(m.withheld.includes("cancer"), JSON.stringify(m));
    assert.match(m.text, /mornings only/);
  });

  test("starts fresh after punctuation", () => {
    const m = minimizeForModel("my mom is sick. a cancer biology course", v);
    assert.ok(!m.withheld.includes("cancer"), JSON.stringify(m));
  });

  test("a subject code after 'my' is a planning word", () => {
    assert.deepEqual(minimizeForModel("keep my CSE 12 and find a GE", v).withheld, []);
  });
});
