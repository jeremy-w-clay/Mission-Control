(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Events = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (ch) {
      const n = Math.random() * 16 | 0;
      return (ch === "x" ? n : (n & 0x3 | 0x8)).toString(16);
    });
  }

  function ensure(store, month) {
    if (!store.months[month]) store.months[month] = { month: month, events: [] };
    return store.months[month];
  }

  function findEvent(store, month, id) {
    const events = ensure(store, month).events;
    for (let i = 0; i < events.length; i++) {
      if (events[i].id === id) return events[i];
    }
    return null;
  }

  function manual(store) {
    return {
      list: function (month) {
        const events = store.months[month] && store.months[month].events;
        return events ? events.slice() : [];
      },
      addEvent: function (month, title, date) {
        const clean = String(title || "").trim();
        if (!clean) return null;
        const event = { id: uuid(), title: clean, date: String(date || ""), tasks: [] };
        ensure(store, month).events.push(event);
        return event;
      },
      updateEvent: function (month, id, patch) {
        const event = findEvent(store, month, id);
        if (!event || !patch) return null;
        if (patch.title != null) {
          const clean = String(patch.title).trim();
          if (!clean) return null;
          event.title = clean;
        }
        if (patch.date != null) event.date = String(patch.date);
        return event;
      },
      deleteEvent: function (month, id) {
        const monthObj = ensure(store, month);
        monthObj.events = monthObj.events.filter(function (event) { return event.id !== id; });
      },
      addTask: function (month, eventId, text) {
        const event = findEvent(store, month, eventId);
        if (!event) return null;
        const task = { id: uuid(), text: String(text || ""), done: false };
        event.tasks.push(task);
        return task;
      },
      updateTask: function (month, eventId, taskId, patch) {
        const event = findEvent(store, month, eventId);
        if (!event || !patch) return null;
        let task = null;
        event.tasks.forEach(function (item) { if (item.id === taskId) task = item; });
        if (!task) return null;
        if (patch.text != null) task.text = String(patch.text);
        if (patch.done != null) task.done = !!patch.done;
        return task;
      },
      deleteTask: function (month, eventId, taskId) {
        const event = findEvent(store, month, eventId);
        if (!event) return;
        event.tasks = event.tasks.filter(function (task) { return task.id !== taskId; });
      }
    };
  }

  return { manual: manual };
});
