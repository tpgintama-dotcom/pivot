// Pivot のサービスワーカー（通知だけ。ページの読み込みにはさわらない）
// サーバーは中身なしの push を送ってくるので、届いたら Pivot（Apps Script）から通知文を取ってきて出す。
// Safari は push のたびに必ず通知を出さないといけないので、取れなかったときも何か出す
const APP = "https://script.google.com/macros/s/AKfycbyulcJHv9hNRmHVooER51Bk0N5sYTL_-KQ6QkFndalTs9HCGNTplMavNr86ESxKSICH/exec";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
const toB64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function pull() {
  const sub = await self.registration.pushManager.getSubscription();
  if (!sub) return [];
  const h = toB64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint)));
  const r = await fetch(APP + "?api=push&h=" + h, { cache: "no-store", credentials: "omit" });
  const j = await r.json();
  return Array.isArray(j.items) ? j.items : [];
}
self.addEventListener("push", e => e.waitUntil((async () => {
  let items = [];
  try { items = await Promise.race([pull(), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 25000))]); } catch (err) {}
  if (!items.length) items = [{ title: "Pivot", body: "お知らせがあります。Pivot を開いて確かめてください。", tag: "pivot" }];
  for (const n of items.slice(0, 5)) {
    await self.registration.showNotification(String(n.title || "Pivot"), { body: String(n.body || ""), tag: String(n.tag || "pivot"), icon: "icon-192.png", badge: "icon-192.png", data: { url: n.url || "" } });
  }
})()));
// 通知を押したら、開いている Pivot を前に出す（なければ開く）
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const url = self.registration.scope;
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) if (c.url.indexOf(url) === 0 && "focus" in c) return c.focus();
    return self.clients.openWindow(url);
  })());
});
