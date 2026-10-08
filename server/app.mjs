import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, recognize, validateImage } from "./gemini.mjs";
import { issueSession, validSession, SESSION_SECONDS } from "./session.mjs";
export function makeServer(config = {}, deps = {}) {
  const host = config.host || "127.0.0.1",
    publicHost = !["127.0.0.1", "localhost", "::1"].includes(host);
  if (
    publicHost &&
    (!config.accessToken || !config.origin?.startsWith("https://"))
  )
    throw Error(
      "公開時は APP_ACCESS_TOKEN と HTTPS の APP_ORIGIN を設定してください。",
    );
  const enabled = !!config.apiKey && config.freeConfirmed === true,
    limits = { day: "", daily: 0, minute: 0, minuteCount: 0 },
    loginLimit = { minute: 0, count: 0 };
  const allowed = new Set([
    config.origin || "http://localhost:8787",
    ...(!publicHost
      ? [
          "http://127.0.0.1:8787",
          "http://localhost:8787",
          "http://127.0.0.1:5173",
          "http://localhost:5173",
        ]
      : []),
  ]);
  const now = deps.now || Date.now;
  const authenticated = (req) => {
    if (!config.accessToken) return !publicHost;
    const match = String(req.headers.cookie || "").match(/(?:^|;\s*)health_session=([^;]+)(?:;|$)/);
    return !!match && validSession(match[1], config.accessToken, now());
  };
  const send = (res, status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  async function body(req, max = 2900000) {
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max)
        throw new ApiError(
          413,
          "SIZE",
          "画像が大きすぎます。小さな写真で試してください。",
        );
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new ApiError(400, "JSON", "送信内容を確認してください。");
    }
  }
  function quota() {
    const minute = Math.floor(now() / 60000),
      day = new Date(now()).toISOString().slice(0, 10);
    if (limits.day !== day) {
      limits.day = day;
      limits.daily = 0;
    }
    if (limits.minute !== minute) {
      limits.minute = minute;
      limits.minuteCount = 0;
    }
    if (
      limits.daily >= (config.dailyLimit || 20) ||
      limits.minuteCount >= (config.minuteLimit || 3)
    )
      throw new ApiError(
        429,
        "LOCAL_QUOTA",
        "アプリの写真認識上限に達しました。手動入力で続けられます。",
      );
    limits.daily++;
    limits.minuteCount++;
  }
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(self), microphone=(), geolocation=()",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin))
        throw new ApiError(
          403,
          "ORIGIN",
          "許可された画面から操作してください。",
        );
      if (url.pathname === "/api/status" && req.method === "GET")
        return send(res, 200, {
          enabled,
          authenticated: authenticated(req),
          protected: !!config.accessToken,
          model: enabled ? config.model : null,
          message: !config.apiKey
            ? "Google APIキーが未設定です。RenderのEnvironmentにGEMINI_API_KEYを設定してください。手入力・記録は使えます。"
            : config.freeConfirmed !== true
              ? "無料枠の確認が未設定です。Googleプロジェクトの課金が無効であることを確認後、RenderのGEMINI_FREE_PROJECT_CONFIRMEDをtrueに設定してください。"
              : authenticated(req)
                ? "写真認識に接続済みです。食事の記録から利用できます。"
                : "サーバーに接続できました。RenderのAPP_ACCESS_TOKENを接続用パスフレーズに入力してください。",
        });
      if (url.pathname === "/api/session" && req.method === "POST") {
        const m = Math.floor(now() / 60000);
        if (loginLimit.minute !== m) {
          loginLimit.minute = m;
          loginLimit.count = 0;
        }
        if (++loginLimit.count > 10)
          throw new ApiError(
            429,
            "LOGIN_LIMIT",
            "少し待ってから接続してください。",
          );
        const value = await body(req, 4096);
        if (!config.accessToken) return send(res, 200, { ok: true });
        const a = Buffer.from(String(value.token || "")),
          b = Buffer.from(config.accessToken);
        if (a.length !== b.length || !timingSafeEqual(a, b))
          throw new ApiError(
            401,
            "AUTH",
            "接続用パスフレーズを確認してください。",
          );
        const id = issueSession(config.accessToken, now());
        res.setHeader(
          "Set-Cookie",
          `health_session=${id}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_SECONDS}${publicHost ? "; Secure" : ""}`,
        );
        return send(res, 200, { ok: true });
      }
      if (url.pathname === "/api/session" && req.method === "DELETE") {
        res.setHeader("Set-Cookie", `health_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${publicHost ? "; Secure" : ""}`);
        return send(res, 200, { ok: true });
      }
      if (url.pathname === "/api/recognize" && req.method === "POST") {
        if (!authenticated(req))
          throw new ApiError(
            401,
            "AUTH",
            "設定から写真認識へ接続してください。",
          );
        if (!enabled)
          throw new ApiError(
            503,
            "NOT_CONFIGURED",
            "写真認識は未接続です。APIキーと無料プロジェクトの設定が必要です。",
          );
        if (!String(req.headers["content-type"]).startsWith("application/json"))
          throw new ApiError(415, "TYPE", "送信形式を確認してください。");
        const image = validateImage(await body(req));
        quota();
        const result = await (deps.recognize || recognize)(image, {
          apiKey: config.apiKey,
          model: config.model || "gemini-3.5-flash-lite",
        });
        return send(res, 200, result);
      }
      if (url.pathname.startsWith("/api/"))
        throw new ApiError(404, "NOT_FOUND", "この操作は利用できません。");
      if (!["GET", "HEAD"].includes(req.method))
        throw new ApiError(405, "METHOD", "この操作は利用できません。");
      const root = path.resolve(config.dist || "dist");
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, ""),
        file = path.resolve(root, relative || "index.html");
      if (!file.startsWith(root + path.sep))
        throw new ApiError(404, "NOT_FOUND", "ページがありません。");
      const ext = path.extname(file),
        mime = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".webmanifest": "application/manifest+json",
          ".woff2": "font/woff2",
        }[ext];
      if (!mime) throw new ApiError(404, "NOT_FOUND", "ページがありません。");
      let bytes;
      try {
        bytes = await readFile(file);
      } catch {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "ページがありません。ビルドを確認してください。",
        );
      }
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control": ext === ".html" || relative === "sw.js" ? "no-cache" : "public, max-age=3600",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (e) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (req.url?.split("?")[0] === "/api/recognize") {
        // Diagnostics contain fixed error codes only: no images, tokens, request bodies or upstream text.
        const allowedCodes = new Set(["MODEL_NOT_FOUND", "KEY_INVALID", "PROJECT_PRECONDITION", "GOOGLE_REQUEST", "GOOGLE_UNAVAILABLE", "GOOGLE_HTTP", "QUOTA", "KEY", "UPSTREAM", "MODEL_OUTPUT", "AUTH", "ORIGIN", "CONSENT", "IMAGE", "SIZE", "DISABLED", "LIMIT", "LOCAL_QUOTA", "JSON", "NOT_FOOD", "CONFIG"]);
        const code = e instanceof ApiError && allowedCodes.has(e.code) ? e.code : "OTHER";
        const http = Number.isInteger(e.upstreamStatus) ? e.upstreamStatus : "unknown";
        console.warn(`[photo-recognition] code=${code} google_http=${http}`);
      }
      send(res, e instanceof ApiError ? e.status : 500, {
        code: e instanceof ApiError ? e.code : "SERVER",
        error:
          e instanceof ApiError
            ? e.message
            : "処理を完了できませんでした。手動入力をご利用ください。",
      });
    }
  });
}
