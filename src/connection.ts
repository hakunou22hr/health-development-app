// Use AbortController with a timer for older Safari versions as well.
export async function connectionJson(url: string, init: RequestInit = {}, timeoutMs = 65000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("サーバーが起動中、または応答できない状態です。少し待ってから接続を再確認してください。");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "接続できませんでした。少し待ってから再確認してください。");
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("接続待ちがタイムアウトしました。無料サーバーの起動に時間がかかる場合があります。少し待ってから再確認してください。");
    if (error instanceof TypeError) throw new Error("サーバーに接続できません。通信状態を確認して再確認してください。手入力・記録は使えます。");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
