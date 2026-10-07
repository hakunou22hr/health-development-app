import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Leaf,
  Camera,
  Plus,
  ArrowRight,
  Utensils,
  Footprints,
  CalendarDays,
  Settings,
  LayoutDashboard,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  Bike,
  Waves,
  ImagePlus,
  ShieldCheck,
  Info,
  LoaderCircle,
  X,
} from "lucide-react";
import { foods, foodById, activities } from "../shared/foods.mjs";
import {
  totals,
  dateKey,
  exerciseKcal,
  exerciseMinutes,
  validDate,
  validMeal,
  validActivity,
  validNutrients,
  parseBackup,
  nutrientKeys,
} from "../shared/domain.mjs";
import {
  loadStore,
  saveStore,
  downloadJson,
  STORE_KEY,
  emptyStore,
} from "./storage";
import { prepareImage } from "./image";
import { connectionJson } from "./connection";
import type { Item, Meal, Store, Profile, ApiStatus, Nutrients } from "./types";
import "./style.css";
const fmt = (value: number, digits = 0) =>
  value.toLocaleString("ja-JP", { maximumFractionDigits: digits });
const uid = () => crypto.randomUUID();
const today = () => dateKey(new Date());
const dateLabel = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
const blankNutrients = (): Nutrients => ({
  energy: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  fiber: 0,
  salt: 0,
});
const foodList = foods as any[];
const navItems = [
  { id: "home", label: "今日のノート", icon: LayoutDashboard },
  { id: "meal", label: "食事を記録", icon: Camera },
  { id: "activity", label: "運動のヒント", icon: Footprints },
  { id: "history", label: "日別の記録", icon: CalendarDays },
  { id: "settings", label: "設定", icon: Settings },
];
const labels: Record<string, string> = {
  energy: "エネルギー",
  protein: "たんぱく質",
  fat: "脂質",
  carbs: "炭水化物",
  fiber: "食物繊維",
  salt: "食塩相当量",
  sugar: "糖質（推定）",
};
function Plate() {
  return (
    <svg className="plate-art" viewBox="0 0 260 260" aria-hidden="true">
      <circle cx="130" cy="130" r="113" fill="#fffef9" />
      <circle cx="130" cy="130" r="92" fill="#eaece0" />
      <path d="M63 103q45-40 78 10q0 41-48 44q-45-8-30-54" fill="#f0cf97" />
      <path
        d="m68 119 47-15m-35 39 51-16"
        stroke="#d6b37f"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {[
        [165, 75],
        [188, 99],
        [155, 112],
        [173, 140],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="21" fill="#749459" />
          <circle cx={x - 10} cy={y + 4} r="13" fill="#92ae69" />
          <circle cx={x + 9} cy={y - 8} r="12" fill="#608146" />
        </g>
      ))}
      <ellipse cx="122" cy="180" rx="45" ry="25" fill="#f9f4e6" />
      <path
        d="m92 176 14-8m5 15 16-9m4 9 14-8"
        stroke="#dfd8c7"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="175" cy="177" r="16" fill="#db7d65" />
      <circle cx="175" cy="177" r="10" fill="#eda18a" />
      <path
        d="M35 33q12 13 2 26"
        stroke="#bec89c"
        strokeWidth="6"
        fill="none"
      />
      <circle cx="221" cy="205" r="8" fill="#d5dcb6" />
    </svg>
  );
}
function NutrientStats({
  items,
  compact = false,
}: {
  items: Item[];
  compact?: boolean;
}) {
  const n = totals(items);
  return (
    <div className={`nutrient-stats ${compact ? "compact" : ""}`}>
      {["energy", "protein", "fat", "sugar"].map((key, i) => (
        <div className={`nutrient n${i}`} key={key}>
          <span>{labels[key]}</span>
          <strong>
            {fmt(n[key], key === "energy" ? 0 : 1)}
            <small>{key === "energy" ? "kcal" : "g"}</small>
          </strong>
        </div>
      ))}
    </div>
  );
}
function SettingNumber({
  value,
  min,
  max,
  label,
  ariaLabel,
  onValue,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  ariaLabel?: string;
  onValue: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const n = Number(text),
    valid = text !== "" && Number.isFinite(n) && n >= min && n <= max;
  return (
    <label>
      {label}
      <input
        aria-label={ariaLabel}
        type="number"
        min={min}
        max={max}
        value={text}
        aria-invalid={!valid}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (
            e.target.value !== "" &&
            Number.isFinite(n) &&
            n >= min &&
            n <= max
          )
            onValue(n);
        }}
        onBlur={() => {
          if (!valid) setText(String(value));
        }}
      />
      {!valid && (
        <small className="inline-error">
          {min}〜{max}の範囲で入力してください。
        </small>
      )}
    </label>
  );
}
function App() {
  const [initial] = useState(loadStore);
  const [store, setStore] = useState<Store>(initial.store),
    [storageError, setStorageError] = useState(initial.error),
    [tab, setTab] = useState("home"),
    [date, setDate] = useState(today),
    [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<Profile>(() => {
    try {
      const p = JSON.parse(localStorage.getItem("health-profile-v1") || "{}");
      return {
        weight:
          Number.isFinite(p.weight) && p.weight >= 20 && p.weight <= 300
            ? p.weight
            : 60,
        goalMinutes:
          Number.isFinite(p.goalMinutes) &&
          p.goalMinutes >= 5 &&
          p.goalMinutes <= 120
            ? p.goalMinutes
            : 20,
        mode: p.mode === "gross" ? "gross" : "net",
      };
    } catch {
      return { weight: 60, goalMinutes: 20, mode: "net" };
    }
  });
  const [status, setStatus] = useState<ApiStatus>({
      enabled: false,
      authenticated: false,
      protected: false,
      message: "写真認識サーバーに接続中です。手入力・記録は先に使えます。",
    }),
    [passphrase, setPassphrase] = useState(""),
    [connecting, setConnecting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [connectionFeedback, setConnectionFeedback] = useState("");
  const statusRevision = useRef(0);
  const [items, setItems] = useState<Item[]>([]),
    [title, setTitle] = useState(""),
    [kind, setKind] = useState("昼食"),
    [mealDate, setMealDate] = useState(today),
    [confirmed, setConfirmed] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const [photo, setPhoto] = useState<{
      image: string;
      mimeType: string;
      preview: string;
    } | null>(null),
    [photoBusy, setPhotoBusy] = useState(false),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [analysisNotes, setAnalysisNotes] = useState<string[]>([]),
    [pendingImage, setPendingImage] = useState<File | null>(null);
  const [activityId, setActivityId] = useState("brisk"),
    [activityMinutes, setActivityMinutes] = useState(20),
    [activityDate, setActivityDate] = useState(today),
    [target, setTarget] = useState(100),
    [confirmDelete, setConfirmDelete] = useState<{
      id: string;
      type: "meal" | "activity";
    } | null>(null),
    [confirmRestore, setConfirmRestore] = useState<Store | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null),
    requestRef = useRef<AbortController | null>(null),
    photoRevision = useRef(0);
  const n = totals(items),
    dailyMeals = store.meals.filter((m) => m.date === date),
    dailyActivity = store.activityLogs.filter((a) => a.date === date),
    dailyNutrition = totals(dailyMeals.flatMap((m) => m.items)),
    activityTotal = dailyActivity.reduce(
      (sum, a) =>
        sum +
        exerciseKcal(
          activities.find((x) => x.id === a.activityId)!.met,
          a.weight,
          a.minutes,
          a.mode,
        ),
      0,
    );
  const dailyMinutes = dailyActivity.reduce((sum, a) => sum + a.minutes, 0);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() - 6 + i);
    const key = dateKey(d);
    return {
      d,
      key,
      energy: totals(
        store.meals.filter((m) => m.date === key).flatMap((m) => m.items),
      ).energy,
      exercise: store.activityLogs
        .filter((a) => a.date === key)
        .reduce(
          (sum, a) =>
            sum +
            exerciseKcal(
              activities.find((x) => x.id === a.activityId)!.met,
              a.weight,
              a.minutes,
              a.mode,
            ),
          0,
        ),
    };
  });
  const weekMax = Math.max(
    500,
    ...weekDays.flatMap((d) => [d.energy, d.exercise]),
  );
  const getStatus = async () => {
    const revision = ++statusRevision.current;
    setCheckingStatus(true);
    setStatus(previous => ({ ...previous, message: "接続を確認中です。無料サーバーの起動には1分ほどかかる場合があります。手入力・記録は先に使えます。" }));
    try {
      const data = await connectionJson("/api/status");
      if (typeof data.enabled !== "boolean" || typeof data.authenticated !== "boolean" || typeof data.protected !== "boolean") throw new Error("接続状態を取得できませんでした。再確認してください。");
      if (revision === statusRevision.current) setStatus(data);
      return data as ApiStatus;
    } catch (error) {
      if (revision === statusRevision.current) setStatus(previous => ({
        ...previous, enabled: false, authenticated: false,
        message: (error as Error).message,
      }));
      return null;
    } finally {
      if (revision === statusRevision.current) setCheckingStatus(false);
    }
  };
  useEffect(() => {
    getStatus();
    const reconnect = () => { getStatus(); };
    window.addEventListener("online", reconnect);
    return () => {
      window.removeEventListener("online", reconnect);
      requestRef.current?.abort();
      photoRevision.current++;
    };
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirmDelete(null);
        setConfirmRestore(null);
        setPendingImage(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(""), 7000);
      return () => clearTimeout(id);
    }
  }, [notice]);
  const notify = (text: string) => setNotice(text);
  const persist = (next: Store) => {
    if (storageError) {
      notify(storageError);
      return false;
    }
    try {
      saveStore(next);
      setStore(next);
      return true;
    } catch {
      notify(
        "端末に保存できませんでした。空き容量やブラウザーの設定を確認してください。",
      );
      return false;
    }
  };
  const changeProfile = (next: Profile) => {
    try {
      localStorage.setItem("health-profile-v1", JSON.stringify(next));
      setProfile(next);
    } catch {
      notify("設定を保存できませんでした。");
    }
  };
  const changeItems = (next: Item[]) => {
    setItems(next);
    setConfirmed(false);
  };
  const addFood = (food: any) => {
    changeItems([
      ...items,
      { id: uid(), foodId: food.id, name: food.name, grams: food.portion },
    ]);
    setSearch("");
  };
  const sample = () => {
    if (
      items.length &&
      !window.confirm("入力中の食事をサンプルに置き換えますか？")
    )
      return;
    setEditing(null);
    setTitle("サンプル：鶏むね肉とご飯");
    changeItems(
      ["rice", "chicken", "broccoli"].map((id) => ({
        id: uid(),
        foodId: id,
        name: foodById[id].name,
        grams: foodById[id].portion,
      })),
    );
    setAnalysisNotes([
      "これは操作確認用のサンプルです。写真の認識結果ではありません。",
    ]);
    setPhoto(null);
    setConsent(false);
    setTab("meal");
  };
  const resetMeal = () => {
    setItems([]);
    setTitle("");
    setConfirmed(false);
    setEditing(null);
    setPhoto(null);
    setConsent(false);
    setAnalysisNotes([]);
    setMealDate(today());
    photoRevision.current++;
    requestRef.current?.abort();
  };
  const selectImage = async (file: File) => {
    const rev = ++photoRevision.current;
    requestRef.current?.abort();
    setBusy(false);
    setPhotoBusy(true);
    setPhoto(null);
    setConsent(false);
    setAnalysisNotes([]);
    try {
      const converted = await prepareImage(file);
      if (rev === photoRevision.current) {
        setPhoto(converted);
        setAnalysisNotes([]);
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      if (rev === photoRevision.current) setPhotoBusy(false);
    }
  };
  const recognizePhoto = async () => {
    if (!status.enabled || !status.authenticated) {
      setTab("settings");
      notify("写真認識の接続設定を確認してください。");
      return;
    }
    if (!photo || !consent) return;
    if (
      items.length &&
      !window.confirm("現在の食品一覧を写真の候補に置き換えますか？")
    )
      return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setBusy(true);
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const res = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: photo.image,
          mimeType: photo.mimeType,
          consent: true,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "写真を認識できませんでした。");
      if (!Array.isArray(data.items) || !data.items.length)
        throw Error("食品を確認できませんでした。");
      const next: Item[] = data.items.map((i: any) => ({
        id: uid(),
        name: String(i.name).slice(0, 100),
        foodId: foodById[i.foodId] ? i.foodId : "",
        grams: Number(i.grams),
        confidence: i.confidence,
        note: i.note,
      }));
      changeItems(next);
      setTitle(data.title || "写真からの食事");
      setAnalysisNotes(Array.isArray(data.notes) ? data.notes : []);
      notify("候補を認識しました。食品・量・調味料を確認してください。");
    } catch (e) {
      if (requestRef.current === controller)
        notify(
          (e as Error).name === "AbortError"
            ? "写真認識を停止しました。手動入力で続けられます。"
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timer);
      if (requestRef.current === controller) {
        setBusy(false);
        requestRef.current = null;
      }
    }
  };
  const saveMeal = () => {
    if (!confirmed) {
      notify("食品の量と調味料を確認してください。");
      return;
    }
    const meal: Meal = {
      id: editing || uid(),
      date: mealDate,
      kind,
      title: title.trim() || kind,
      items,
    };
    if (!validMeal(meal)) {
      notify(
        "未対応の食品は選び直すか、栄養表示を入力してください。量は1〜3000gです。",
      );
      return;
    }
    const next = {
      ...store,
      meals: editing
        ? store.meals.map((m) => (m.id === editing ? meal : m))
        : [...store.meals, meal],
    };
    if (persist(next)) {
      setDate(mealDate);
      resetMeal();
      setTab("home");
      notify("食事をこの端末に保存しました。");
    }
  };
  const editMeal = (m: Meal) => {
    setEditing(m.id);
    setTitle(m.title);
    setMealDate(m.date);
    setKind(m.kind);
    setItems(m.items);
    setConfirmed(false);
    setPhoto(null);
    setAnalysisNotes([]);
    setTab("meal");
  };
  const addActivity = () => {
    const entry = {
      id: uid(),
      date: activityDate,
      activityId,
      minutes: activityMinutes,
      weight: profile.weight,
      mode: profile.mode,
    };
    if (!validActivity(entry)) {
      notify("体重・日付・時間（1〜240分）を確認してください。");
      return;
    }
    if (persist({ ...store, activityLogs: [...store.activityLogs, entry] })) {
      setDate(activityDate);
      notify("運動をこの端末に保存しました。");
    }
  };
  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    setConnectionFeedback("パスフレーズを確認中です。無料サーバーの起動には1分ほどかかる場合があります。");
    try {
      await connectionJson("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: passphrase }),
      });
      setPassphrase("");
      const current = await getStatus();
      setConnectionFeedback(!current ? "認証後の接続確認に失敗しました。「接続を再確認」を押してください。"
        : !current.authenticated ? "ログインを保持できませんでした。公開URLとRenderのAPP_ORIGIN、ブラウザーのCookie設定を確認してください。"
        : current.enabled ? "接続しました。「食事を記録」から写真認識を使えます。"
        : "パスフレーズは正しく、認証できました。写真認識を使うには、下に表示されたGoogle APIの設定が必要です。");
    } catch (error) {
      setConnectionFeedback((error as Error).message);
    } finally {
      setConnecting(false);
    }
  };
  const shiftDate = (delta: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDate(dateKey(d));
  };
  const activityIcon = (id: string) =>
    id === "cycle" ? <Bike /> : id === "swim" ? <Waves /> : <Footprints />;
  const dateControl = (
    <div className="date-control">
      <button aria-label="前の日" onClick={() => shiftDate(-1)}>
        <ChevronLeft size={18} />
      </button>
      <label>
        <CalendarDays size={16} />
        <input
          aria-label="表示日"
          type="date"
          value={date}
          onChange={(e) => {
            if (validDate(e.target.value)) setDate(e.target.value);
          }}
        />
      </label>
      <button aria-label="次の日" onClick={() => shiftDate(1)}>
        <ChevronRight size={18} />
      </button>
      <button className="text-button" onClick={() => setDate(today())}>
        今日
      </button>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("home");
          }}
        >
          <span className="brand-icon">
            <Leaf />
          </span>
          <span>
            健康開発アプリ<small>食事と活動のノート</small>
          </span>
        </a>
        <nav aria-label="メインメニュー">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "meal" && <Plus size={16} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={22} />
          <strong>あなたの記録は、端末に。</strong>
          <p>食事と体重は、このブラウザーに保存されます。</p>
          <button className="text-button" onClick={() => setTab("settings")}>
            データとプライバシー <ArrowRight size={14} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span className="breadcrumb">
            健康開発アプリ{" "}
            <span>／ {navItems.find((i) => i.id === tab)?.label}</span>
          </span>
          <button className="profile-pill" onClick={() => setTab("settings")}>
            <span className="avatar">
              <Leaf size={18} />
            </span>
            {profile.weight} kg <Settings size={15} />
          </button>
        </header>
        {storageError && (
          <div role="alert" className="error-banner">
            {storageError}
          </div>
        )}
        {tab === "home" && (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">SMALL STEPS, EVERY DAY</span>
                <h1>今日の自分を、少し知る。</h1>
                <p>食べたものと動いた時間を、やさしく振り返りましょう。</p>
              </div>
              {dateControl}
            </div>
            <section className="hero">
              <div className="hero-copy">
                <span className="tag">
                  <Camera size={14} /> PHOTO FOOD NOTE
                </span>
                <h2>
                  ひと皿から、
                  <br />
                  健康のヒントを。
                </h2>
                <p>
                  写真で食事を記録。量を確認して、
                  <br className="desktop-break" />
                  栄養とカロリーの目安を見つけましょう。
                </p>
                <div className="button-row">
                  <button
                    className="primary"
                    onClick={() => {
                      setMealDate(date);
                      setTab("meal");
                    }}
                  >
                    <Camera size={18} />
                    食事を記録する
                    <ArrowRight size={17} />
                  </button>
                  <button className="hero-secondary" onClick={sample}>
                    サンプルを試す
                  </button>
                </div>
                <small>数値は推定値です。無理のない生活習慣のために。</small>
              </div>
              <Plate />
              <div className="hero-sticker">
                <Check size={16} /> 確認してから記録
              </div>
            </section>
            <div className="section-heading">
              <h2>{dateLabel(date)} の記録</h2>
              <span className="subtle">この端末に保存</span>
            </div>
            <div className="dashboard-stats">
              <div className="stat">
                <span>
                  <Utensils size={17} />
                  食事のエネルギー
                </span>
                <strong>
                  {fmt(dailyNutrition.energy)}
                  <small>kcal</small>
                </strong>
                <small>{dailyMeals.length} 食の記録から</small>
              </div>
              <div className="stat">
                <span>
                  <Footprints size={17} />
                  活動の消費エネルギー
                </span>
                <strong>
                  {fmt(activityTotal)}
                  <small>kcal</small>
                </strong>
                <small>各記録の計算方法で集計</small>
              </div>
              <div className="stat">
                <span>
                  <CalendarDays size={17} />
                  動いた時間
                </span>
                <strong>
                  {dailyMinutes}
                  <small>分</small>
                </strong>
                <small>目標 {profile.goalMinutes} 分 / 日</small>
              </div>
            </div>
            <div className="home-grid">
              <section className="card">
                <div className="section-heading">
                  <h2>食事のノート</h2>
                  <button
                    className="text-button"
                    onClick={() => {
                      setMealDate(date);
                      setTab("meal");
                    }}
                  >
                    <Plus size={16} />
                    追加する
                  </button>
                </div>
                {dailyMeals.length ? (
                  dailyMeals.map((m) => (
                    <div className="meal-summary" key={m.id}>
                      <span className="meal-symbol">
                        <Utensils size={22} />
                      </span>
                      <div>
                        <small>{m.kind}</small>
                        <strong>{m.title}</strong>
                        <p>{m.items.map((i) => i.name).join("・")}</p>
                      </div>
                      <button onClick={() => editMeal(m)}>
                        {fmt(totals(m.items).energy)} <small>kcal</small>
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    <Utensils size={32} />
                    <h3>最初の食事を記録しよう</h3>
                    <p>写真からでも、手動入力でも始められます。</p>
                    <button onClick={() => setTab("meal")}>
                      食事を追加 <Plus size={16} />
                    </button>
                  </div>
                )}
              </section>
              <section className="card daily-hint">
                <span className="tag">
                  <Footprints size={14} /> TODAY’S SMALL STEP
                </span>
                <h2>
                  {dailyMinutes >= profile.goalMinutes
                    ? "今日の小さな一歩、できました。"
                    : `まずは、${Math.max(5, Math.min(20, profile.goalMinutes - dailyMinutes))}分の散歩から。`}
                </h2>
                <p>
                  {dailyMinutes >= profile.goalMinutes
                    ? "今日の目標時間を記録できました。休息も大切に。"
                    : "短い時間でも、自分のペースで。食べた分を一度に消費する必要はありません。"}
                </p>
                <div className="goal-track">
                  <span
                    style={{
                      width: `${Math.min(100, (dailyMinutes / profile.goalMinutes) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {dailyMinutes} / {profile.goalMinutes} 分
                </small>
                <button
                  className="text-button"
                  onClick={() => setTab("activity")}
                >
                  運動の目安を見る <ArrowRight size={16} />
                </button>
              </section>
            </div>
            <section className="card">
              <div className="section-heading">
                <h2>最近7日間のリズム</h2>
                <span className="chart-legend">
                  <i />
                  食事 kcal <i />
                  活動 kcal
                </span>
              </div>
              <div className="week-chart">
                {weekDays.map(({ d, key, energy, exercise }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setDate(key);
                      setTab("history");
                    }}
                    aria-label={`${dateLabel(key)} 食事${fmt(energy)}kcal 活動${fmt(exercise)}kcal`}
                  >
                    <div className="bar-pair">
                      <span
                        style={{
                          height: `${Math.max(2, (energy / weekMax) * 100)}%`,
                        }}
                      />
                      <span
                        style={{
                          height: `${Math.max(2, (exercise / weekMax) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      {d.getMonth() + 1}/{d.getDate()}
                    </small>
                    <strong>{fmt(energy)}</strong>
                  </button>
                ))}
              </div>
              <p className="footnote">
                記録した食事と活動の目安です。基礎代謝や未記録の活動を含む収支ではありません。
              </p>
            </section>
          </>
        )}
        {tab === "meal" && (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">FOOD NOTE</span>
                <h1>{editing ? "食事の記録を編集" : "食事を記録する"}</h1>
                <p>写真の候補を確認し、量と調味料を整えてから保存。</p>
              </div>
              <button
                onClick={() => {
                  if (
                    !items.length ||
                    window.confirm("入力中の食事をクリアしますか？")
                  )
                    resetMeal();
                }}
              >
                入力をクリア
              </button>
            </div>
            <div className="meal-workspace">
              <section className="card photo-card">
                <span className="step-label">01 / 写真を選ぶ</span>
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="食事写真"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (items.length) setPendingImage(file);
                      else selectImage(file);
                    }
                    e.target.value = "";
                  }}
                  hidden
                />
                <div
                  className="photo-drop"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      if (items.length) setPendingImage(file);
                      else selectImage(file);
                    }
                  }}
                >
                  {photo ? (
                    <>
                      <img src={photo.preview} alt="選択した食事写真" />
                      <button
                        className="photo-remove"
                        aria-label="写真を取り除く"
                        onClick={() => {
                          requestRef.current?.abort();
                          photoRevision.current++;
                          setPhoto(null);
                          setBusy(false);
                          setConsent(false);
                        }}
                      >
                        <X size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <ImagePlus size={38} />
                      <h3>
                        {photoBusy
                          ? "写真を準備しています…"
                          : "今日のひと皿を、撮ろう。"}
                      </h3>
                      <p>JPEG・PNG・WebP / 20MBまで</p>
                      <button
                        className="primary"
                        disabled={photoBusy}
                        onClick={() => uploadRef.current?.click()}
                      >
                        <Camera size={17} />
                        写真を選ぶ・撮る
                      </button>
                    </>
                  )}
                </div>
                {photo && (
                  <button
                    className="text-button"
                    disabled={busy || photoBusy}
                    onClick={() => uploadRef.current?.click()}
                  >
                    別の写真を選ぶ
                  </button>
                )}
                <div
                  className={`connection-status ${status.enabled && status.authenticated ? "online" : ""}`}
                >
                  <i />
                  {status.enabled && status.authenticated
                    ? "Google Gemini 接続設定済み"
                    : "写真認識は未接続"}
                  <button
                    className="text-button"
                    onClick={() => setTab("settings")}
                  >
                    設定
                  </button>
                </div>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  写真をGoogleへ送信して認識することに同意します。
                </label>
                <p className="footnote">
                  位置情報を除き、縮小した写真だけを送ります。アプリ側のサーバーに写真を保存しません。Googleの無料枠では入力が製品改善に使われる場合があります。顔や個人情報が写らない写真を選んでください。
                </p>
                <button
                  className="primary full"
                  disabled={busy || photoBusy || !photo || !consent}
                  onClick={recognizePhoto}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <Camera size={18} />
                  )}{" "}
                  {busy
                    ? "写真を認識しています…"
                    : status.enabled && status.authenticated
                      ? "写真から食品を認識"
                      : "写真認識の接続を確認"}
                </button>
                {busy && (
                  <button
                    className="text-button"
                    onClick={() => requestRef.current?.abort()}
                  >
                    認識を停止する
                  </button>
                )}
                <p className="footnote">手動入力は接続なしでも使えます。</p>
              </section>
              <section className="card food-editor">
                <span className="step-label">02 / 食品と量を確認する</span>
                <div className="form-grid">
                  <label>
                    記録日
                    <input
                      type="date"
                      value={mealDate}
                      onChange={(e) => setMealDate(e.target.value)}
                    />
                  </label>
                  <label>
                    食事
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      {["朝食", "昼食", "夕食", "間食"].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  食事の名前
                  <input
                    value={title}
                    maxLength={100}
                    placeholder="例：鶏むね肉とご飯"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                {analysisNotes.length > 0 && (
                  <div className="analysis-notes">
                    <Info size={17} />
                    <div>
                      {analysisNotes.map((note, i) => (
                        <p key={i}>{note}</p>
                      ))}
                    </div>
                  </div>
                )}
                <div className="item-list">
                  {items.map((item, index) => (
                    <div
                      className={`food-item ${!item.foodId ? "unresolved" : ""}`}
                      key={item.id}
                    >
                      <div className="item-top">
                        <strong>{item.name}</strong>
                        <button
                          className="icon-button danger"
                          aria-label={`${item.name}を削除`}
                          onClick={() =>
                            changeItems(items.filter((i) => i.id !== item.id))
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {item.confidence && (
                        <small className="confidence">
                          AI候補 ·{" "}
                          {item.confidence === "high"
                            ? "識別の確信度：高"
                            : item.confidence === "medium"
                              ? "識別の確信度：中"
                              : "要確認：確信度が低い"}
                          （量の正確さを保証しません）
                        </small>
                      )}
                      {item.note && <p className="footnote">{item.note}</p>}
                      <div className="item-controls">
                        <label>
                          食品・調理状態
                          <select
                            aria-label={`食品 ${index + 1}`}
                            value={item.foodId}
                            onChange={(e) => {
                              const id = e.target.value;
                              changeItems(
                                items.map((i) =>
                                  i.id === item.id
                                    ? {
                                        ...i,
                                        foodId: id,
                                        name:
                                          id === "custom"
                                            ? item.name
                                            : foodById[id]?.name || item.name,
                                        ...(id === "custom"
                                          ? { custom: blankNutrients() }
                                          : { custom: undefined }),
                                      }
                                    : i,
                                ),
                              );
                            }}
                          >
                            <option value="">食品を選んでください</option>
                            {foodList.map((f) => (
                              <option value={f.id} key={f.id}>
                                {f.name}
                              </option>
                            ))}
                            <option value="custom">栄養表示から入力する</option>
                          </select>
                        </label>
                        <label className="grams">
                          可食部の量
                          <input
                            aria-label={`量 ${index + 1}`}
                            type="number"
                            min="1"
                            max="3000"
                            step="1"
                            value={item.grams || ""}
                            onChange={(e) =>
                              changeItems(
                                items.map((i) =>
                                  i.id === item.id
                                    ? { ...i, grams: Number(e.target.value) }
                                    : i,
                                ),
                              )
                            }
                          />
                          <small>g</small>
                        </label>
                      </div>
                      {!item.foodId && (
                        <p className="inline-error">
                          未対応の食品です。近い食品へ無理に合わせず、パッケージの栄養表示を入力してください。
                        </p>
                      )}
                      {item.foodId === "custom" && (
                        <div className="custom-nutrition">
                          <label>
                            食品名
                            <input
                              aria-label={`食品名 ${index + 1}`}
                              value={item.name}
                              maxLength={100}
                              onChange={(e) =>
                                changeItems(
                                  items.map((i) =>
                                    i.id === item.id
                                      ? { ...i, name: e.target.value }
                                      : i,
                                  ),
                                )
                              }
                            />
                          </label>
                          <p className="footnote">
                            可食部100gあたりの栄養表示を入力。1食あたり表示の場合は100gへ換算してください。
                          </p>
                          <div className="custom-grid">
                            {nutrientKeys.map((k) => (
                              <label key={k}>
                                {labels[k]}（{k === "energy" ? "kcal" : "g"}）
                                <input
                                  aria-label={`${labels[k]} ${index + 1}`}
                                  type="number"
                                  min="0"
                                  max={k === "energy" ? 1000 : 100}
                                  step=".1"
                                  value={
                                    item.custom?.[k as keyof Nutrients] ?? 0
                                  }
                                  onChange={(e) =>
                                    changeItems(
                                      items.map((i) =>
                                        i.id === item.id
                                          ? {
                                              ...i,
                                              custom: {
                                                ...blankNutrients(),
                                                ...i.custom,
                                                [k]: Number(e.target.value),
                                              },
                                            }
                                          : i,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          {!validNutrients(item.custom) && (
                            <p className="inline-error">
                              食物繊維は炭水化物以下、三大栄養素の合計は約100g以下になるよう確認してください。
                            </p>
                          )}
                        </div>
                      )}
                      {item.foodId && item.foodId !== "custom" && (
                        <a
                          className="source-link"
                          href={foodById[item.foodId]?.source}
                          target="_blank"
                          rel="noreferrer"
                        >
                          食品成分の出典 ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                {!items.length && (
                  <div className="empty small">
                    <Utensils size={26} />
                    <p>写真の認識、または食品追加から始めましょう。</p>
                  </div>
                )}
                <div className="food-search">
                  <label>
                    食品を手動で追加
                    <input
                      aria-label="食品を検索"
                      value={search}
                      placeholder="ご飯、卵、油などを検索"
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="food-chips">
                    {foodList
                      .filter(
                        (f) =>
                          !search ||
                          (f.name + " " + f.aliases).includes(search),
                      )
                      .slice(0, search ? 11 : 5)
                      .map((f) => (
                        <button key={f.id} onClick={() => addFood(f)}>
                          <Plus size={14} />
                          {f.name}
                        </button>
                      ))}
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      changeItems([
                        ...items,
                        {
                          id: uid(),
                          name: "栄養表示からの食品",
                          foodId: "custom",
                          grams: 100,
                          custom: blankNutrients(),
                        },
                      ])
                    }
                  >
                    <Plus size={16} />
                    栄養表示から追加
                  </button>
                  <details>
                    <summary>油・砂糖を追加する</summary>
                    <p className="footnote">
                      調理に使った量ではなく、実際に食べた量を加えてください。調理油を含む食品へ重ねて加えないよう注意。
                    </p>
                    <div className="food-chips">
                      {["oil", "sugar"].map((id) => (
                        <button key={id} onClick={() => addFood(foodById[id])}>
                          <Plus size={14} />
                          {foodById[id].name}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              </section>
            </div>
            <section className="card meal-result">
              <div className="section-heading">
                <h2>03 / 栄養の目安</h2>
                <span className="tag">確認した量から計算</span>
              </div>
              {n.unresolved > 0 && (
                <p className="inline-error">
                  {n.unresolved}{" "}
                  件の食品は未計算です。選択・量・栄養表示を確認してください。
                </p>
              )}
              <NutrientStats items={items} />
              <p className="footnote">
                炭水化物 {fmt(n.carbs, 1)}g / 食物繊維 {fmt(n.fiber, 1)}g /
                食塩相当量 {fmt(n.salt, 1)}
                g。糖質は炭水化物−食物繊維の概算で、糖類とは異なります。エネルギーは食品成分表・入力値を使用します。
              </p>
              <div className="save-row">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  食品・可食部の量・調理状態・調味料を確認しました。
                </label>
                <button
                  className="primary"
                  disabled={
                    !confirmed ||
                    !items.length ||
                    n.unresolved > 0 ||
                    busy ||
                    !!storageError
                  }
                  onClick={saveMeal}
                >
                  <Check size={18} />
                  {editing ? "変更を保存" : "食事を保存"}
                </button>
              </div>
              {items.length > 0 && n.unresolved === 0 && (
                <button
                  className="text-button"
                  onClick={() => {
                    setTarget(Math.round(n.energy));
                    setTab("activity");
                  }}
                >
                  この食事のエネルギーを運動の目安と比較{" "}
                  <ArrowRight size={16} />
                </button>
              )}
            </section>
          </>
        )}
        {tab === "activity" && (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">MOVE AT YOUR OWN PACE</span>
                <h1>自分のペースで、動こう。</h1>
                <p>消費エネルギーと時間の目安を比べて、小さな一歩を。</p>
              </div>
            </div>
            <section className="activity-intro">
              <Info size={20} />
              <p>
                食事を運動で帳消しにする必要はありません。表示時間は比較のための計算値です。長い時間は数日に分け、体調に合わせて休みましょう。
              </p>
            </section>
            <section className="card activity-settings">
              <SettingNumber
                value={profile.weight}
                min={20}
                max={300}
                label="体重（kg）"
                ariaLabel="体重"
                onValue={(weight) => changeProfile({ ...profile, weight })}
              />
              <label>
                比較するエネルギー（kcal）
                <input
                  aria-label="比較エネルギー"
                  type="number"
                  min="0"
                  max="10000"
                  value={target || ""}
                  onChange={(e) => setTarget(Number(e.target.value))}
                />
              </label>
              <label>
                計算方法
                <select
                  aria-label="消費エネルギーの計算方法"
                  value={profile.mode}
                  onChange={(e) =>
                    changeProfile({
                      ...profile,
                      mode: e.target.value as "net" | "gross",
                    })
                  }
                >
                  <option value="net">運動による追加分（安静時を除く）</option>
                  <option value="gross">活動中の総消費（安静時を含む）</option>
                </select>
              </label>
            </section>
            <div className="exercise-grid">
              {activities.map((a) => {
                let minutes: number | null = null,
                  kcal: number | null = null;
                try {
                  minutes = exerciseMinutes(
                    target,
                    a.met,
                    profile.weight,
                    profile.mode,
                  );
                  kcal = exerciseKcal(a.met, profile.weight, 20, profile.mode);
                } catch {}
                return (
                  <section
                    className={`card exercise-card ${activityId === a.id ? "chosen" : ""}`}
                    key={a.id}
                  >
                    <span className="exercise-icon">{activityIcon(a.id)}</span>
                    <h2>{a.name}</h2>
                    <p>{a.detail}</p>
                    <span className="met-tag">{a.met} METs</span>
                    <div className="exercise-time">
                      <strong>{minutes === null ? "—" : fmt(minutes)}</strong>
                      <span>分 / {fmt(target)} kcal の目安</span>
                    </div>
                    <p className="footnote">
                      20分なら約 {kcal === null ? "—" : fmt(kcal)} kcal
                    </p>
                    {minutes !== null && minutes > 60 && (
                      <p className="split-note">
                        一度に行う時間の推奨ではありません。
                      </p>
                    )}
                    <button
                      onClick={() => {
                        setActivityId(a.id);
                        setActivityMinutes(20);
                      }}
                    >
                      {activityId === a.id ? (
                        <Check size={16} />
                      ) : (
                        <Plus size={16} />
                      )}
                      この運動を記録
                    </button>
                    <a
                      className="source-link"
                      href={a.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      METsの出典 ↗
                    </a>
                  </section>
                );
              })}
            </div>
            <section className="card">
              <div className="section-heading">
                <h2>実際に動いた時間を記録</h2>
                <span className="subtle">体重 {profile.weight}kg で保存</span>
              </div>
              <div className="activity-log-form">
                <label>
                  運動
                  <select
                    aria-label="記録する運動"
                    value={activityId}
                    onChange={(e) => setActivityId(e.target.value)}
                  >
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  日付
                  <input
                    aria-label="運動の記録日"
                    type="date"
                    value={activityDate}
                    onChange={(e) => setActivityDate(e.target.value)}
                  />
                </label>
                <label>
                  時間（分）
                  <input
                    aria-label="運動時間"
                    type="number"
                    min="1"
                    max="240"
                    value={activityMinutes || ""}
                    onChange={(e) => setActivityMinutes(Number(e.target.value))}
                  />
                </label>
                <button
                  className="primary"
                  onClick={addActivity}
                  disabled={!!storageError}
                >
                  <Check size={17} />
                  運動を保存
                </button>
              </div>
            </section>
            <details className="card">
              <summary>計算の仕組み・対象</summary>
              <p>
                総消費：METs × 体重kg × 時間h × 1.05。追加分：（METs−1）× 体重kg
                × 時間h × 1.05。
              </p>
              <p>
                METsは成人の集団平均に基づく概算です。年齢・体力・環境で変わり、個人の実測値ではありません。子どもや高齢者にはそのまま当てはまらない場合があります。運動制限がある方は医療者へ相談してください。
              </p>
            </details>
          </>
        )}
        {tab === "history" && (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR DAILY RHYTHM</span>
                <h1>日別の記録</h1>
                <p>続けた小さなことを、見返してみよう。</p>
              </div>
              {dateControl}
            </div>
            <NutrientStats items={dailyMeals.flatMap((m) => m.items)} />
            <section className="card">
              <div className="section-heading">
                <h2>{dateLabel(date)} の食事</h2>
                <button
                  className="text-button"
                  onClick={() => {
                    setMealDate(date);
                    setTab("meal");
                  }}
                >
                  <Plus size={16} />
                  追加
                </button>
              </div>
              {dailyMeals.length ? (
                dailyMeals.map((m) => (
                  <div className="history-row" key={m.id}>
                    <Utensils className="history-icon" />
                    <div>
                      <small>{m.kind}</small>
                      <strong>{m.title}</strong>
                      <p>
                        {m.items
                          .map((i) => `${i.name} ${i.grams}g`)
                          .join(" / ")}
                      </p>
                    </div>
                    <strong>
                      {fmt(totals(m.items).energy)}
                      <small> kcal</small>
                    </strong>
                    <button onClick={() => editMeal(m)}>編集</button>
                    <button
                      className="icon-button danger"
                      aria-label={`${m.title}の記録を削除`}
                      onClick={() =>
                        setConfirmDelete({ id: m.id, type: "meal" })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty small">
                  <p>この日の食事はまだありません。</p>
                </div>
              )}
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>活動の記録</h2>
                <span>
                  {dailyMinutes}分 · 約{fmt(activityTotal)}kcal
                </span>
              </div>
              {dailyActivity.length ? (
                dailyActivity.map((a) => {
                  const activity = activities.find(
                    (x) => x.id === a.activityId,
                  )!;
                  return (
                    <div className="history-row" key={a.id}>
                      {activityIcon(a.activityId)}
                      <div>
                        <strong>{activity.name}</strong>
                        <p>
                          {a.minutes}分 / {a.weight}kg /{" "}
                          {a.mode === "net" ? "追加分" : "総消費"}
                        </p>
                      </div>
                      <strong>
                        {fmt(
                          exerciseKcal(
                            activity.met,
                            a.weight,
                            a.minutes,
                            a.mode,
                          ),
                        )}
                        <small> kcal</small>
                      </strong>
                      <button
                        className="icon-button danger"
                        aria-label={`${activity.name}の記録を削除`}
                        onClick={() =>
                          setConfirmDelete({ id: a.id, type: "activity" })
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="empty small">
                  <p>この日の運動はまだありません。</p>
                </div>
              )}
            </section>
          </>
        )}
        {tab === "settings" && (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">MAKE IT YOURS</span>
                <h1>設定とデータ</h1>
                <p>体重、写真認識の接続、記録のバックアップ。</p>
              </div>
            </div>
            <div className="settings-grid">
              <section className="card">
                <h2>活動の目安</h2>
                <SettingNumber
                  value={profile.weight}
                  min={20}
                  max={300}
                  label="体重（kg）"
                  onValue={(weight) => changeProfile({ ...profile, weight })}
                />
                <SettingNumber
                  value={profile.goalMinutes}
                  min={5}
                  max={120}
                  label="1日の活動時間の目標（分）"
                  onValue={(goalMinutes) =>
                    changeProfile({ ...profile, goalMinutes })
                  }
                />
                <p className="footnote">
                  初期値の60kg・20分は設定用の値です。ご自身の体重と無理のない目標へ変更してください。体重は写真認識に送信しません。
                </p>
              </section>
              <section className="card">
                <h2>Google Gemini 写真認識</h2>
                <p>画面の保存が完了すると、次回から手入力・日別記録をサーバーの起動を待たずに使えます。写真認識には接続が必要です。</p>
                <div
                  className={`connection-status ${status.enabled && status.authenticated ? "online" : ""}`}
                >
                  <i />
                  {status.message}
                </div>
                <p>
                  Google AI
                  StudioのAPIキーは、サーバーの秘密設定で管理します。この画面や記録には保存しません。
                </p>
                {status.protected && !status.authenticated && (
                  <>
                    <label>
                      接続用パスフレーズ（RenderのAPP_ACCESS_TOKEN）
                      <input
                        type="password"
                        value={passphrase}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="APIキーではありません"
                      />
                    </label>
                    <button
                      className="primary"
                      onClick={connect}
                      disabled={connecting || !passphrase}
                    >
                      {connecting ? "接続中…" : "写真認識へ接続"}
                    </button>
                  </>
                )}
                {connectionFeedback && <p role="status" className="connection-feedback">{connectionFeedback}</p>}
                <button onClick={getStatus} disabled={checkingStatus || connecting}>
                  {checkingStatus ? "接続を確認中…" : "接続を再確認"}
                </button>
                <p className="footnote">
                  無料枠での利用には、課金を有効にしていないGoogleプロジェクトが必要です。上限に達したら手動入力へ切り替えます。有料モデルへの自動切替は行いません。
                </p>
                <a
                  className="source-link"
                  href="https://ai.google.dev/gemini-api/docs/pricing"
                  target="_blank"
                  rel="noreferrer"
                >
                  Googleの現行料金・無料枠を確認 ↗
                </a>
              </section>
              <section className="card">
                <h2>記録のバックアップ</h2>
                <p>
                  ブラウザーのデータ削除や端末変更に備えて、記録をファイルに保存できます。写真はバックアップに含まれません。
                </p>
                <div className="button-row">
                  <button
                    onClick={() =>
                      downloadJson(store, `health-note-${today()}.json`)
                    }
                  >
                    <Download size={17} />
                    記録をダウンロード
                  </button>
                  <label className="file-button">
                    <Upload size={17} />
                    バックアップを読み込む
                    <input
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (file.size > 5_000_000) {
                          notify("5MB以下のバックアップを選んでください。");
                          return;
                        }
                        try {
                          setConfirmRestore(
                            parseBackup(JSON.parse(await file.text())) as Store,
                          );
                        } catch (err) {
                          notify((err as Error).message);
                        }
                      }}
                    />
                  </label>
                </div>
                {storageError && (
                  <button
                    onClick={() =>
                      downloadJson(
                        { raw: localStorage.getItem(STORE_KEY) },
                        "health-note-recovery.json",
                      )
                    }
                  >
                    読み取れない元データを退避
                  </button>
                )}
                <p className="footnote">
                  食事 {store.meals.length}件 / 運動 {store.activityLogs.length}
                  件。取り込み前に、置き換え内容を確認します。
                </p>
              </section>
              <section className="card">
                <h2>データと計算の出典</h2>
                <p>
                  食品は文部科学省「日本食品標準成分表（八訂）増補2023年」の小規模なカタログ。未対応の料理は食品を選び直すか、栄養表示を入力します。
                </p>
                <p>
                  運動の強度は2024 Adult
                  Compendium。カロリーは推定値で、病気の診断・治療やアレルギーの判定には使用しません。
                </p>
                <div className="button-row">
                  <a
                    className="source-link"
                    href="https://fooddb.mext.go.jp/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    食品成分データベース ↗
                  </a>
                  <a
                    className="source-link"
                    href="https://pacompendium.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    運動のMETs ↗
                  </a>
                </div>
              </section>
            </div>
          </>
        )}
        <footer className="app-footer">
          <Leaf size={15} />
          <span>食べることも、休むことも、健康の一部。</span>
          <small>推定値として、自分のペースで。</small>
        </footer>
      </main>
      {notice && (
        <div role="status" className="toast">
          <Info size={18} />
          <span>{notice}</span>
          <button aria-label="通知を閉じる" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {(confirmDelete || confirmRestore || pendingImage) && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="変更の確認"
            className="modal"
          >
            <h2>
              {confirmDelete
                ? "この記録を削除しますか？"
                : confirmRestore
                  ? "記録をバックアップに置き換えますか？"
                  : "新しい写真を選びますか？"}
            </h2>
            <p>
              {confirmDelete
                ? "選択した1件の記録をこの端末から削除します。"
                : confirmRestore
                  ? `食事${confirmRestore.meals.length}件・運動${confirmRestore.activityLogs.length}件に置き換えます。現在の記録は先にダウンロードできます。`
                  : "現在の食品一覧は残します。認識するときに、候補への置き換えを確認します。"}
            </p>
            {confirmRestore && (
              <button
                onClick={() =>
                  downloadJson(
                    store,
                    `health-note-before-import-${today()}.json`,
                  )
                }
              >
                <Download size={16} />
                現在の記録を保存
              </button>
            )}
            <div className="button-row">
              <button
                autoFocus
                onClick={() => {
                  setConfirmDelete(null);
                  setConfirmRestore(null);
                  setPendingImage(null);
                }}
              >
                キャンセル
              </button>
              <button
                className="primary"
                onClick={() => {
                  if (confirmDelete) {
                    const next =
                      confirmDelete.type === "meal"
                        ? {
                            ...store,
                            meals: store.meals.filter(
                              (m) => m.id !== confirmDelete.id,
                            ),
                          }
                        : {
                            ...store,
                            activityLogs: store.activityLogs.filter(
                              (a) => a.id !== confirmDelete.id,
                            ),
                          };
                    if (persist(next)) notify("記録を削除しました。");
                    setConfirmDelete(null);
                  } else if (confirmRestore) {
                    try {
                      saveStore(confirmRestore);
                      setStore(confirmRestore);
                      setStorageError("");
                      notify("バックアップを読み込みました。");
                      setConfirmRestore(null);
                    } catch {
                      notify("端末に保存できませんでした。");
                    }
                  } else if (pendingImage) {
                    selectImage(pendingImage);
                    setPendingImage(null);
                  }
                }}
              >
                {confirmDelete
                  ? "削除する"
                  : confirmRestore
                    ? "置き換える"
                    : "写真を選ぶ"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then(registration => { void registration.update().catch(() => {}); })
      .catch(() => { /* Storage restrictions do not block the normal app. */ });
  });
}
