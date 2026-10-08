import { foodById, activities } from "./foods.mjs";
export const nutrientKeys = [
  "energy",
  "protein",
  "fat",
  "carbs",
  "fiber",
  "salt",
];
export function finite(value, min, max) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
export function validNutrients(n) {
  return (
    n &&
    nutrientKeys.every((k) => finite(n[k], 0, k === "energy" ? 1000 : 100)) &&
    n.fiber <= n.carbs &&
    n.protein + n.fat + n.carbs <= 102
  );
}
export function itemNutrients(item) {
  const food = item.foodId === "custom" ? item.custom : foodById[item.foodId];
  if (!food || !validNutrients(food) || !finite(item.grams, 1, 3000))
    return null;
  return Object.fromEntries(
    nutrientKeys.map((k) => [k, (food[k] * item.grams) / 100]),
  );
}
/** @returns {Record<string, number>} */
export function totals(items) {
  const total = Object.fromEntries(nutrientKeys.map((k) => [k, 0]));
  let unresolved = 0;
  for (const item of items) {
    const n = itemNutrients(item);
    if (!n) {
      unresolved++;
      continue;
    }
    for (const k of nutrientKeys) total[k] += n[k];
  }
  return {
    ...total,
    sugar: Math.max(0, total.carbs - total.fiber),
    unresolved,
  };
}
export function exerciseKcal(met, weight, minutes, mode = "net") {
  if (
    !finite(met, 1.01, 20) ||
    !finite(weight, 20, 300) ||
    !finite(minutes, 0, 1440)
  )
    throw Error("体重・時間を確認してください。");
  return (((mode === "net" ? met - 1 : met) * weight * minutes) / 60) * 1.05;
}
export function exerciseMinutes(energy, met, weight, mode = "net") {
  if (!finite(energy, 0, 10000)) throw Error("エネルギーを確認してください。");
  return (energy / exerciseKcal(met, weight, 60, mode)) * 60;
}
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00");
  return !Number.isNaN(d.getTime()) && dateKey(d) === s;
}
export function validItem(i) {
  return (
    i &&
    typeof i.id === "string" &&
    typeof i.name === "string" &&
    i.name.trim().length > 0 &&
    i.name.length <= 100 &&
    itemNutrients(i) !== null
  );
}
export function validMeal(m) {
  return (
    m &&
    typeof m.id === "string" &&
    validDate(m.date) &&
    ["朝食", "昼食", "夕食", "間食"].includes(m.kind) &&
    typeof m.title === "string" &&
    m.title.length <= 100 &&
    Array.isArray(m.items) &&
    m.items.length > 0 &&
    m.items.length <= 30 &&
    m.items.every(validItem)
  );
}
export function validActivity(a) {
  return (
    a &&
    typeof a.id === "string" &&
    validDate(a.date) &&
    activities.some((x) => x.id === a.activityId) &&
    finite(a.minutes, 1, 240) &&
    finite(a.weight, 20, 300) &&
    ["net", "gross"].includes(a.mode)
  );
}
export function parseBackup(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.meals) ||
    !Array.isArray(value.activityLogs) ||
    value.meals.length > 10000 ||
    value.activityLogs.length > 10000 ||
    !value.meals.every(validMeal) ||
    !value.activityLogs.every(validActivity)
  )
    throw Error("対応した記録ファイルではありません。");
  const ids = value.meals
    .map((m) => m.id)
    .concat(value.activityLogs.map((a) => a.id));
  if (new Set(ids).size !== ids.length) throw Error("記録IDが重複しています。");
  return {
    version: 1,
    meals: value.meals.map((m) => ({
      id: m.id,
      date: m.date,
      kind: m.kind,
      title: m.title,
      items: m.items.map((i) => ({
        id: i.id,
        name: i.name,
        foodId: i.foodId,
        grams: i.grams,
        ...(i.foodId === "custom" && i.nutritionSource === "ai" ? {
          nutritionSource: "ai",
          nutritionAssumptions: Array.isArray(i.nutritionAssumptions) ? i.nutritionAssumptions.filter(value => typeof value === "string").slice(0, 8).map(value => value.slice(0, 300)) : [],
        } : {}),
        ...(i.foodId === "custom"
          ? {
              custom: Object.fromEntries(
                nutrientKeys.map((k) => [k, i.custom[k]]),
              ),
            }
          : {}),
      })),
    })),
    activityLogs: value.activityLogs.map((a) => ({
      id: a.id,
      date: a.date,
      activityId: a.activityId,
      minutes: a.minutes,
      weight: a.weight,
      mode: a.mode,
    })),
  };
}
