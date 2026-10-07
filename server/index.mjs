import { makeServer } from "./app.mjs";
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 8787);
const config = {
  host,
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  freeConfirmed: process.env.GEMINI_FREE_PROJECT_CONFIRMED === "true",
  accessToken: process.env.APP_ACCESS_TOKEN,
  origin: process.env.APP_ORIGIN,
  dailyLimit: Number(process.env.DAILY_ANALYSIS_LIMIT || 20),
  minuteLimit: Number(process.env.MINUTE_ANALYSIS_LIMIT || 3),
};
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !Number.isInteger(config.dailyLimit) ||
  config.dailyLimit < 1 ||
  !Number.isInteger(config.minuteLimit) ||
  config.minuteLimit < 1
)
  throw Error("ポートまたは利用回数の設定を確認してください。");
const server = makeServer(config);
server.listen(port, host, () =>
  console.log(
    `健康開発アプリ: http://${host}:${port} · 写真認識 ${config.apiKey && config.freeConfirmed ? "接続設定済み" : "未接続（手動入力可）"}`,
  ),
);
