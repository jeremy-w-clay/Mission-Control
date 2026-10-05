(function (root) {
  const Config = root.OrganizerConfig;
  const Dates = root.Dates;
  const Model = root.Model;
  const Day = root.Day;
  const Events = root.Events;
  const Salesforce = root.Salesforce;

  const SWATCHES = ["#f4e2a8", "#d7ecd9", "#d5e4f7", "#f6d6da"];
  const state = {
    view: "day",
    today: Dates.today(),
    store: null,
    dialog: null,
    noteBody: null,
    detail: null,
    freshId: null,
    focusTask: null,
    sfIndex: null,
    sfView: null,
    sfStatus: null,
    sfBusy: false,
    activity: null,
    activityAsked: {},
    bandOpen: {},
    picker: null,
    recordWaiters: {}
  };

  const loaded = Model.load(readRaw());
  state.store = loaded.store;
  const events = Events.manual(state.store);

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

  function columnDate(partnerId) {
    const column = partnerId ? columnNode(partnerId) : null;
    return (column && column.getAttribute("data-date")) || todayIso();
  }

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
    state.detail = null;
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

  function sfView() {
    if (!state.sfIndex) return null;
    if (!state.sfView || state.sfView.raw !== state.sfIndex) state.sfView = Salesforce.build(state.sfIndex);
    return state.sfView;
  }

  function activityFor(bucket, id) {
    const entries = state.activity && state.activity[bucket];
    return (entries && id && entries[id]) || null;
  }

  function withDateLabel(item) {
    if (!item) return null;
    const parsed = item.date ? Dates.parse(item.date) : null;
    return Object.assign({}, item, { dateLabel: parsed ? Dates.weekdayDate(parsed, state.today) : "" });
  }

  function heroOptions(account, date, partnerId) {
    const calls = account ? Model.upcomingCalls(state.store, account, todayIso()) : [];
    const columnCall = account && account.upcomingCall;
    const chipIsMine = !!(calls.length && calls[0].day === date && calls[0].partnerId === partnerId);
    const view = sfView();
    const sfAccount = view ? Salesforce.linkedAccount(view, account) : null;
    const accountActivity = sfAccount ? activityFor("accounts", sfAccount.id) : null;
    const chips = view ? Salesforce.chips(view, account, accountActivity && accountActivity.item, state.today) : [];
    const opportunity = view ? Salesforce.linkedOpportunity(view, account) : null;
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
      linked: (account && account.salesforce && account.salesforce.accountId) || "",
      opportunity: opportunity ? opportunity.name : "",
      chips: chips
    };
  }

  function followUpOptions(date, partnerId) {
    const back = Dates.addDays(Dates.parse(date), -7);
    const backIso = Dates.iso(back);
    const account = accountFor(backIso, partnerId);
    const weekday = Dates.lastWeekPhrase(back);
    if (!Model.columnHasWork(account)) return { empty: true, weekday: weekday };
    const view = sfView();
    const sfAccount = view ? Salesforce.linkedAccount(view, account) : null;
    const people = Model.orderedProspects(account.prospects).all.map(function (prospect) {
      const entry = prospect.salesforceId ? activityFor("contacts", prospect.salesforceId) : null;
      return { prospect: prospect, activity: entry ? withDateLabel(entry.item) : null, entry: entry };
    });
    const linkedPeople = people.filter(function (person) { return person.prospect.salesforceId; });
    let count;
    if (!linkedPeople.length) count = "no new activity";
    else if (linkedPeople.some(function (person) { return !person.entry; })) count = "checking activity\u2026";
    else {
      const total = linkedPeople.reduce(function (sum, person) { return sum + (person.entry.newCount || 0); }, 0);
      count = total === 0 ? "no new activity" : total === 1 ? "1 new activity" : total + " new activities";
    }
    const latestEntry = sfAccount ? activityFor("accounts", sfAccount.id) : null;
    return {
      empty: false,
      weekday: weekday,
      accountName: account.accountName || "Untitled account",
      count: count,
      latest: latestEntry ? withDateLabel(latestEntry.item) : null,
      people: people,
      open: !!state.bandOpen[partnerId],
      contactIds: linkedPeople.map(function (person) { return person.prospect.salesforceId; }),
      accountIds: sfAccount ? [sfAccount.id] : [],
      after: backIso
    };
  }

  // Ask the native side for live activity on the follow-up contacts and the hero accounts.
  // One request per distinct payload per session, repeated only after ten minutes.
  function requestActivity(contactIds, accountIds, after) {
    const payload = { contacts: contactIds.slice(0, 60), accounts: accountIds.slice(0, 10), after: after };
    if (!payload.contacts.length && !payload.accounts.length) return;
    const key = JSON.stringify(payload);
    const last = state.activityAsked[key] || 0;
    if (Date.now() - last < 10 * 60 * 1000) return;
    state.activityAsked[key] = Date.now();
    bridge({ op: "salesforce:activity", contacts: payload.contacts, accounts: payload.accounts, after: payload.after });
  }

  function renderColumn(partner, date) {
    const column = document.createElement("section");
    column.className = "column";
    column.setAttribute("data-partner", partner.id);
    column.setAttribute("data-date", date);
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

    if (date === todayIso() && !state.detail) {
      const followUp = followUpOptions(date, partner.id);
      column.appendChild(Day.renderFollowUp(followUp));
      if (!followUp.empty && state.sfIndex) {
        const view = sfView();
        const heroAccount = view ? Salesforce.linkedAccount(view, stored) : null;
        requestActivity(followUp.contactIds, followUp.accountIds.concat(heroAccount ? [heroAccount.id] : []), followUp.after);
      } else if (state.sfIndex) {
        const view = sfView();
        const heroAccount = view ? Salesforce.linkedAccount(view, stored) : null;
        if (heroAccount) requestActivity([], [heroAccount.id], date);
      }
    }

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

  function paint(node, partner) {
    node.style.setProperty("--partner", partner.color);
    node.style.setProperty("--partner-tint", partner.tint);
    node.style.setProperty("--partner-ink", partner.ink);
  }

  function renderDetail(rootEl) {
    const header = document.createElement("header");
    header.className = "day-header";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "text-button back-button";
    back.textContent = state.detail.from === "archive" ? "Running Account List" : "Back to week";
    header.appendChild(back);
    const heading = document.createElement("h1");
    heading.textContent = Dates.detailDate(Dates.parse(state.detail.date));
    header.appendChild(heading);
    rootEl.appendChild(header);
    const columns = document.createElement("div");
    columns.className = "columns";
    const partner = partnerById(state.detail.partnerId);
    if (partner) columns.appendChild(renderColumn(partner, state.detail.date));
    rootEl.appendChild(columns);
  }

  function renderWeek(rootEl) {
    const header = document.createElement("header");
    header.className = "day-header";
    const caption = document.createElement("p");
    caption.className = "caption";
    caption.textContent = Dates.weekCaption(state.today);
    header.appendChild(caption);
    rootEl.appendChild(header);
    const columns = document.createElement("div");
    columns.className = "columns";
    const rows = Model.weekBoard(state.store, state.today);
    Config.partners.forEach(function (partner) {
      const board = document.createElement("section");
      board.className = "board";
      board.setAttribute("data-partner", partner.id);
      paint(board, partner);
      const name = document.createElement("h2");
      name.className = "board-name";
      name.textContent = partner.name;
      board.appendChild(name);
      rows.forEach(function (row) {
        const line = document.createElement("div");
        line.className = "week-row";
        const when = document.createElement("span");
        when.className = "week-when";
        when.textContent = row.label;
        line.appendChild(when);
        const accountName = row.names[partner.id];
        if (accountName) {
          const open = document.createElement("button");
          open.type = "button";
          open.className = "week-account";
          open.setAttribute("data-date", row.date);
          open.setAttribute("data-partner", partner.id);
          open.textContent = accountName;
          line.appendChild(open);
        } else {
          line.appendChild(Object.assign(document.createElement("span"), { className: "week-empty", textContent: "\u2014" }));
        }
        board.appendChild(line);
      });
      columns.appendChild(board);
    });
    rootEl.appendChild(columns);
  }

  function countLabel(count) {
    if (!count) return "No accounts yet";
    if (count === 1) return "1 account";
    return count + " accounts";
  }

  function renderArchive(rootEl) {
    const header = document.createElement("header");
    header.className = "day-header";
    const heading = document.createElement("h1");
    heading.className = "view-heading";
    heading.textContent = "Running Account List";
    const caption = document.createElement("p");
    caption.className = "caption";
    caption.textContent = "Accounts from the day view move here when their week ends. Open a date to see that day\u2019s notes.";
    header.appendChild(heading);
    header.appendChild(caption);
    rootEl.appendChild(header);
    const columns = document.createElement("div");
    columns.className = "columns";
    Config.partners.forEach(function (partner) {
      const rows = Model.runningAccounts(state.store, partner.id, state.today);
      const board = document.createElement("section");
      board.className = "board";
      board.setAttribute("data-partner", partner.id);
      paint(board, partner);
      const count = document.createElement("p");
      count.className = "label";
      count.textContent = countLabel(rows.length);
      board.appendChild(count);
      const name = document.createElement("h2");
      name.className = "partner-name";
      name.textContent = partner.name;
      board.appendChild(name);
      const add = document.createElement("button");
      add.type = "button";
      add.className = "add-card add-account";
      add.textContent = "+ Add account";
      board.appendChild(add);
      rows.forEach(function (row) {
        const item = document.createElement("article");
        item.className = "account-row";
        if (row.added) item.setAttribute("data-added", row.added.id);
        const mark = document.createElement("div");
        mark.className = "account-mark";
        mark.textContent = Day.initials(row.name);
        item.appendChild(mark);
        const body = document.createElement("div");
        body.className = "account-body";
        const latest = row.dates.length ? row.dates[row.dates.length - 1] : "";
        const linked = row.salesforce && row.salesforce.accountId;
        if (latest || linked) {
          const open = document.createElement("button");
          open.type = "button";
          open.className = "account-open";
          open.textContent = row.name;
          if (latest) {
            open.setAttribute("data-date", latest);
            open.setAttribute("data-partner", partner.id);
          } else {
            open.setAttribute("data-record", linked);
          }
          body.appendChild(open);
        } else {
          const plain = document.createElement("p");
          plain.className = "account-open";
          plain.textContent = row.name;
          body.appendChild(plain);
        }
        if (row.dates.length) {
          const dates = document.createElement("p");
          dates.className = "account-dates";
          row.dates.forEach(function (iso, index) {
            if (index) dates.appendChild(document.createTextNode(" \u00b7 "));
            const dateButton = document.createElement("button");
            dateButton.type = "button";
            dateButton.className = "date-open";
            dateButton.setAttribute("data-date", iso);
            dateButton.setAttribute("data-partner", partner.id);
            dateButton.textContent = Dates.shortDate(Dates.parse(iso), state.today);
            dates.appendChild(dateButton);
          });
          body.appendChild(dates);
        }
        if (row.added && row.added.addedOn) {
          const added = document.createElement("p");
          added.className = "added-on";
          added.textContent = "Added " + Dates.shortDate(Dates.parse(row.added.addedOn), state.today);
          body.appendChild(added);
        }
        item.appendChild(body);
        if (row.added && !row.dates.length) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "tool remove-added";
          remove.setAttribute("aria-label", "Remove " + row.name);
          remove.textContent = "\u00d7";
          item.appendChild(remove);
        }
        board.appendChild(item);
      });
      columns.appendChild(board);
    });
    rootEl.appendChild(columns);
    if (state.freshId) {
      const row = columns.querySelector('[data-added="' + state.freshId + '"]');
      state.freshId = null;
      if (row) {
        row.classList.add("is-new");
        window.setTimeout(function () { row.classList.remove("is-new"); }, 280);
      }
    }
  }

  function renderMonth(rootEl) {
    const month = Dates.monthKey(state.today);
    const header = document.createElement("header");
    header.className = "day-header month-header";
    const titles = document.createElement("div");
    const heading = document.createElement("h1");
    heading.className = "month-title";
    heading.textContent = "Important Events";
    const caption = document.createElement("p");
    caption.className = "caption";
    caption.textContent = Dates.monthYear(state.today);
    titles.appendChild(heading);
    titles.appendChild(caption);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "text-button add-event";
    add.textContent = "+ Add event";
    header.appendChild(titles);
    header.appendChild(add);
    rootEl.appendChild(header);
    const body = document.createElement("div");
    body.className = "month-body";
    const list = events.list(month);
    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "caption";
      empty.textContent = "Events you add for " + Dates.MONTHS[state.today.getMonth()] + " appear here.";
      body.appendChild(empty);
    }
    list.forEach(function (event) {
      const card = document.createElement("article");
      card.className = "event";
      card.setAttribute("data-event", event.id);
      const title = document.createElement("h2");
      title.textContent = event.title;
      card.appendChild(title);
      if (event.date) {
        const when = document.createElement("p");
        when.className = "event-date";
        when.textContent = event.date;
        card.appendChild(when);
      }
      event.tasks.forEach(function (task) {
        const row = document.createElement("div");
        row.className = "task" + (task.done ? " done" : "");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!task.done;
        check.addEventListener("change", function () {
          events.updateTask(month, event.id, task.id, { done: check.checked });
          persist();
          row.classList.toggle("done", check.checked);
        });
        const text = document.createElement("input");
        text.className = "task-text";
        text.placeholder = "Task";
        text.value = task.text;
        text.setAttribute("data-task", task.id);
        text.addEventListener("input", function () {
          events.updateTask(month, event.id, task.id, { text: text.value });
          persist();
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "text-button";
        remove.textContent = "Remove";
        remove.addEventListener("click", function () {
          events.deleteTask(month, event.id, task.id);
          persist();
          render();
        });
        row.appendChild(check);
        row.appendChild(text);
        row.appendChild(remove);
        card.appendChild(row);
      });
      const actions = document.createElement("div");
      actions.className = "event-actions";
      const addTask = document.createElement("button");
      addTask.type = "button";
      addTask.className = "text-button";
      addTask.textContent = "+ Add task";
      addTask.addEventListener("click", function () {
        const task = events.addTask(month, event.id, "");
        persist();
        state.focusTask = task && task.id;
        render();
      });
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-button edit-event";
      edit.setAttribute("data-event", event.id);
      edit.textContent = "Edit";
      const removeEvent = document.createElement("button");
      removeEvent.type = "button";
      removeEvent.className = "text-button";
      removeEvent.textContent = "Delete";
      removeEvent.addEventListener("click", function () {
        events.deleteEvent(month, event.id);
        persist();
        render();
      });
      actions.appendChild(addTask);
      actions.appendChild(edit);
      actions.appendChild(removeEvent);
      card.appendChild(actions);
      body.appendChild(card);
    });
    rootEl.appendChild(body);
    if (state.focusTask) {
      const field = body.querySelector('[data-task="' + state.focusTask + '"]');
      state.focusTask = null;
      if (field) field.focus();
    }
  }

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    app.replaceChildren();
    const view = document.createElement("div");
    view.className = "view";
    if (state.detail && (state.view === "week" || state.view === "archive")) renderDetail(view);
    else if (state.view === "day") renderDay(view);
    else if (state.view === "week") renderWeek(view);
    else if (state.view === "month") renderMonth(view);
    else renderArchive(view);
    app.appendChild(view);
  }

  function rerenderColumn(partnerId, flipFrom) {
    const current = columnNode(partnerId);
    const partner = partnerById(partnerId);
    if (!current || !partner) return null;
    const next = renderColumn(partner, current.getAttribute("data-date") || todayIso());
    current.replaceWith(next);
    if (flipFrom) Day.playFlip(next, flipFrom);
    return next;
  }

  function syncCount(partnerId) {
    const column = columnNode(partnerId);
    const account = accountFor(columnDate(partnerId), partnerId);
    if (!column || !account) return;
    const filled = Model.filledProspects(account.prospects).length;
    const count = column.querySelector(".count");
    if (!count) return;
    count.textContent = filled + "/" + Config.dailyTarget;
    count.classList.toggle("met", filled >= Config.dailyTarget);
  }

  function syncRing(partnerId) {
    const column = columnNode(partnerId);
    const account = accountFor(columnDate(partnerId), partnerId);
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
    const date = column.getAttribute("data-date") || todayIso();
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
      const account = accountFor(columnDate(partnerId), partnerId);
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
    const account = Model.ensureAccount(state.store, columnDate(partnerId), partnerId);
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
    const account = accountFor(columnDate(partnerId), partnerId);
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
    const account = accountFor(columnDate(partnerId), partnerId) || Model.blankAccount();
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
    const account = Model.ensureAccount(state.store, columnDate(partnerId), partnerId);
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
    const account = Model.ensureAccount(state.store, columnDate(partnerId), partnerId);
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

  function openWorkedDay(from, date, partnerId) {
    state.detail = { from: from, date: date, partnerId: partnerId };
    render();
  }

  function openAddAccount(partnerId) {
    const partner = partnerById(partnerId);
    const dialog = openBackdrop(function () {
      const node = document.createElement("div");
      const title = document.createElement("h2");
      title.id = "dialog-title";
      title.textContent = "Add an account";
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "It goes on " + partner.name + "\u2019s running list.";
      const field = document.createElement("label");
      field.className = "field";
      const input = document.createElement("input");
      input.placeholder = state.sfIndex ? "Search accounts and opportunities" : "Account name";
      input.autocomplete = "off";
      field.appendChild(input);
      const suggestions = document.createElement("div");
      suggestions.className = "suggestions";
      const error = document.createElement("p");
      error.className = "form-error";
      function chosenName() {
        const typed = input.value.trim();
        if (!typed) return;
        const taken = Model.runningAccounts(state.store, partnerId, state.today).some(function (row) {
          return Model.fold(row.name) === Model.fold(typed);
        });
        suggestions.replaceChildren();
        error.textContent = "";
        if (taken) {
          error.textContent = typed + " is already on " + partner.name + "\u2019s list.";
          return;
        }
        const use = document.createElement("button");
        use.type = "button";
        use.className = "suggestion";
        const label = document.createElement("span");
        label.textContent = "Use \u201c" + typed + "\u201d";
        const detail = document.createElement("span");
        detail.className = "suggestion-detail";
        detail.textContent = "Account name only, not linked to Salesforce";
        use.appendChild(label);
        use.appendChild(detail);
        use.addEventListener("click", function () { saveAddedAccount(partnerId, typed); });
        suggestions.appendChild(use);
      }
      input.addEventListener("input", chosenName);
      input.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const first = suggestions.querySelector(".suggestion");
        if (first) first.click();
      });
      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      actions.appendChild(button("dialog-button", "Cancel", closeDialog));
      node.appendChild(title);
      node.appendChild(hint);
      node.appendChild(field);
      node.appendChild(suggestions);
      node.appendChild(error);
      node.appendChild(actions);
      return node;
    });
    dialog.setAttribute("aria-labelledby", "dialog-title");
    const input = dialog.querySelector("input");
    if (input) input.focus();
  }

  function saveAddedAccount(partnerId, name) {
    if (!state.store.addedAccounts[partnerId]) state.store.addedAccounts[partnerId] = [];
    const entry = { id: Model.uuid(), name: name, salesforce: null, addedOn: todayIso() };
    state.store.addedAccounts[partnerId].push(entry);
    state.freshId = entry.id;
    persist();
    closeDialog();
    render();
  }

  function openEventDialog(eventId) {
    const month = Dates.monthKey(state.today);
    const existing = eventId ? events.list(month).filter(function (item) { return item.id === eventId; })[0] : null;
    const dialog = openBackdrop(function () {
      const node = document.createElement("div");
      const title = document.createElement("h2");
      title.id = "dialog-title";
      title.textContent = existing ? "Edit event" : "Add event";
      const titleField = document.createElement("label");
      titleField.className = "field";
      titleField.appendChild(Object.assign(document.createElement("span"), { textContent: "Title" }));
      const titleInput = document.createElement("input");
      titleInput.value = existing ? existing.title : "";
      titleField.appendChild(titleInput);
      const dateField = document.createElement("label");
      dateField.className = "field";
      dateField.appendChild(Object.assign(document.createElement("span"), { textContent: "Date or range" }));
      const dateInput = document.createElement("input");
      dateInput.placeholder = "Optional, such as Oct 12 or Oct 12\u201314";
      dateInput.value = existing ? existing.date : "";
      dateField.appendChild(dateInput);
      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      if (existing) {
        actions.appendChild(button("dialog-button danger", "Delete event", function () {
          events.deleteEvent(month, existing.id);
          persist();
          closeDialog();
          render();
        }));
      }
      actions.appendChild(button("dialog-button", "Cancel", closeDialog));
      actions.appendChild(button("dialog-button primary", "Save", function () {
        const nextTitle = titleInput.value.trim();
        if (!nextTitle) return;
        if (existing) events.updateEvent(month, existing.id, { title: nextTitle, date: dateInput.value.trim() });
        else events.addEvent(month, nextTitle, dateInput.value.trim());
        persist();
        closeDialog();
        render();
      }));
      node.appendChild(title);
      node.appendChild(titleField);
      node.appendChild(dateField);
      node.appendChild(actions);
      titleInput.addEventListener("keydown", function (event) {
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

  function onClick(event) {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.classList.contains("back-button")) {
      state.detail = null;
      render();
      return;
    }
    if (target.classList.contains("week-account")) {
      openWorkedDay("week", target.getAttribute("data-date"), target.getAttribute("data-partner"));
      return;
    }
    if (target.classList.contains("add-account")) {
      openAddAccount(target.closest(".board").getAttribute("data-partner"));
      return;
    }
    if (target.classList.contains("account-open") || target.classList.contains("date-open")) {
      const date = target.getAttribute("data-date");
      const record = target.getAttribute("data-record");
      if (date) openWorkedDay("archive", date, target.getAttribute("data-partner"));
      else if (record) openSalesforceRecord("Account", record);
      return;
    }
    if (target.classList.contains("remove-added")) {
      const row = target.closest(".account-row");
      const partnerId = target.closest(".board").getAttribute("data-partner");
      const id = row && row.getAttribute("data-added");
      state.store.addedAccounts[partnerId] = (state.store.addedAccounts[partnerId] || []).filter(function (entry) {
        return entry.id !== id;
      });
      persist();
      render();
      return;
    }
    if (target.classList.contains("add-event")) {
      openEventDialog(null);
      return;
    }
    if (target.classList.contains("edit-event")) {
      openEventDialog(target.getAttribute("data-event"));
      return;
    }
    if (target.classList.contains("followup-toggle")) {
      const band = target.closest(".followup");
      const partnerId = target.closest(".column").getAttribute("data-partner");
      const open = !band.classList.contains("is-open");
      state.bandOpen[partnerId] = open;
      band.classList.toggle("is-open", open);
      target.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    if (target.getAttribute("data-record")) {
      openSalesforceRecord("", target.getAttribute("data-record"));
      return;
    }
    const column = target.closest(".column");
    if (!column) return;
    const partnerId = column.getAttribute("data-partner");
    const date = column.getAttribute("data-date") || todayIso();
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
    if (target.classList.contains("details-button")) {
      const card = target.closest(".card");
      const account = accountFor(date, partnerId);
      const prospect = account && account.prospects[Number(card.getAttribute("data-index"))];
      if (prospect && prospect.salesforceId) openSalesforceRecord("Contact", prospect.salesforceId);
      return;
    }
    if (target.classList.contains("copy-button")) copyColumn(partnerId);
    if (target.classList.contains("choose")) openSalesforcePicker(partnerId);
  }

  function statusLineNode() {
    const line = Salesforce.statusLine(state.sfStatus, state.sfBusy, state.sfIndex, state.today);
    const node = document.createElement("p");
    node.className = "sf-status";
    node.appendChild(document.createTextNode(line.text));
    if (line.action === "refresh") {
      node.appendChild(document.createTextNode(" "));
      node.appendChild(button("text-button", "Refresh now", function () {
        state.sfBusy = true;
        bridge({ op: "salesforce:refresh" });
        refreshStatusLines();
      }));
    } else if (line.action === "signin") {
      node.appendChild(document.createTextNode(" "));
      node.appendChild(button("text-button", "Sign in", function () { bridge({ op: "salesforce:signin" }); }));
    }
    return node;
  }

  function refreshStatusLines() {
    document.querySelectorAll(".sf-status").forEach(function (node) { node.replaceWith(statusLineNode()); });
  }

  function recordLink(id) {
    const base = (state.sfIndex && state.sfIndex.instanceUrl) || Config.instanceUrl || "";
    return base.replace(/\/$/, "") + "/" + id;
  }

  function objectForId(id) {
    const prefix = String(id || "").slice(0, 3);
    if (prefix === "001") return "Account";
    if (prefix === "003") return "Contact";
    if (prefix === "006") return "Opportunity";
    if (prefix === "00K") return "OpportunityContactRole";
    return "";
  }

  function fetchRecord(object, id, callback) {
    state.recordWaiters[object + ":" + id] = callback;
    if (!bridge({ op: "salesforce:record", object: object, id: id })) {
      callback({ object: object, id: id, data: null, fields: [] });
    }
  }

  // The field list shared by the Details dialog and the picker's in-dialog Details.
  function renderRecordDetails(container, object, id, headingNode) {
    container.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "caption";
    loading.textContent = "Loading every field\u2026";
    container.appendChild(loading);
    fetchRecord(object, id, function (response) {
      if (!container.isConnected) return;
      container.replaceChildren();
      const view = sfView();
      const record = response.data;
      if (!record) {
        const missing = document.createElement("p");
        missing.className = "caption";
        missing.textContent = "This record isn\u2019t in the Salesforce copy. It may belong to an account outside your synced accounts.";
        container.appendChild(missing);
        return;
      }
      if (headingNode) {
        headingNode.textContent = record.Name || headingNode.textContent;
        const sub = headingNode.parentElement.querySelector(".dialog-subtitle");
        if (sub) sub.textContent = Salesforce.subtitle(object, record, view);
      }
      const links = document.createElement("p");
      links.className = "record-links";
      const open = document.createElement("a");
      open.href = recordLink(id);
      open.target = "_blank";
      open.rel = "noreferrer";
      open.textContent = "Open in Salesforce";
      links.appendChild(open);
      const linkedinField = state.sfIndex && state.sfIndex.linkedinField;
      const linkedinUrl = object === "Contact" && linkedinField ? record[linkedinField] : "";
      if (linkedinUrl) {
        links.appendChild(document.createTextNode(" \u00b7 "));
        const li = document.createElement("a");
        li.href = linkedinUrl;
        li.target = "_blank";
        li.rel = "noreferrer";
        li.textContent = "LinkedIn profile";
        links.appendChild(li);
      }
      container.appendChild(links);
      const rows = Salesforce.fieldRows(object, response.fields, record);
      const emptyCount = rows.filter(function (row) { return row.empty; }).length;
      const controls = document.createElement("div");
      controls.className = "field-controls";
      const filter = document.createElement("input");
      filter.placeholder = "Filter fields";
      filter.autocomplete = "off";
      const toggle = document.createElement("label");
      toggle.className = "toggle";
      const check = document.createElement("input");
      check.type = "checkbox";
      toggle.appendChild(check);
      toggle.appendChild(document.createTextNode(" Show empty fields (" + emptyCount + ")"));
      controls.appendChild(filter);
      controls.appendChild(toggle);
      container.appendChild(controls);
      const list = document.createElement("dl");
      list.className = "field-list";
      container.appendChild(list);
      function draw() {
        list.replaceChildren();
        const query = Salesforce.fold(filter.value);
        rows.forEach(function (row) {
          if (row.empty && !check.checked) return;
          if (query && Salesforce.fold(row.label + " " + row.text).indexOf(query) === -1) return;
          const dt = document.createElement("dt");
          dt.textContent = row.label;
          const dd = document.createElement("dd");
          if (row.link) {
            const a = document.createElement("a");
            a.href = row.link;
            a.target = "_blank";
            a.rel = "noreferrer";
            a.textContent = row.text;
            dd.appendChild(a);
          } else {
            dd.textContent = row.text || "\u2014";
            if (!row.text) dd.classList.add("empty");
          }
          list.appendChild(dt);
          list.appendChild(dd);
        });
      }
      filter.addEventListener("input", draw);
      check.addEventListener("change", draw);
      draw();
    });
  }

  function openSalesforceRecord(object, id) {
    object = object || objectForId(id);
    if (!object || !id) return;
    const dialog = openBackdrop(function () {
      const node = document.createElement("div");
      node.className = "wide";
      const title = document.createElement("h2");
      title.id = "dialog-title";
      title.textContent = "Details";
      const subtitle = document.createElement("p");
      subtitle.className = "dialog-subtitle";
      const body = document.createElement("div");
      body.className = "record-body";
      node.appendChild(title);
      node.appendChild(subtitle);
      node.appendChild(body);
      node.appendChild(statusLineNode());
      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      actions.appendChild(button("dialog-button primary", "Done", closeDialog));
      node.appendChild(actions);
      renderRecordDetails(body, object, id, title);
      return node;
    });
    dialog.setAttribute("aria-labelledby", "dialog-title");
  }

  function openSalesforcePicker(partnerId) {
    const view = sfView();
    if (!view) {
      openAccountDialog(partnerId);
      return;
    }
    const partner = partnerById(partnerId);
    const date = columnDate(partnerId);
    const account = Model.ensureAccount(state.store, date, partnerId);
    const picker = {
      step: 1,
      accountId: (account.salesforce && account.salesforce.accountId) || "",
      opportunityId: (account.salesforce && account.salesforce.opportunityId) || "",
      selected: {},
      query: "",
      detailsId: ""
    };
    Model.filledProspects(account.prospects).forEach(function (prospect) {
      if (prospect.salesforceId) picker.selected[prospect.salesforceId] = true;
    });
    if (picker.accountId && view.accountsById[picker.accountId]) picker.step = 2;
    state.picker = picker;

    const dialog = openBackdrop(function () {
      const node = document.createElement("div");
      node.className = "wide picker";
      return node;
    });
    dialog.setAttribute("aria-labelledby", "dialog-title");

    function drawStepOne() {
      dialog.replaceChildren();
      const title = document.createElement("h2");
      title.id = "dialog-title";
      title.textContent = "Choose the account";
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "Pick the opportunity or account for the " + partner.name + " section. Its contacts come next.";
      const search = document.createElement("input");
      search.className = "search";
      search.placeholder = "Search accounts and opportunities";
      search.autocomplete = "off";
      search.value = picker.query;
      const list = document.createElement("div");
      list.className = "suggestions";
      function draw() {
        list.replaceChildren();
        const typed = search.value.trim();
        Salesforce.suggestions(view, partnerId, typed).forEach(function (item, index) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "suggestion" + (index === 0 ? " is-first" : "");
          row.appendChild(Object.assign(document.createElement("span"), { textContent: item.name }));
          row.appendChild(Object.assign(document.createElement("span"), { className: "suggestion-detail", textContent: item.detail }));
          row.addEventListener("click", function () {
            picker.accountId = item.accountId;
            picker.opportunityId = item.opportunityId;
            account.salesforce = { accountId: item.accountId, opportunityId: item.opportunityId || "" };
            const sfAccount = view.accountsById[item.accountId];
            account.accountName = sfAccount ? sfAccount.name : item.name;
            persist();
            rerenderColumn(partnerId);
            picker.step = 2;
            picker.query = "";
            drawStepTwo();
          });
          list.appendChild(row);
        });
        if (typed) {
          const use = document.createElement("button");
          use.type = "button";
          use.className = "suggestion" + (list.childElementCount ? "" : " is-first");
          use.appendChild(Object.assign(document.createElement("span"), { textContent: "Use \u201c" + typed + "\u201d" }));
          use.appendChild(Object.assign(document.createElement("span"), { className: "suggestion-detail", textContent: "Account name only, not linked to Salesforce" }));
          use.addEventListener("click", function () {
            account.accountName = typed;
            account.salesforce = null;
            persist();
            closeDialog();
            rerenderColumn(partnerId);
          });
          list.appendChild(use);
        }
      }
      search.addEventListener("input", function () { picker.query = search.value; draw(); });
      search.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const first = list.querySelector(".suggestion");
        if (first) first.click();
      });
      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      actions.appendChild(button("dialog-button", "Cancel", closeDialog));
      dialog.appendChild(title);
      dialog.appendChild(hint);
      dialog.appendChild(search);
      dialog.appendChild(list);
      dialog.appendChild(statusLineNode());
      dialog.appendChild(actions);
      draw();
      search.focus();
    }

    function drawStepTwo() {
      dialog.replaceChildren();
      const sfAccount = view.accountsById[picker.accountId];
      const opp = picker.opportunityId ? view.opportunitiesById[picker.opportunityId] : null;
      const title = document.createElement("h2");
      title.id = "dialog-title";
      title.textContent = "Contacts at " + (sfAccount ? sfAccount.name : account.accountName);
      const oppLine = document.createElement("p");
      oppLine.className = "hint opp-line";
      oppLine.appendChild(document.createTextNode(opp ? "Opportunity: " + opp.name + " \u00b7 " + opp.stage : "No opportunity picked"));
      oppLine.appendChild(document.createTextNode(" "));
      oppLine.appendChild(button("text-button", "Change", function () { picker.step = 1; drawStepOne(); }));
      const search = document.createElement("input");
      search.className = "search";
      search.placeholder = "Search by name, title, or email";
      search.autocomplete = "off";
      const list = document.createElement("div");
      list.className = "contact-list";
      const note = document.createElement("p");
      note.className = "caption";
      const footer = document.createElement("div");
      footer.className = "picker-footer";
      const summary = document.createElement("span");
      summary.className = "picker-summary";
      function selectedCount() {
        return Object.keys(picker.selected).filter(function (id) { return picker.selected[id]; }).length;
      }
      function handTyped() {
        return Model.filledProspects(account.prospects).filter(function (prospect) { return !prospect.salesforceId; }).length;
      }
      function updateSummary() {
        summary.textContent = selectedCount() + " selected \u00b7 " + (selectedCount() + handTyped()) + "/" + Config.dailyTarget + " prospects";
      }
      function draw() {
        list.replaceChildren();
        const result = Salesforce.contactsFor(view, picker.accountId, picker.opportunityId, search.value);
        result.rows.forEach(function (row) {
          const item = document.createElement("div");
          item.className = "contact-row" + (picker.selected[row.contact.id] ? " is-selected" : "");
          const check = document.createElement("input");
          check.type = "checkbox";
          check.checked = !!picker.selected[row.contact.id];
          check.addEventListener("change", function () {
            picker.selected[row.contact.id] = check.checked;
            item.classList.toggle("is-selected", check.checked);
            updateSummary();
          });
          const text = document.createElement("div");
          text.className = "contact-text";
          text.appendChild(Object.assign(document.createElement("div"), { className: "contact-name", textContent: row.contact.name }));
          if (row.contact.title) text.appendChild(Object.assign(document.createElement("div"), { className: "contact-title", textContent: row.contact.title }));
          if (row.badge) text.appendChild(Object.assign(document.createElement("div"), { className: "role-badge", textContent: row.badge }));
          const tools = document.createElement("div");
          tools.className = "contact-tools";
          if (row.contact.linkedin) {
            const li = document.createElement("a");
            li.href = row.contact.linkedin;
            li.target = "_blank";
            li.rel = "noreferrer";
            li.textContent = "LinkedIn";
            tools.appendChild(li);
          }
          tools.appendChild(button("text-button", "Details", function () {
            picker.detailsId = row.contact.id;
            drawDetails(row.contact.id);
          }));
          item.appendChild(check);
          item.appendChild(text);
          item.appendChild(tools);
          list.appendChild(item);
        });
        note.textContent = result.total > result.rows.length
          ? "Showing " + result.rows.length.toLocaleString("en-US") + " of " + result.total.toLocaleString("en-US") + " contacts. Search to narrow the list."
          : "";
        updateSummary();
      }
      search.addEventListener("input", draw);
      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      actions.appendChild(button("dialog-button", "Cancel", closeDialog));
      actions.appendChild(button("dialog-button primary", "Update prospects", function () {
        applyPickerSelection(partnerId, account, picker, view);
      }));
      footer.appendChild(summary);
      footer.appendChild(statusLineNode());
      footer.appendChild(actions);
      dialog.appendChild(title);
      dialog.appendChild(oppLine);
      dialog.appendChild(search);
      dialog.appendChild(list);
      dialog.appendChild(note);
      dialog.appendChild(footer);
      draw();
      search.focus();
    }

    function drawDetails(contactId) {
      dialog.replaceChildren();
      const title = document.createElement("h2");
      title.id = "dialog-title";
      const contact = view.contactsById[contactId];
      title.textContent = contact ? contact.name : "Details";
      const subtitle = document.createElement("p");
      subtitle.className = "dialog-subtitle";
      const body = document.createElement("div");
      body.className = "record-body";
      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      actions.appendChild(button("dialog-button", "Back to contacts", function () { drawStepTwo(); }));
      dialog.appendChild(title);
      dialog.appendChild(subtitle);
      dialog.appendChild(body);
      dialog.appendChild(actions);
      renderRecordDetails(body, "Contact", contactId, title);
    }

    if (picker.step === 2) drawStepTwo();
    else drawStepOne();
  }

  // Keep hand-typed cards, drop unchecked Salesforce cards, add the newly checked contacts.
  function applyPickerSelection(partnerId, account, picker, view) {
    const kept = account.prospects.filter(function (prospect) {
      if (Model.isEmptyProspect(prospect)) return false;
      if (!prospect.salesforceId) return true;
      return !!picker.selected[prospect.salesforceId];
    });
    const have = {};
    kept.forEach(function (prospect) { if (prospect.salesforceId) have[prospect.salesforceId] = true; });
    const added = [];
    Object.keys(picker.selected).forEach(function (id) {
      if (!picker.selected[id] || have[id]) return;
      const contact = view.contactsById[id];
      if (!contact) return;
      const prospect = Model.blankProspect();
      prospect.name = contact.name;
      prospect.title = contact.title || "";
      prospect.linkedinUrl = contact.linkedin || "";
      prospect.salesforceId = contact.id;
      kept.push(prospect);
      added.push(prospect);
    });
    account.prospects = Model.compactProspects(kept);
    persist();
    closeDialog();
    const column = rerenderColumn(partnerId);
    if (!column) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    added.forEach(function (prospect, order) {
      const index = account.prospects.indexOf(prospect);
      const card = column.querySelector('.card[data-index="' + index + '"]');
      if (!card || reduce) return;
      card.classList.add("is-new");
      card.style.animationDelay = (order * 45) + "ms";
      window.setTimeout(function () {
        card.classList.remove("is-new");
        card.style.animationDelay = "";
      }, 280 + order * 45);
    });
  }

  function moveProspect(partnerId, index, side) {
    const account = accountFor(columnDate(partnerId), partnerId);
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
    const account = accountFor(columnDate(drag.partnerId), drag.partnerId);
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
    drag.home = Model.effectiveSide(accountFor(columnDate(drag.partnerId), drag.partnerId).prospects[drag.index]);
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
    const account = accountFor(columnDate(partnerId), partnerId);
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
      state.sfView = null;
      if (!state.dialog) render();
    },
    receiveSalesforceStatus: function (b64, busy) {
      try { state.sfStatus = decodeB64(b64); } catch (err) { state.sfStatus = null; }
      state.sfBusy = !!busy;
      refreshStatusLines();
    },
    receiveSalesforceRecord: function (b64) {
      let response;
      try { response = decodeB64(b64); } catch (err) { return; }
      const key = response.object + ":" + response.id;
      const waiter = state.recordWaiters[key];
      delete state.recordWaiters[key];
      if (waiter) waiter(response);
    },
    receiveSalesforceActivity: function (b64) {
      try { state.activity = decodeB64(b64); } catch (err) { return; }
      if (state.view === "day" && !state.detail) {
        Config.partners.forEach(function (partner) {
          const column = columnNode(partner.id);
          if (!column) return;
          const hero = column.querySelector(".hero");
          const band = column.querySelector(".followup, .followup-empty");
          const stored = accountFor(todayIso(), partner.id);
          if (hero) hero.replaceWith(Day.renderHero(stored || Model.blankAccount(), heroOptions(stored, todayIso(), partner.id)));
          if (band) band.replaceWith(Day.renderFollowUp(followUpOptions(todayIso(), partner.id)));
        });
      }
    },
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
