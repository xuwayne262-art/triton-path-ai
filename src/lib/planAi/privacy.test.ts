import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInterpretRequest, onlyAllowedFields, screenSensitive } from "./privacy";

test("ordinary planning requests may go to the model", () => {
  for (const text of [
    "warren social science pofc with no prerequisites",
    "Build a 12-16 unit quarter, no classes before 10",
    "find a course about climate that fits",
    "A GE in the afternoon",
  ]) assert.deepEqual(screenSensitive(text), [], text);
});

test("personal and academic details are kept back", () => {
  const cases: [string, string][] = [
    ["reach me at alex@ucsd.edu", "email"],
    ["call 858-555-0134", "phone"],
    ["my PID is A12345678", "student-id"],
    ["my gpa is 3.42", "gpa"],
    ["I got an A- in MATH 20A", "grades"],
    ["I failed CSE 12 last year", "grades"],
    ["My name is Alex Rivera", "name"],
    ["see https://example.com/my-audit", "link"],
    ["CSE 11 Intro to Programming 4.00 A\nMATH 20A Calculus 4.00 B+\nWCWP 10A Writing 4.00 A-", "record-paste"],
    ["x".repeat(401), "too-long"],
  ];
  for (const [text, reason] of cases) assert.ok(screenSensitive(text).includes(reason as never), `${reason}: ${text.slice(0, 40)}`);
});

test("the outbound body is built from an allowlist and nothing else", () => {
  const built = buildInterpretRequest("  no classes before 10  ", { options: 7, pending: true, ...({ plan: ["CSE 11"], email: "a@ucsd.edu" } as object) } as { options: number; pending: boolean });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.deepEqual(built.body, { text: "no classes before 10", context: { options: 3, pending: true } });
  assert.deepEqual(Object.keys(built.body).sort(), ["context", "text"]);
  assert.ok(onlyAllowedFields(built.body));
  assert.equal(onlyAllowedFields({ ...built.body, history: {} }), false);
  assert.equal(onlyAllowedFields({ text: "x", context: { options: 0, pending: false, plan: 1 } }), false);
  const blocked = buildInterpretRequest("I got a C in CSE 20", { options: 0, pending: false });
  assert.equal(blocked.ok, false);
});
