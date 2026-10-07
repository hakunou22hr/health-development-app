import test from "node:test";
import assert from "node:assert/strict";
import { makeServer } from "../server/app.mjs";
import {
  recognize,
  normalizeRecognition,
  validateImage,
} from "../server/gemini.mjs";
const jpeg = Buffer.from([
  255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1,
]).toString("base64");
const image = { consent: true, image: jpeg, mimeType: "image/jpeg" };
const recognized = {
  isFood: true,
  title: "食事",
  items: [
    {
      name: "ご飯",
      foodId: "rice",
      grams: 150,
      confidence: "medium",
      note: "量は写真からの推定",
    },
  ],
  notes: ["油を確認"],
};
async function withServer(config, callback, deps = {}) {
  const server = makeServer(config, deps);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const post = (url, value, extra = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extra },
    body: JSON.stringify(value),
  });
test("missing key and missing free-project confirmation block real API access", async () => {
  for (const config of [{}, { apiKey: "test-key" }])
    await withServer(
      config,
      async (base) => {
        assert.equal(
          (await (await fetch(base + "/api/status")).json()).enabled,
          false,
        );
        assert.equal((await post(base + "/api/recognize", image)).status, 503);
      },
      {
        recognize: () => {
          throw Error("must not call");
        },
      },
    );
});
test("image formats and consent validated before forwarding", () => {
  assert.equal(validateImage(image).mimeType, "image/jpeg");
  assert.throws(() => validateImage({ ...image, consent: false }));
  assert.throws(() => validateImage({ ...image, mimeType: "image/png" }));
  assert.throws(() => validateImage({ ...image, image: "not base64" }));
});
test("recognition rejects nonfood and invalid output, preserves unknown food for review", () => {
  assert.equal(normalizeRecognition(recognized).items[0].foodId, "rice");
  assert.equal(
    normalizeRecognition({
      ...recognized,
      items: [{ ...recognized.items[0], foodId: "fried-chicken" }],
    }).items[0].foodId,
    "",
  );
  assert.throws(() => normalizeRecognition({ ...recognized, isFood: false }));
  assert.throws(() =>
    normalizeRecognition({
      ...recognized,
      items: [{ ...recognized.items[0], grams: -1 }],
    }),
  );
});
test("Gemini transport sends only image + food instructions, keeps key in server header", async () => {
  let captured;
  const result = await recognize(validateImage(image), {
    apiKey: "test-key",
    model: "gemini-3.5-flash-lite",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(recognized) }] },
            },
          ],
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(result.items[0].grams, 150);
  assert.equal(captured.options.headers["x-goog-api-key"], "test-key");
  assert.equal(captured.url.includes("test-key"), false);
  const body = JSON.parse(captured.options.body);
  assert.equal(body.contents[0].parts[1].inlineData.data, jpeg);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(captured.options.body.includes("test-key"), false);
});
test("upstream quota and malformed responses give actionable fallback without leaking secrets", async () => {
  await assert.rejects(
    recognize(image, {
      apiKey: "test-key",
      model: "gemini-3.5-flash-lite",
      fetchImpl: async () => new Response("{}", { status: 429 }),
    }),
    (e) => e.status === 429 && e.message.includes("手動入力"),
  );
  await assert.rejects(
    recognize(image, {
      apiKey: "test-key",
      model: "gemini-3.5-flash-lite",
      fetchImpl: async () => new Response("{}", { status: 200 }),
    }),
    (e) => e.status === 502,
  );
});
test("origin, login session, and global rate limit enforced", async () => {
  let calls = 0;
  await withServer(
    {
      apiKey: "test-key",
      freeConfirmed: true,
      accessToken: "private-pass",
      minuteLimit: 1,
    },
    async (base) => {
      assert.equal((await post(base + "/api/recognize", image)).status, 401);
      assert.equal(
        (await post(base + "/api/session", { token: "wrong" })).status,
        401,
      );
      assert.equal(
        (
          await post(
            base + "/api/session",
            { token: "private-pass" },
            { Origin: "https://unknown.example" },
          )
        ).status,
        403,
      );
      const login = await post(base + "/api/session", {
        token: "private-pass",
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie").split(";")[0];
      assert.ok(login.headers.get("set-cookie").includes("HttpOnly"));
      const res = await post(base + "/api/recognize", image, {
        Cookie: cookie,
      });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).items[0].foodId, "rice");
      assert.equal(
        (await post(base + "/api/recognize", image, { Cookie: cookie })).status,
        429,
      );
      assert.equal(calls, 1);
    },
    {
      recognize: async () => {
        calls++;
        return normalizeRecognition(recognized);
      },
    },
  );
});
test("public binding requires both access control and HTTPS origin", () => {
  assert.throws(() =>
    makeServer({ host: "0.0.0.0", apiKey: "key", freeConfirmed: true }),
  );
  assert.throws(() =>
    makeServer({
      host: "0.0.0.0",
      accessToken: "pass",
      origin: "http://example.com",
    }),
  );
});
