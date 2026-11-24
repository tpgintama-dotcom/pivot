// Pivot のサービスワーカー（通知だけ。ページの読み込みにはさわらない）
// サーバーは通知文を暗号化して push に入れて送ってくる（v41〜）。中身が無いときだけ Pivot（Apps Script）から通知文を取ってきて出す。
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
// 通知文は push の中に入っている（サーバーが暗号化して入れ、ブラウザがほどいて e.data に入れる）ので、まずそれをすぐ出す。
// iPhone は Pivot を閉じているとき、push のあとで通信していると、通知を出す前に止められることがあった（v41 で中身つきに変えた）
// 中身が無い push（古い送り方・暗号化できなかったとき）だけ、今までどおり Pivot に通知文を取りに行く
self.addEventListener("push", e => {
  let items = [];
  try { const j = e.data ? e.data.json() : null; if (j && (j.title || j.body)) items = [j]; } catch (err) {}
  const show = list => Promise.all(list.slice(0, 5).map(n => self.registration.showNotification(String(n.title || "Pivot"),
    { body: String(n.body || ""), tag: String(n.tag || "pivot"), icon: "icon-192.png", badge: "icon-192.png", data: { url: n.url || "" } })));
  if (items.length) { e.waitUntil(show(items)); return; }
  e.waitUntil((async () => {
    try { items = await Promise.race([pull(), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 20000))]); } catch (err) {}
    if (!items.length) items = [{ title: "Pivot", body: "お知らせがあります。Pivot を開いて確かめてください。", tag: "pivot" }];
    await show(items);
  })());
});
// 通知を押したら、開いている Pivot を前に出す（なければ開く）
// 通知に開く先（url。例 "kc-k123"＝経費のチェック）があれば、入口のページに伝えて、中の Pivot でそれを開く（v43〜）
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const open = String((e.notification.data && e.notification.data.url) || "");
  const want = /^[a-z]{2,8}-[A-Za-z0-9_]{1,40}$/.test(open) ? open : "";
  e.waitUntil((async () => {
    const url = self.registration.scope;
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) if (c.url.indexOf(url) === 0 && "focus" in c) {
      if (want) try { c.postMessage({ pivotOpen: want }); } catch (err) {}
      return c.focus();
    }
    return self.clients.openWindow(url + (want ? "?open=" + encodeURIComponent(want) : ""));
  })());
});
