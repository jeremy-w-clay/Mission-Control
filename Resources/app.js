(function (root) {
  const Config = root.OrganizerConfig;
  const Dates = root.Dates;
  const Model = root.Model;
  const Day = root.Day;

  const SWATCHES = ["#f4e2a8", "#d7ecd9", "#d5e4f7", "#f6d6da"];
  const state = {
    view: "day",
    today: Dates.today(),
    store: null,
    dialog: null,
    noteBody: null,
    sfIndex: null,
    sfStatus: null,
    sfBusy: false
  };

  const loaded = Model.load(readRaw());
  state.store = loaded.store;

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
    const status = document.getElementById("titlebar-status");
    if (status) {
      status.textContent = text;
      status.classList.toggle("failed", !!failed);
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

  function todayIso() { return Dates.iso(state.today); }

  function partnerById(id) {
    for (let i = 0; i < Config.partners.length; i++) {
      if (Config.partners[i].id === id) return Config.partners[i];
    }
    return null;
  }

  function accountFor(date, partnerId) {
    const day = state.store.days[date];
    return (day && day.accounts && day.accounts[partnerId]) || null;
  }

  function columnNode(partnerId) {
    return document.querySelector('.column[data-partner="' + partnerId + '"]');
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
    document.querySelectorAll("#titlebar-tabs .tab").forEach(function (button) {
      const id = button.getAttribute("data-view");
      button.textContent = labels[id];
      button.classList.toggle("selected", id === state.view);
    });
  }

  function setView(name) {
    if (name !== "day" && name !== "week" && name !== "month" && name !== "archive") return;
    if (state.dialog) closeDialog();
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
    ["day", "week", "month", "archive"].forEach(function (id) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab";
      button.setAttribute("data-view", id);
      button.addEventListener("click", function () { setView(id); });
      tabs.appendChild(button);
    });
  }

  function heroOptions(account, date, partnerId) {
    const calls = account ? Model.upcomingCalls(state.store, account, todayIso()) : [];
    const columnCall = account && account.upcomingCall;
    const chipIsMine = !!(calls.length && calls[0].day === date && calls[0].partnerId === partnerId);
    const chips = [];
    if (calls.length) {
      const soonest = calls[0];
      const when = Dates.callLabel(soonest.date, soonest.time);
      chips.push({
        label: calls.length > 1 ? "Calls" : "Call",
        value: calls.length > 1 ? calls.length + " \u00b7 next " + when : when,
        button: true,
        className: "chip-call",
        title: when
      });
    }
    return {
      notesFilled: !!(account && Model.paragraphs(account.notes).length),
      columnCall: columnCall,
      columnCallLabel: columnCall ? Dates.callLabel(columnCall.date, columnCall.time) : "",
      chipIsMine: chipIsMine,
      linked: !!(account && account.salesforce && account.salesforce.accountId),
      chips: chips
    };
  }

  function renderColumn(partner, date) {
    const column = document.createElement("section");
    column.className = "column";
    column.setAttribute("data-partner", partner.id);
    column.style.setProperty("--partner", partner.color);
    column.style.setProperty("--partner-tint", partner.tint);
    column.style.setProperty("--partner-ink", partner.ink);

    column.appendChild(Object.assign(document.createElement("p"), { className: "label", textContent: "Target account" }));
    const name = document.createElement("h2");
    name.className = "partner-name";
    name.textContent = partner.name;
    column.appendChild(name);

    const stored = accountFor(date, partner.id);
    const account = stored || Model.blankAccount();
    column.appendChild(Day.renderHero(account, heroOptions(stored, date, partner.id)));

    const head = document.createElement("div");
    head.className = "prospects-head";
    head.appendChild(Object.assign(document.createElement("p"), { className: "label", textContent: "Prospects" }));
    const filled = Model.filledProspects(account.prospects);
    const count = document.createElement("span");
    count.className = "count" + (filled.length >= Config.dailyTarget ? " met" : "");
    count.textContent = filled.length + "/" + Config.dailyTarget;
    head.appendChild(count);
    if (state.sfIndex) {
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "text-button choose";
      choose.textContent = "Choose from Salesforce";
      head.appendChild(choose);
    }
    column.appendChild(head);

    const stack = document.createElement("div");
    stack.className = "stack";
    const ordered = Model.orderedProspects(account.prospects);
    const enteringIndex = account.prospects.findIndex(function (prospect) { return prospect._entering; });
    function appendProspect(prospect) {
      const index = account.prospects.indexOf(prospect);
      const entering = index === enteringIndex;
      if (entering) delete prospect._entering;
      const slot = Day.renderCard(prospect, {
        index: index,
        notes: Config.notes,
        entering: entering
      });
      stack.appendChild(slot);
      if (entering) {
        const card = slot.querySelector(".card");
        window.setTimeout(function () { card.classList.remove("is-new"); }, 280);
      }
    }
    if (ordered.all.length) {
      if (!ordered.above.length) stack.appendChild(Day.renderLine(0, ordered.below.length, Config.lineLevel));
      ordered.above.forEach(appendProspect);
      if (ordered.above.length) stack.appendChild(Day.renderLine(ordered.above.length, ordered.below.length, Config.lineLevel));
      ordered.below.forEach(appendProspect);
    }
    if (enteringIndex !== -1 && Model.isEmptyProspect(account.prospects[enteringIndex])) {
      appendProspect(account.prospects[enteringIndex]);
    }
    stack.appendChild(Day.renderAddCard());
    column.appendChild(stack);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-button";
    copy.textContent = "Copy";
    column.appendChild(copy);
    return column;
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
    Config.partners.forEach(function (partner) {
      columns.appendChild(renderColumn(partner, todayIso()));
    });
    rootEl.appendChild(columns);
  }

  function renderPlain(rootEl, title, copy) {
    const header = document.createElement("header");
    header.className = "day-header";
    const heading = document.createElement("h1");
    heading.className = "view-heading";
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.className = "placeholder-copy";
    paragraph.textContent = copy;
    header.appendChild(heading);
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

  function rerenderColumn(partnerId, flipFrom) {
    if (state.view !== "day") return null;
    const current = columnNode(partnerId);
    const partner = partnerById(partnerId);
    if (!current || !partner) return null;
    const next = renderColumn(partner, todayIso());
    current.replaceWith(next);
    if (flipFrom) Day.playFlip(next, flipFrom);
    return next;
  }

  function syncCount(partnerId) {
    const column = columnNode(partnerId);
    const account = accountFor(todayIso(), partnerId);
    if (!column || !account) return;
    const filled = Model.filledProspects(account.prospects).length;
    const count = column.querySelector(".count");
    if (!count) return;
    count.textContent = filled + "/" + Config.dailyTarget;
    count.classList.toggle("met", filled >= Config.dailyTarget);
  }

  function syncRing(partnerId) {
    const column = columnNode(partnerId);
    const account = accountFor(todayIso(), partnerId);
    const ring = column && column.querySelector(".ring");
    if (ring) ring.classList.toggle("filled", !!(account && Model.paragraphs(account.notes).length));
  }

  function plainPaste(event) {
    const target = event.target;
    if (!target || !target.isContentEditable) return;
    event.preventDefault();
    const text = (event.clipboardData || root.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  function markEmpty(node) {
    const empty = !String(node.textContent || "").replace(/\u00a0/g, " ").trim();
    if (empty) node.dataset.empty = "1";
    else delete node.dataset.empty;
  }

  function onInput(event) {
    const target = event.target;
    const column = target.closest && target.closest(".column");
    if (!column) return;
    const partnerId = column.getAttribute("data-partner");
    const date = todayIso();
    const card = target.closest(".card");
    if (!card) return;
    const account = Model.ensureAccount(state.store, date, partnerId);
    const index = Number(card.getAttribute("data-index"));
    const prospect = account.prospects[index];
    if (!prospect) return;
    if (target.classList.contains("name")) {
      const next = target.textContent.replace(/\s+/g, " ").trim();
      if (prospect.salesforceId && next !== (target.dataset.linkedName || "")) {
        prospect.salesforceId = "";
        delete target.dataset.linkedName;
        const details = card.querySelector(".details-button");
        if (details) details.remove();
      }
      if (!next) {
        prospect.linkedinUrl = "";
        const link = card.querySelector(".linkedin");
        if (link) link.remove();
      }
      prospect.name = target.textContent.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
      const avatar = card.querySelector(".avatar");
      if (avatar) {
        avatar.textContent = Day.initials(prospect.name);
        avatar.classList.toggle("blank", !prospect.name);
      }
    } else if (target.classList.contains("job")) {
      prospect.title = target.textContent.replace(/\s+/g, " ").trim();
      prospect.placement = "";
      markEmpty(target);
    } else if (target.classList.contains("note-body")) {
      const key = target.dataset.note;
      prospect[key] = Model.sanitizeHtml(target.innerHTML);
      markEmpty(target);
    }
    persist();
    syncCount(partnerId);
  }

  function onFocusOut(event) {
    const card = event.target.closest && event.target.closest(".card");
    if (!card) return;
    const next = event.relatedTarget;
    if (next && card.contains(next)) return;
    if (next && next.closest && next.closest(".note-toolbar")) return;
    const column = card.closest(".column");
    if (!column || !column.isConnected) return;
    const partnerId = column.getAttribute("data-partner");
    const index = Number(card.getAttribute("data-index"));
    window.setTimeout(function () {
      const live = columnNode(partnerId);
      const liveCard = live && live.querySelector('.card[data-index="' + index + '"]');
      if (!liveCard) return;
      const active = document.activeElement;
      if (active && liveCard.contains(active)) return;
      const account = accountFor(todayIso(), partnerId);
      const prospect = account && account.prospects[index];
      if (!prospect) return;
      if (!Model.isEmptyProspect(prospect)) {
        const domOrder = Array.prototype.map.call(live.querySelectorAll(".card"), function (card) {
          return card.getAttribute("data-index");
        }).join(",");
        const nextOrder = Model.orderedProspects(account.prospects).all.map(function (item) {
          return String(account.prospects.indexOf(item));
        }).join(",");
        if (domOrder === nextOrder) return;
        const before = Day.captureFlip(live);
        const active = document.activeElement;
        const dest = active && active.closest && active.closest(".card");
        const destIndex = dest && dest.getAttribute("data-index");
        const field = !active ? ""
          : active.classList.contains("name") ? ".name"
          : active.classList.contains("job") ? ".job"
          : active.classList.contains("grip") ? ".grip"
          : active.dataset.note ? '.note-body[data-note="' + active.dataset.note + '"]' : "";
        const next = rerenderColumn(partnerId);
        if (destIndex && field && next) {
          const node = next.querySelector('.card[data-index="' + destIndex + '"] ' + field);
          if (node) node.focus();
        }
        if (next) Day.playFlip(next, before);
        return;
      }
      Day.animateOut(liveCard.closest(".card-slot"), function () {
        account.prospects = Model.compactProspects(account.prospects);
        persist();
        rerenderColumn(partnerId);
      });
    }, 0);
  }

  function addProspect(partnerId) {
    const account = Model.ensureAccount(state.store, todayIso(), partnerId);
    let index = Model.firstEmptyIndex(account.prospects);
    if (index === -1) {
      account.prospects.push(Model.blankProspect());
      index = account.prospects.length - 1;
    } else if (!Model.isEmptyProspect(account.prospects[index])) {
      return;
    }
    const existing = columnNode(partnerId).querySelector('.card[data-index="' + index + '"] .name');
    if (existing) {
      existing.focus();
      return;
    }
    account.prospects[index]._entering = true;
    rerenderColumn(partnerId);
    const name = columnNode(partnerId).querySelector('.card[data-index="' + index + '"] .name');
    if (name) name.focus();
  }

  function removeProspect(partnerId, index) {
    const column = columnNode(partnerId);
    const slot = column && column.querySelector('.card[data-index="' + index + '"]');
    const wrap = slot && slot.closest(".card-slot");
    const account = accountFor(todayIso(), partnerId);
    if (!account || !wrap) return;
    Day.animateOut(wrap, function () {
      account.prospects.splice(index, 1);
      account.prospects = Model.compactProspects(account.prospects);
      persist();
      rerenderColumn(partnerId);
    });
  }

  function copyColumn(partnerId) {
    const partner = partnerById(partnerId);
    const account = accountFor(todayIso(), partnerId) || Model.blankAccount();
    const text = Model.copyText(partner.name, account);
    if (!bridge({ op: "copy", text: text }) && root.navigator && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setStatus("COPIED", false);
  }

  function closeDialog() {
    const backdrop = document.querySelector(".backdrop");
    if (backdrop) backdrop.remove();
    state.dialog = null;
    state.noteBody = null;
  }

  function openBackdrop(builder) {
    closeDialog();
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const dialog = builder();
    dialog.classList.add("dialog");
    dialog.setAttribute("role", "dialog");
    backdrop.appendChild(dialog);
    backdrop.addEventListener("mousedown", function (event) {
      if (event.target === backdrop) closeDialog();
    });
    document.body.appendChild(backdrop);
    state.dialog = dialog;
    return dialog;
  }

  function button(className, text, onClick) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = className;
    node.textContent = text;
    node.addEventListener("click", onClick);
    return node;
  }

  function openAccountDialog(partnerId) {
    const account = Model.ensureAccount(state.store, todayIso(), partnerId);
    const dialog = openBackdrop(function () {
      const node = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = "Account";
      title.id = "dialog-title";
      const field = document.createElement("label");
      field.className = "field";
      const caption = document.createElement("span");
      caption.textContent = "Account name";
      const input = document.createElement("input");
      input.value = account.accountName || "";
      input.autocomplete = "off";
      field.appendChild(caption);
      field.appendChild(input);
      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      actions.appendChild(button("dialog-button", "Cancel", closeDialog));
      actions.appendChild(button("dialog-button primary", "Save", function () {
        account.accountName = input.value.trim();
        persist();
        closeDialog();
        rerenderColumn(partnerId);
      }));
      node.appendChild(title);
      node.appendChild(field);
      node.appendChild(actions);
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          actions.querySelector(".primary").click();
        }
      });
      return node;
    });
    dialog.setAttribute("aria-labelledby", "dialog-title");
    const input = dialog.querySelector("input");
    if (input) input.focus();
  }

  function applyCommand(command, value) {
    const body = state.noteBody;
    if (body) body.focus();
    document.execCommand(command, false, value);
    if (body) body.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function swatchButtons(bar) {
    SWATCHES.forEach(function (color) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch";
      swatch.style.background = color;
      swatch.setAttribute("aria-label", color);
      swatch.addEventListener("mousedown", function (event) { event.preventDefault(); });
      swatch.addEventListener("click", function () { applyCommand("hiliteColor", color); });
      bar.appendChild(swatch);
    });
  }

  function openNotes(partnerId, prospectIndex, noteKey) {
    const partner = partnerById(partnerId);
    const account = Model.ensureAccount(state.store, todayIso(), partnerId);
    const prospect = prospectIndex == null ? null : account.prospects[prospectIndex];
    const note = Config.notes.filter(function (item) { return item.key === noteKey; })[0];
    const label = note ? note.label : "";
    const dialog = openBackdrop(function () {
      const node = document.createElement("div");
      const title = document.createElement("h2");
      title.id = "dialog-title";
      title.textContent = prospect
        ? (prospect.name || "Prospect") + " \u00b7 " + label
        : partner.name + " notes";
      const toolbar = document.createElement("div");
      toolbar.className = "editor-toolbar";
      toolbar.appendChild(button("tool-text", "Paragraph", function () { applyCommand("formatBlock", "p"); }));
      toolbar.appendChild(button("tool-text", "Bullets", function () { applyCommand("insertUnorderedList"); }));
      swatchButtons(toolbar);
      toolbar.appendChild(button("tool-text", "Clear color", function () { applyCommand("hiliteColor", "transparent"); }));
      const editor = document.createElement("div");
      editor.className = "editor";
      editor.contentEditable = "true";
      editor.setAttribute("role", "textbox");
      const current = prospect ? (prospect[noteKey] || "") : (account.notes || "");
      if (current) editor.innerHTML = current;
      editor.addEventListener("focus", function () { state.noteBody = editor; });
      editor.addEventListener("input", function () {
        const html = Model.sanitizeHtml(editor.innerHTML);
        if (prospect) prospect[noteKey] = html;
        else account.notes = html;
        persist();
        if (!prospect) syncRing(partnerId);
        else {
          const live = columnNode(partnerId).querySelector('.card[data-index="' + prospectIndex + '"] .note-body[data-note="' + noteKey + '"]');
          if (live && live !== editor) live.innerHTML = html;
        }
      });
      editor.addEventListener("paste", plainPaste);
      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      actions.appendChild(button("dialog-button primary", "Done", function () {
        closeDialog();
        if (prospect) rerenderColumn(partnerId);
        else syncRing(partnerId);
      }));
      node.appendChild(title);
      node.appendChild(toolbar);
      node.appendChild(editor);
      node.appendChild(actions);
      return node;
    });
    dialog.setAttribute("aria-labelledby", "dialog-title");
    const editor = dialog.querySelector(".editor");
    state.noteBody = editor;
    editor.focus();
  }

  function openCallDialog(date, partnerId) {
    const account = Model.ensureAccount(state.store, date, partnerId);
    const existing = account.upcomingCall;
    const dialog = openBackdrop(function () {
      const node = document.createElement("div");
      const title = document.createElement("h2");
      title.id = "dialog-title";
      title.textContent = existing ? "Edit call" : "Add call";
      const row = document.createElement("div");
      row.className = "field-row";
      const dateField = document.createElement("label");
      dateField.className = "field";
      dateField.appendChild(Object.assign(document.createElement("span"), { textContent: "Date" }));
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.value = (existing && existing.date) || date;
      dateField.appendChild(dateInput);
      const timeField = document.createElement("label");
      timeField.className = "field";
      timeField.appendChild(Object.assign(document.createElement("span"), { textContent: "Time" }));
      const timeInput = document.createElement("input");
      timeInput.type = "time";
      timeInput.value = (existing && existing.time) || "";
      timeField.appendChild(timeInput);
      row.appendChild(dateField);
      row.appendChild(timeField);

      const attendees = document.createElement("div");
      attendees.className = "attendees";
      const people = (existing && existing.attendees && existing.attendees.length)
        ? existing.attendees.map(function (person) { return { name: person.name, title: person.title }; })
        : [{ name: "", title: "" }];

      function drawAttendees() {
        attendees.replaceChildren();
        people.forEach(function (person, index) {
          const line = document.createElement("div");
          line.className = "attendee";
          const name = document.createElement("input");
          name.placeholder = "Name";
          name.value = person.name;
          name.addEventListener("input", function () { person.name = name.value; });
          const titleInput = document.createElement("input");
          titleInput.placeholder = "Title";
          titleInput.value = person.title;
          titleInput.addEventListener("input", function () { person.title = titleInput.value; });
          const remove = button("text-button", "Remove", function () {
            people.splice(index, 1);
            if (!people.length) people.push({ name: "", title: "" });
            drawAttendees();
          });
          line.appendChild(name);
          line.appendChild(titleInput);
          line.appendChild(remove);
          attendees.appendChild(line);
        });
      }
      drawAttendees();
      const addAttendee = button("text-button", "+ Add attendee", function () {
        people.push({ name: "", title: "" });
        drawAttendees();
        const inputs = attendees.querySelectorAll("input");
        if (inputs.length) inputs[inputs.length - 2].focus();
      });

      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      if (existing) actions.appendChild(button("dialog-button danger", "Remove call", function () {
        account.upcomingCall = null;
        persist();
        closeDialog();
        rerenderColumn(partnerId);
      }));
      actions.appendChild(button("dialog-button", "Cancel", closeDialog));
      actions.appendChild(button("dialog-button primary", "Save", function () {
        const call = Model.cleanCall({ date: dateInput.value, time: timeInput.value, attendees: people });
        account.upcomingCall = call;
        persist();
        closeDialog();
        rerenderColumn(partnerId);
      }));
      node.appendChild(title);
      node.appendChild(row);
      node.appendChild(attendees);
      node.appendChild(addAttendee);
      node.appendChild(actions);
      return node;
    });
    dialog.setAttribute("aria-labelledby", "dialog-title");
    const first = dialog.querySelector("input");
    if (first) first.focus();
  }

  function showNoteToolbar(body) {
    let bar = document.querySelector(".note-toolbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "note-toolbar";
      bar.addEventListener("mousedown", function (event) { event.preventDefault(); });
      bar.appendChild(button("tool-text", "\u2022", function () { applyCommand("insertUnorderedList"); }));
      swatchButtons(bar);
      bar.appendChild(button("tool-text", "Clear", function () { applyCommand("hiliteColor", "transparent"); }));
      bar.appendChild(button("tool-text", "\u2197", function () {
        const card = state.noteBody && state.noteBody.closest(".card");
        const column = state.noteBody && state.noteBody.closest(".column");
        if (!card || !column) return;
        openNotes(column.getAttribute("data-partner"), Number(card.getAttribute("data-index")), state.noteBody.dataset.note);
      }));
    }
    state.noteBody = body;
    const note = body.closest(".note");
    if (note) note.appendChild(bar);
  }

  function onClick(event) {
    const target = event.target.closest("button, a");
    if (!target) return;
    const column = target.closest(".column");
    if (!column) return;
    const partnerId = column.getAttribute("data-partner");
    const date = todayIso();
    if (target.classList.contains("invite") || target.classList.contains("change-account")) {
      if (state.sfIndex) openSalesforcePicker(partnerId);
      else openAccountDialog(partnerId);
      return;
    }
    if (target.classList.contains("clear-account")) {
      const account = Model.ensureAccount(state.store, date, partnerId);
      account.accountName = "";
      account.salesforce = null;
      persist();
      rerenderColumn(partnerId);
      return;
    }
    if (target.classList.contains("notes-button")) {
      openNotes(partnerId, null, null);
      return;
    }
    if (target.classList.contains("call-button")) {
      openCallDialog(date, partnerId);
      return;
    }
    if (target.classList.contains("chip-call")) {
      const account = accountFor(date, partnerId);
      const calls = account ? Model.upcomingCalls(state.store, account, todayIso()) : [];
      if (calls.length) openCallDialog(calls[0].day, calls[0].partnerId);
      return;
    }
    if (target.classList.contains("add-card")) {
      addProspect(partnerId);
      return;
    }
    if (target.classList.contains("remove-card")) {
      const card = target.closest(".card");
      removeProspect(partnerId, Number(card.getAttribute("data-index")));
      return;
    }
    if (target.classList.contains("copy-button")) copyColumn(partnerId);
    if (target.classList.contains("choose")) openSalesforcePicker(partnerId);
  }

  function openSalesforcePicker() {}

  function moveProspect(partnerId, index, side) {
    const account = accountFor(todayIso(), partnerId);
    const prospect = account && account.prospects[index];
    if (!prospect) return;
    const column = columnNode(partnerId);
    const before = Day.captureFlip(column);
    Model.placeProspect(prospect, side);
    persist();
    const next = rerenderColumn(partnerId);
    const grip = next && next.querySelector('.card[data-index="' + index + '"] .grip');
    if (grip) grip.focus();
    if (next) Day.playFlip(next, before);
  }

  const drag = { card: null, slot: null, index: -1, partnerId: "", offsetX: 0, offsetY: 0, height: 0, side: "" };

  function previewLine(column, side, hot) {
    const account = accountFor(todayIso(), drag.partnerId);
    const prospect = account.prospects[drag.index];
    const saved = prospect.placement;
    Model.placeProspect(prospect, side);
    const ordered = Model.orderedProspects(account.prospects);
    prospect.placement = saved;
    const stack = column.querySelector(".stack");
    const line = column.querySelector(".line");
    const add = column.querySelector(".add-card");
    if (!stack || !line || !add) return;
    const before = Day.captureFlip(column);
    const slots = {};
    column.querySelectorAll(".card-slot").forEach(function (slot) {
      const card = slot.querySelector(".card");
      slots[card ? card.getAttribute("data-index") : String(drag.index)] = slot;
    });
    slots[String(drag.index)] = drag.slot;
    function place(list) {
      list.forEach(function (item) {
        const slot = slots[String(account.prospects.indexOf(item))];
        if (slot) stack.insertBefore(slot, add);
      });
    }
    if (!ordered.above.length) stack.insertBefore(line, add);
    place(ordered.above);
    if (ordered.above.length) stack.insertBefore(line, add);
    place(ordered.below);
    const label = line.querySelector(".line-label");
    if (label) label.textContent = "\u2191 " + ordered.above.length + " above \u00b7 " + ordered.below.length + " below \u2193";
    line.classList.toggle("is-hot", !!hot);
    Day.playFlip(column, before);
  }

  function onPointerDown(event) {
    const grip = event.target.closest && event.target.closest(".grip");
    if (!grip || event.button !== 0) return;
    const card = grip.closest(".card");
    const column = grip.closest(".column");
    if (!card || !column) return;
    event.preventDefault();
    const rect = card.getBoundingClientRect();
    const slot = card.parentElement;
    const placeholder = document.createElement("div");
    placeholder.className = "card-placeholder";
    placeholder.style.height = rect.height + "px";
    slot.replaceChild(placeholder, card);
    document.body.appendChild(card);
    drag.card = card;
    drag.slot = slot;
    drag.index = Number(card.getAttribute("data-index"));
    drag.partnerId = column.getAttribute("data-partner");
    drag.offsetX = event.clientX - rect.left;
    drag.offsetY = event.clientY - rect.top;
    drag.height = rect.height;
    drag.side = "";
    drag.home = Model.effectiveSide(accountFor(todayIso(), drag.partnerId).prospects[drag.index]);
    card.style.setProperty("--partner", column.style.getPropertyValue("--partner"));
    card.style.setProperty("--partner-tint", column.style.getPropertyValue("--partner-tint"));
    card.style.setProperty("--partner-ink", column.style.getPropertyValue("--partner-ink"));
    card.classList.add("is-lifted");
    card.style.position = "fixed";
    card.style.left = rect.left + "px";
    card.style.top = rect.top + "px";
    card.style.width = rect.width + "px";
    card.style.margin = "0";
    card.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag.card) return;
    drag.card.style.left = (event.clientX - drag.offsetX) + "px";
    drag.card.style.top = (event.clientY - drag.offsetY) + "px";
    const column = columnNode(drag.partnerId);
    const line = column && column.querySelector(".line");
    if (!line) return;
    const lineBox = line.getBoundingClientRect();
    const center = event.clientY - drag.offsetY + drag.height / 2;
    const side = center < lineBox.top + lineBox.height / 2 ? "above" : "below";
    if (side === drag.side) return;
    drag.side = side;
    previewLine(column, side, side !== drag.home);
  }

  function onPointerUp() {
    if (!drag.card) return;
    const partnerId = drag.partnerId;
    const index = drag.index;
    const side = drag.side;
    const column = columnNode(partnerId);
    const before = Day.captureFlip(column);
    before[String(index)] = drag.card.getBoundingClientRect();
    drag.card.remove();
    drag.card = null;
    const account = accountFor(todayIso(), partnerId);
    if (account && side) Model.placeProspect(account.prospects[index], side);
    persist();
    const next = rerenderColumn(partnerId);
    if (next) Day.playFlip(next, before);
  }

  function decodeB64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const Organizer = {
    setView: setView,
    markSaveFailed: function () { setStatus("COULD NOT SAVE", true); },
    receiveSalesforceIndex: function (b64) {
      try { state.sfIndex = decodeB64(b64); } catch (err) { state.sfIndex = null; }
      if (state.view === "day") render();
    },
    receiveSalesforceStatus: function (b64, busy) {
      try { state.sfStatus = decodeB64(b64); } catch (err) { state.sfStatus = null; }
      state.sfBusy = !!busy;
    },
    receiveSalesforceRecord: function () {},
    receiveSalesforceActivity: function () {},
    openAccountDialog: openAccountDialog,
    openCallDialog: openCallDialog
  };
  root.Organizer = Organizer;

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && document.querySelector(".backdrop")) {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key === "Enter" && event.target.classList && event.target.classList.contains("name")) {
      event.preventDefault();
      event.target.blur();
      return;
    }
    if (event.target.classList && event.target.classList.contains("grip") && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const card = event.target.closest(".card");
      const column = event.target.closest(".column");
      if (card && column) moveProspect(column.getAttribute("data-partner"), Number(card.getAttribute("data-index")), event.key === "ArrowUp" ? "above" : "below");
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    if (document.querySelector(".backdrop")) return;
    const typing = event.target && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if (typing) return;
    event.preventDefault();
    cycle(event.key === "ArrowRight" ? 1 : -1);
  });

  const app = document.getElementById("app");
  app.addEventListener("click", onClick);
  app.addEventListener("input", onInput);
  app.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
  app.addEventListener("focusin", function (event) {
    if (event.target.classList && event.target.classList.contains("note-body")) showNoteToolbar(event.target);
  });
  app.addEventListener("focusout", onFocusOut);
  app.addEventListener("paste", plainPaste);

  renderTitlebar();
  render();
  postTabs();
  bridge({ op: "config", appTitle: Config.appTitle });
  if (loaded.changed) persist();

  root.setInterval(function () {
    const next = Dates.today();
    if (Dates.iso(next) === Dates.iso(state.today)) return;
    state.today = next;
    render();
    postTabs();
  }, 30000);
})(typeof globalThis !== "undefined" ? globalThis : this);
