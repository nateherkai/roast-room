// Quote check tests: node --test app/scripts/test-quotes.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { checkQuotes } from "../lib/seats.mjs";

const one = (key, text) => checkQuotes(key, text).map(({ quote, source, verified }) => [quote, source, verified]);
const STICK = "Stick with big, 'easy' decisions and eschew activity.";

test("nested single and double quotes verify", () => {
  assert.deepEqual(one("buffett", `"${STICK}" (S090)`), [[STICK, "S090", true]]);
  const dbl = 'Stick with big, "easy" decisions and eschew activity.';
  assert.deepEqual(one("buffett", `He said: "${dbl}" (S090)`), [[dbl, "S090", true]]);
});

test("labelled source ids are read", () => {
  const r = one("buffett", `"We can afford to lose money but we can't afford to lose reputation." (Reputation, S028)`);
  assert.deepEqual(r.map((x) => x[1]), ["S028"]);
});

test("invented quotes are flagged, after a dash or comma too", () => {
  for (const lead of ["", "Graham—", "He said,"]) {
    const r = one("graham", `${lead}"Always raise the biggest round you possibly can get." (S011)`);
    assert.deepEqual(r, [["Always raise the biggest round you possibly can get.", "S011", false]], lead);
  }
});

test("an earlier separate quote stays out; an invented lead-in stays in", () => {
  const sep = one("buffett", `Buyers ask "which tool for my business," and that matters. "${STICK}" (S090)`);
  assert.deepEqual(sep, [[STICK, "S090", true]]);
  const lead = one("buffett", `"Totally invented opening words here. "${STICK}" (S090)`);
  assert.equal(lead[0][2], false);
});
