export type Nutrients = {
  energy: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  salt: number;
};
export type Food = Nutrients & {
  id: string;
  name: string;
  source: string;
  portion: number;
  aliases: string;
  code: string;
};
export type Item = {
  id: string;
  name: string;
  foodId: string;
  grams: number;
  custom?: Nutrients;
  nutritionSource?: "ai";
  nutritionAssumptions?: string[];
  confidence?: string;
  note?: string;
};
export type Meal = {
  id: string;
  date: string;
  kind: string;
  title: string;
  items: Item[];
};
export type ActivityLog = {
  id: string;
  date: string;
  activityId: string;
  minutes: number;
  weight: number;
  mode: "net" | "gross";
};
export type Store = { version: 1; meals: Meal[]; activityLogs: ActivityLog[] };
export type Profile = {
  weight: number;
  goalMinutes: number;
  mode: "net" | "gross";
};
export type ApiStatus = {
  enabled: boolean;
  authenticated: boolean;
  protected: boolean;
  message: string;
  model?: string;
};
