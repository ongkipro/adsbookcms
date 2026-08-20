import { test } from "node:test";
import assert from "node:assert/strict";
import { dailySeed, pickDaily } from "./daily-rotation.ts";

const catalogue = ["a", "b", "c", "d", "e", "f"];

test("the same day yields the same pick, a different day does not", () => {
  const monday = dailySeed(new Date("2026-08-20T01:00:00Z"));
  const mondayLate = dailySeed(new Date("2026-08-20T23:59:00Z"));
  const tuesday = dailySeed(new Date("2026-08-21T01:00:00Z"));

  assert.equal(monday, mondayLate);
  assert.deepEqual(pickDaily(catalogue, 3, monday), pickDaily(catalogue, 3, mondayLate));
  assert.notDeepEqual(pickDaily(catalogue, 3, monday), pickDaily(catalogue, 3, tuesday));
});

test("a pick never repeats an item", () => {
  for (const day of [20260820, 20260821, 20260901, 20270101]) {
    const picked = pickDaily(catalogue, 3, day);
    assert.equal(picked.length, 3);
    assert.equal(new Set(picked).size, 3);
    for (const item of picked) assert.ok(catalogue.includes(item));
  }
});

test("a catalogue no larger than the request is returned whole and in order", () => {
  // Three products must not be shuffled into a different order every day: with
  // nothing to choose between, rotation would only cost cache hits.
  assert.deepEqual(pickDaily(["a", "b", "c"], 3, 20260820), ["a", "b", "c"]);
  assert.deepEqual(pickDaily(["a"], 3, 20260820), ["a"]);
  assert.deepEqual(pickDaily([], 3, 20260820), []);
});

test("asking for nothing returns nothing rather than throwing", () => {
  assert.deepEqual(pickDaily(catalogue, 0, 20260820), []);
  assert.deepEqual(pickDaily(catalogue, -1, 20260820), []);
});

test("a zero seed still produces a valid pick", () => {
  // The generator dies on a zero state; the guard has to hold.
  const picked = pickDaily(catalogue, 3, 0);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
});
