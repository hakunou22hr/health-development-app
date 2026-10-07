import test from "node:test";
import assert from "node:assert/strict";
import { foods, activities } from "../shared/foods.mjs";
import {
  totals,
  exerciseKcal,
  exerciseMinutes,
  dateKey,
  validDate,
  validMeal,
  parseBackup,
} from "../shared/domain.mjs";
const rice = { id: "i1", foodId: "rice", name: "ご飯", grams: 150 };
const meal = {
  id: "m1",
  title: "昼ご飯",
  kind: "昼食",
  date: "2026-10-07",
  items: [rice],
};
test("100g source catalogue and proportional portion calculation", () => {
  assert.equal(totals([rice]).energy, 234);
  assert.equal(totals([rice]).protein, 3.75);
  assert.equal(totals([rice]).sugar, 53.4);
  assert.equal(
    totals([rice, { ...rice, id: "i2", foodId: "oil", grams: 5 }]).energy,
    278.7,
  );
  assert.equal(new Set(foods.map((f) => f.id)).size, foods.length);
});
test("unknown foods and invalid amounts remain unresolved rather than silently becoming rice", () => {
  for (const i of [
    { ...rice, foodId: "curry" },
    { ...rice, grams: -1 },
    { ...rice, grams: NaN },
    { ...rice, grams: 3001 },
  ]) {
    assert.equal(totals([i]).unresolved, 1);
    assert.equal(validMeal({ ...meal, items: [i] }), false);
  }
});
test("custom label nutrients are scaled, with inconsistent fiber rejected", () => {
  const custom = {
    ...rice,
    foodId: "custom",
    grams: 50,
    custom: { energy: 200, protein: 10, fat: 5, carbs: 25, fiber: 3, salt: 1 },
  };
  assert.equal(totals([custom]).energy, 100);
  assert.equal(totals([custom]).sugar, 11);
  assert.equal(
    totals([{ ...custom, custom: { ...custom.custom, fiber: 50 } }]).unresolved,
    1,
  );
});
test("gross and net MET calories and inverse exercise duration agree", () => {
  assert.equal(exerciseKcal(3.5, 60, 30, "gross"), 110.25);
  assert.equal(exerciseKcal(3.5, 60, 30, "net"), 78.75);
  assert.equal(exerciseMinutes(110.25, 3.5, 60, "gross"), 30);
  for (const a of activities) {
    const kcal = exerciseKcal(a.met, 60, 20);
    assert.ok(Math.abs(exerciseMinutes(kcal, a.met, 60) - 20) < 1e-9);
  }
  assert.throws(() => exerciseMinutes(100, 3.5, 0));
  assert.throws(() => exerciseKcal(3.5, 60, -1));
});
test("local date keys survive month boundaries and leap years", () => {
  assert.equal(dateKey(new Date(2026, 9, 7, 0, 0)), "2026-10-07");
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2026-13-01"), false);
});
test("backup validates all records and strips photo, API-key and unknown properties", () => {
  const imported = parseBackup({
    version: 1,
    meals: [{ ...meal, photo: "secret" }],
    activityLogs: [],
    apiKey: "secret",
  });
  assert.equal(imported.meals[0].photo, undefined);
  assert.equal(imported.apiKey, undefined);
  assert.throws(() =>
    parseBackup({ version: 1, meals: [meal, meal], activityLogs: [] }),
  );
  assert.throws(() =>
    parseBackup({
      version: 1,
      meals: [{ ...meal, items: [{ ...rice, grams: -2 }] }],
      activityLogs: [],
    }),
  );
});
