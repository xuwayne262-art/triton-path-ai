import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canonicalRequest, isCanonicalRequest, outboundVocab } from "./outbound";

const vocab = outboundVocab({
  subjects: [{ code: "CSE", name: "Computer Science and Engineering" }, { code: "ECON", name: "Economics" }],
  areas: [{ area: "Modes of Inquiry · Humanities" }],
  courses: ["CSE 11", "ECON 110B", "ECON 1"],
});
const send = (t: string) => canonicalRequest(t, vocab);

describe("the request the model may see is rebuilt, not copied", () => {
  test("ordinary planning requests keep their meaning", () => {
    assert.equal(send("keep ECON 110B and find a GE after 10 a.m.").text, "keep ECON 110B and find a ge after 10am");
    assert.equal(send("Build a 12-16 unit quarter, no classes before 10am").text, "build a 12-16 unit quarter | no classes before 10am");
    assert.equal(send("no fridays please").text, "no fridays please");
    assert.equal(send("add the second option").text, "add the second option");
    assert.equal(send("undo").text, "undo");
    assert.equal(send("move cse11 to year 2 winter").text, "move CSE 11 to year 2 winter");
  });

  test("R1: a non-ASCII suffix is not carried along with an allowed word", () => {
    const r = send("find a course私密信息 after 10am");
    assert.equal(r.text, "find a after 10am");
    assert.deepEqual(r.withheld, ["course私密信息"]);
    assert.ok(!/[^\x20-\x7e]/.test(r.text));
  });

  test("combining marks, zero-width and compatibility characters never reach the output", () => {
    for (const t of ["find a coúrse after 10", "find a​secret course", "ｆｉｎｄ a course", "find a c‍ourse", "find­course"]) {
      const r = send(t);
      assert.ok(!/[^\x20-\x7e]/.test(r.text), `${JSON.stringify(t)} -> ${JSON.stringify(r.text)}`);
      assert.ok(isCanonicalRequest(r.text, vocab) || r.text === "", t);
    }
    // Folding can only ever produce lexicon words: "a​secret" becomes "asecret", which is not one.
    assert.ok(!send("find a​secret course").text.includes("secret"));
  });

  test("encoded-looking and unknown text is kept back, not forwarded", () => {
    for (const t of ["find a course %E7%A7%81 after 10", "find a course aGVsbG8= after 10", "find a course &#31169; after 10", "find a course \\u79c1 after 10"]) {
      const r = send(t);
      assert.match(r.text, /^find a course (\| )?after 10$/, t);
      assert.ok(r.withheld.length > 0, t);
      assert.ok(isCanonicalRequest(r.text, vocab), t);
    }
  });

  test("a reason clause stays on the device; the request around it goes", () => {
    const r = send("I need a light quarter because my mom is in the hospital, no fridays");
    assert.equal(r.text, "need a light quarter | no fridays");
    assert.ok(r.withheld.includes("hospital"));
  });

  test("first-person words are dropped, so a request is not about the person", () => {
    assert.equal(send("keep my CSE 11 and my current classes").text, "keep CSE 11 and current classes");
  });

  test("a sensitive statement in public words keeps nothing personal (R1 example)", () => {
    const r = send("depression is what I have; find a light course");
    assert.equal(r.text, "is what have | find a light course");
    assert.ok(r.withheld.includes("depression"));
    for (const t of ["I'm pregnant, morning classes only", "my dad died so I need easy classes", "I am on academic probation", "I'm undocumented and need DEI"]) {
      const out = send(t).text;
      for (const word of ["pregnant", "died", "dad", "probation", "undocumented"]) assert.ok(!out.includes(word), `${t} -> ${out}`);
    }
  });

  test("a request in another script is answered locally", () => {
    const r = send("我想找一门早上十点以后的课");
    assert.equal(r.unsupportedLanguage, true);
    assert.equal(r.meaningful, false);
  });

  test("a course code that is not in the catalog is not emitted", () => {
    const r = send("add CSE 999");
    assert.equal(r.text, "add cse");
    assert.ok(r.withheld.includes("999"));
  });
});

describe("isCanonicalRequest: the server's check", () => {
  test("accepts exactly what the browser builds", () => {
    for (const t of ["keep ECON 110B and find a GE after 10 a.m.", "Build a 12-16 unit quarter, no classes before 10am", "find a course私密信息 after 10am"]) {
      assert.equal(isCanonicalRequest(send(t).text, vocab), true, t);
    }
  });

  test("refuses anything else, raw requests included", () => {
    for (const t of [
      "find a course私密信息 after 10am",
      "depression is what I have; find a light course",
      "keep my CSE 11",
      "find a course after 10am ",
      "Find a course",
      "find a​ course",
      "find a course | | after 10am",
    ]) assert.equal(isCanonicalRequest(t, vocab), false, JSON.stringify(t));
  });
});
