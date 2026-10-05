(function (root) {
  const Config = root.OrganizerConfig;
  const Dates = root.Dates;
  const Model = root.Model;

  const state = {
    view: "day",
    today: Dates.today(),
    store: Model.load(readRaw()).store
  };

  function readRaw() {
    if (typeof root.__ORGANIZER_STORE_B64 === "string" && root.__ORGANIZER_STORE_B64.length) {
      try {
        const binary = atob(root.__ORGANIZER_STORE_B64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return JSON.parse(new TextDecoder().decode(bytes));
      } catch (err) {
        return {};
      }
    }
    try {
      const saved = localStorage.getItem("organizer.store");
      return saved ? JSON.parse(saved) : {};
    } catch (err) {
      return {};
    }
  }

  function bridge(message) {
    const handlers = root.webkit && root.webkit.messageHandlers;
    const organizer = handlers && handlers.organizer;
    if (!organizer) return false;
    organizer.postMessage(message);
    return true;
  }

  function setStatus(text, failed) {
    const el = document.getElementById("titlebar-status");
    if (el) {
      el.textContent = text;
      el.classList.toggle("failed", !!failed);
    }
    bridge({ op: "status", text: text, failed: !!failed });
  }

  function persist() {
    if (bridge({ op: "save", store: state.store })) {
      setStatus("SAVED", false);
      return;
    }
    try {
      localStorage.setItem("organizer.store", JSON.stringify(state.store));
      setStatus("SAVED", false);
    } catch (err) {
      setStatus("COULD NOT SAVE", true);
    }
  }

  function postTabs() {
    const labels = Dates.tabLabels(state.today);
    bridge({
      op: "tabs",
      active: state.view,
      day: labels.day,
      week: labels.week,
      month: labels.month,
      archive: labels.archive
    });
    const tabs = document.getElementById("titlebar-tabs");
    if (!tabs) return;
    Array.prototype.forEach.call(tabs.querySelectorAll(".tab"), function (button) {
      button.classList.toggle("selected", button.getAttribute("data-view") === state.view);
    });
  }

  function setView(name) {
    if (name !== "day" && name !== "week" && name !== "month" && name !== "archive") return;
    state.view = name;
    render();
    postTabs();
  }

  function cycle(delta) {
    const order = ["day", "week", "month", "archive"];
    const index = order.indexOf(state.view);
    setView(order[(index + delta + order.length) % order.length]);
  }

  function renderTitlebar() {
    document.title = Config.appTitle;
    const title = document.getElementById("titlebar-title");
    if (title) title.textContent = Config.appTitle;
    const tabs = document.getElementById("titlebar-tabs");
    if (!tabs || tabs.childElementCount) return;
    const labels = Dates.tabLabels(state.today);
    ["day", "week", "month", "archive"].forEach(function (id) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab";
      button.setAttribute("data-view", id);
      button.textContent = labels[id];
      button.addEventListener("click", function () { setView(id); });
      tabs.appendChild(button);
    });
  }

  function renderDay(rootEl) {
    const header = document.createElement("header");
    header.className = "day-header";
    const heading = document.createElement("h1");
    heading.textContent = Dates.heading(state.today);
    header.appendChild(heading);
    rootEl.appendChild(header);

    const columns = document.createElement("div");
    columns.className = "columns";
    const date = Dates.iso(state.today);
    Config.partners.forEach(function (partner) {
      const column = document.createElement("section");
      column.className = "column partner-" + partner.id;
      column.style.setProperty("--partner", partner.color);
      column.style.setProperty("--partner-tint", partner.tint);
      column.style.setProperty("--partner-ink", partner.ink);
      const label = document.createElement("p");
      label.className = "label";
      label.textContent = "Target account";
      const name = document.createElement("h2");
      name.className = "partner-name";
      name.textContent = partner.name;
      const notes = document.createElement("textarea");
      notes.className = "scratch-notes";
      notes.setAttribute("aria-label", partner.name + " notes");
      notes.placeholder = "Notes";
      notes.value = (state.store.days[date] && state.store.days[date].accounts[partner.id] && state.store.days[date].accounts[partner.id].notes) || "";
      notes.addEventListener("input", function () {
        Model.ensureAccount(state.store, date, partner.id).notes = notes.value;
        persist();
      });
      column.appendChild(label);
      column.appendChild(name);
      column.appendChild(notes);
      columns.appendChild(column);
    });
    rootEl.appendChild(columns);
  }

  function renderPlain(rootEl, title, copy) {
    const header = document.createElement("header");
    header.className = "day-header";
    const heading = document.createElement("h1");
    heading.className = "view-heading";
    heading.textContent = title;
    header.appendChild(heading);
    const paragraph = document.createElement("p");
    paragraph.className = "placeholder-copy";
    paragraph.textContent = copy;
    header.appendChild(paragraph);
    rootEl.appendChild(header);
  }

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    app.replaceChildren();
    const view = document.createElement("div");
    view.className = "view";
    if (state.view === "day") renderDay(view);
    else if (state.view === "week") renderPlain(view, Dates.weekTab(state.today), "Account names from the day view land here.");
    else if (state.view === "month") renderPlain(view, "Important Events", Dates.monthYear(state.today));
    else renderPlain(view, "Running Account List", "Accounts from the day view move here when their week ends.");
    app.appendChild(view);
  }

  const Organizer = {
    setView: setView,
    markSaveFailed: function () { setStatus("COULD NOT SAVE", true); },
    receiveSalesforceIndex: function () {},
    receiveSalesforceStatus: function () {},
    receiveSalesforceRecord: function () {},
    receiveSalesforceActivity: function () {},
    arrowKey: function (key) {
      if (key === "ArrowRight") cycle(1);
      else if (key === "ArrowLeft") cycle(-1);
    }
  };
  root.Organizer = Organizer;

  document.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    const typing = event.target && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if (typing || document.querySelector(".dialog")) return;
    event.preventDefault();
    cycle(event.key === "ArrowRight" ? 1 : -1);
  });

  renderTitlebar();
  render();
  postTabs();
  bridge({ op: "config", appTitle: Config.appTitle });
})(typeof globalThis !== "undefined" ? globalThis : this);
