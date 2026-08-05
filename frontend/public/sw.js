// Push service worker. Runs in the ServiceWorkerGlobalScope; its globals are
// declared for ESLint in eslint.config.js (the `public/sw.js` override).
self.addEventListener("push", (event) => {
  let data = { title: "EMS Alert", body: "" };
  try {
    data = JSON.parse(event.data.text());
  } catch { /* noop */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: new URL("vite.svg", self.registration.scope).href,
      tag: data.tag || "ems-notif",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.focus) return client.focus();
      }
      return self.clients.openWindow(self.registration.scope);
    })
  );
});
