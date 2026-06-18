/* eslint-env serviceworker */
self.addEventListener("push", (event) => {
  let data = { title: "EMS Alert", body: "" };
  try {
    data = JSON.parse(event.data.text());
  } catch { /* noop */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.ico",
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
      return self.clients.openWindow("/");
    })
  );
});
