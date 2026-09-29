/* global document, location, localStorage, URL, fetch */
(() => {
  try {
    const script = document.currentScript;
    if (!script) return;

    const site = script.dataset.siteId || "";
    const host = script.dataset.siteHost || "";
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidV4.test(site) || !host || location.host.toLowerCase() !== host.toLowerCase()) return;

    const collectorOrigin = new URL(script.src, location.href).origin;
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const now = Date.now();
    const date = new Date(now);
    const localDay = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    let visitor = true;
    let visit = true;

    try {
      const visitorKey = `dashboard-analytics:${site}:visitor-date`;
      const activityKey = `dashboard-analytics:${site}:last-activity`;
      visitor = localStorage.getItem(visitorKey) !== localDay;
      if (visitor) localStorage.setItem(visitorKey, localDay);

      const previous = Number(localStorage.getItem(activityKey) || 0);
      visit = !previous || now - previous > 30 * 60 * 1000;
      localStorage.setItem(activityKey, String(now));
    } catch {
      visitor = true;
      visit = true;
    }

    const payload = {
      site,
      host,
      path,
      referrer: document.referrer || "",
      visitor,
      visit,
    };
    fetch(`${collectorOrigin}/collect`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "omit",
      mode: "cors",
    }).catch(() => {});
  } catch {
    // Analytics must never interfere with the tracked website.
  }
})();
