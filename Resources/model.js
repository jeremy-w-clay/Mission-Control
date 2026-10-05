(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Model = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function config() {
    if (typeof OrganizerConfig !== "undefined") return OrganizerConfig;
    return require("./config.js");
  }

  function dates() {
    if (typeof Dates !== "undefined") return Dates;
    return require("./dates.js");
  }

  function seniority() {
    if (typeof Seniority !== "undefined") return Seniority;
    return require("./seniority.js");
  }

  function noteKeys() {
    return config().notes.map(function (note) { return note.key; });
  }

  function partnerIds() {
    return config().partners.map(function (partner) { return partner.id; });
  }

  function dailyTarget() {
    return config().dailyTarget;
  }

  function blankProspect() {
    const prospect = {
      name: "",
      title: "",
      linkedinUrl: "",
      salesforceId: "",
      placement: ""
    };
    noteKeys().forEach(function (key) { prospect[key] = ""; });
    return prospect;
  }

  function blankAccount() {
    return {
      accountName: "",
      salesforce: null,
      upcomingCall: null,
      notes: "",
      prospects: []
    };
  }

  function blankStore() {
    return { version: 1, days: {}, months: {}, addedAccounts: {} };
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function decodeEntities(text) {
    return String(text)
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(Number(n)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCodePoint(parseInt(n, 16)); });
  }

  function paragraphs(html) {
    let source = String(html || "");
    if (!source.trim()) return [];
    source = source.replace(/<\s*br\s*\/?\s*>/gi, "\n");
    source = source.replace(/<\/\s*(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, "\n");
    source = source.replace(/<[^>]+>/g, "");
    source = decodeEntities(source).replace(/\u00a0/g, " ");
    return source.split("\n").map(function (line) {
      return line.replace(/[ \t\f\v]+/g, " ").trim();
    }).filter(Boolean);
  }

  function normalizeColor(value) {
    const raw = String(value || "").trim().toLowerCase();
    const full = /^#([0-9a-f]{6})$/.exec(raw);
    if (full) return "#" + full[1];
    const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(raw);
    if (!rgb) return "";
    return "#" + [rgb[1], rgb[2], rgb[3]].map(function (n) {
      const hex = Number(n).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("");
  }

  const HIGHLIGHTS = { "#f4e2a8": 1, "#d7ecd9": 1, "#d5e4f7": 1, "#f6d6da": 1 };
  const DROP_TAGS = { script: 1, iframe: 1, object: 1, style: 1 };
  const ALLOW_TAGS = { p: 1, div: 1, br: 1, ul: 1, ol: 1, li: 1, h1: 1, h2: 1, h3: 1, span: 1, b: 1, strong: 1, i: 1, em: 1 };

  function highlightColor(attrs) {
    const match = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))/i.exec(attrs || "");
    if (!match) return "";
    const color = normalizeColor(match[1]);
    return HIGHLIGHTS[color] ? color : "";
  }

  function sanitizeHtml(value) {
    const source = String(value == null ? "" : value);
    if (!source.trim()) return "";
    if (source.indexOf("<") === -1) return "<p>" + escapeHtml(source) + "</p>";
    const cleaned = cleanHtml(source);
    return paragraphs(cleaned).length ? cleaned : "";
  }

  function cleanHtml(html) {
    const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][a-zA-Z0-9]*)\s*>|<([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?\s*\/?>|[^<]+/g;
    let out = "";
    const skip = [];
    let match;
    while ((match = re.exec(html))) {
      const token = match[0];
      if (token.indexOf("<!--") === 0) continue;
      if (match[1]) {
        const name = match[1].toLowerCase();
        if (skip.length && skip[skip.length - 1] === name) skip.pop();
        else if (!skip.length && ALLOW_TAGS[name]) out += "</" + name + ">";
        continue;
      }
      if (match[2]) {
        const name = match[2].toLowerCase();
        const selfClose = /\/\s*>$/.test(token) || name === "br";
        if (DROP_TAGS[name]) {
          if (!selfClose) skip.push(name);
          continue;
        }
        if (skip.length || !ALLOW_TAGS[name]) continue;
        if (name === "br") {
          out += "<br>";
          continue;
        }
        if (name === "span") {
          const color = highlightColor(match[3] || "");
          out += color ? '<span style="background-color: ' + color + '">' : "<span>";
        } else {
          out += "<" + name + ">";
        }
        continue;
      }
      if (!skip.length) out += escapeHtml(decodeEntities(token));
    }
    return out.trim();
  }

  function isEmptyProspect(prospect) {
    if (!prospect || typeof prospect !== "object") return true;
    if (String(prospect.name || "").trim()) return false;
    if (String(prospect.title || "").trim()) return false;
    if (String(prospect.linkedinUrl || "").trim()) return false;
    if (String(prospect.salesforceId || "").trim()) return false;
    return noteKeys().every(function (key) { return paragraphs(prospect[key]).length === 0; });
  }

  function normalizeProspect(raw) {
    const prospect = blankProspect();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return prospect;
    ["name", "title", "linkedinUrl", "salesforceId"].forEach(function (key) {
      prospect[key] = typeof raw[key] === "string" ? raw[key] : "";
    });
    noteKeys().forEach(function (key) {
      prospect[key] = sanitizeHtml(raw[key] || "");
    });
    prospect.placement = raw.placement === "above" || raw.placement === "below" ? raw.placement : "";
    return prospect;
  }

  function compactProspects(list) {
    const filled = [];
    (list || []).forEach(function (item) {
      const prospect = normalizeProspect(item);
      if (!isEmptyProspect(prospect)) filled.push(prospect);
    });
    while (filled.length < dailyTarget()) filled.push(blankProspect());
    return filled;
  }

  function cleanLink(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const accountId = typeof value.accountId === "string" ? value.accountId : "";
    const opportunityId = typeof value.opportunityId === "string" ? value.opportunityId : "";
    if (!accountId && !opportunityId) return null;
    return { accountId: accountId, opportunityId: opportunityId };
  }

  function cleanTime(value) {
    const match = /^(\d{2}):(\d{2})/.exec(value || "");
    if (!match) return "";
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return "";
    return match[1] + ":" + match[2];
  }

  function cleanCall(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const date = dates().isDateKey(value.date) ? value.date : "";
    const time = cleanTime(value.time);
    const attendees = [];
    (Array.isArray(value.attendees) ? value.attendees : []).forEach(function (person) {
      if (!person || typeof person !== "object") return;
      const name = typeof person.name === "string" ? person.name : "";
      const title = typeof person.title === "string" ? person.title : "";
      if (!name.trim() && !title.trim()) return;
      attendees.push({ name: name, title: title });
    });
    if (!date && !time && !attendees.length) return null;
    return { date: date, time: time, attendees: attendees };
  }

  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + canonical(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function normalizeAccount(raw) {
    const account = blankAccount();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      account.prospects = compactProspects([]);
      return { account: account, changed: true };
    }
    account.accountName = typeof raw.accountName === "string" ? raw.accountName : "";
    account.salesforce = cleanLink(raw.salesforce);
    account.upcomingCall = cleanCall(raw.upcomingCall);
    account.notes = sanitizeHtml(raw.notes || "");
    const prospects = Array.isArray(raw.prospects) ? raw.prospects.map(normalizeProspect) : [];
    account.prospects = compactProspects(prospects);
    return { account: account, changed: canonical(account) !== canonical(raw) };
  }

  function normalizeDay(raw, key) {
    const day = { date: key, accounts: {} };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { day: day, changed: true };
    let changed = raw.date !== key;
    Object.keys(raw).forEach(function (field) {
      if (field !== "date" && field !== "accounts") changed = true;
    });
    const accounts = raw.accounts && typeof raw.accounts === "object" && !Array.isArray(raw.accounts) ? raw.accounts : {};
    if (raw.accounts !== accounts) changed = true;
    Object.keys(accounts).forEach(function (id) {
      if (partnerIds().indexOf(id) === -1) {
        changed = true;
        return;
      }
      const result = normalizeAccount(accounts[id]);
      day.accounts[id] = result.account;
      if (result.changed) changed = true;
    });
    return { day: day, changed: changed };
  }

  function normalizeEvent(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const title = typeof raw.title === "string" ? raw.title : "";
    if (!title.trim()) return null;
    const tasks = [];
    (Array.isArray(raw.tasks) ? raw.tasks : []).forEach(function (task) {
      if (!task || typeof task !== "object") return;
      const text = typeof task.text === "string" ? task.text : "";
      tasks.push({
        id: typeof task.id === "string" && task.id ? task.id : uuid(),
        text: text,
        done: !!task.done
      });
    });
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uuid(),
      title: title,
      date: typeof raw.date === "string" ? raw.date : "",
      tasks: tasks
    };
  }

  function normalizeMonth(raw, key) {
    const month = { month: key, events: [] };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { month: month, changed: true };
    let changed = raw.month !== key;
    Object.keys(raw).forEach(function (field) {
      if (field !== "month" && field !== "events") changed = true;
    });
    (Array.isArray(raw.events) ? raw.events : []).forEach(function (event) {
      const clean = normalizeEvent(event);
      if (!clean) {
        changed = true;
        return;
      }
      month.events.push(clean);
      if (canonical(clean) !== canonical(event)) changed = true;
    });
    if (!Array.isArray(raw.events)) changed = true;
    return { month: month, changed: changed };
  }

  function normalizeAddedEntry(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const name = typeof raw.name === "string" ? raw.name : "";
    if (!name.trim()) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uuid(),
      name: name,
      salesforce: cleanLink(raw.salesforce),
      addedOn: dates().isDateKey(raw.addedOn) ? raw.addedOn : ""
    };
  }

  function load(raw) {
    const store = blankStore();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { store: store, changed: false };
    let changed = Object.keys(raw).some(function (key) {
      return key !== "version" && key !== "days" && key !== "months" && key !== "addedAccounts";
    });
    if ("version" in raw && raw.version !== 1) changed = true;

    if (raw.days && typeof raw.days === "object" && !Array.isArray(raw.days)) {
      Object.keys(raw.days).forEach(function (key) {
        if (!dates().isDateKey(key)) {
          changed = true;
          return;
        }
        const result = normalizeDay(raw.days[key], key);
        store.days[key] = result.day;
        if (result.changed) changed = true;
      });
    } else if ("days" in raw && raw.days != null) changed = true;

    if (raw.months && typeof raw.months === "object" && !Array.isArray(raw.months)) {
      Object.keys(raw.months).forEach(function (key) {
        if (!dates().isMonthKey(key)) {
          changed = true;
          return;
        }
        const result = normalizeMonth(raw.months[key], key);
        store.months[key] = result.month;
        if (result.changed) changed = true;
      });
    } else if ("months" in raw && raw.months != null) changed = true;

    if (raw.addedAccounts && typeof raw.addedAccounts === "object" && !Array.isArray(raw.addedAccounts)) {
      Object.keys(raw.addedAccounts).forEach(function (id) {
        if (partnerIds().indexOf(id) === -1 || !Array.isArray(raw.addedAccounts[id])) {
          changed = true;
          return;
        }
        const entries = [];
        raw.addedAccounts[id].forEach(function (entry) {
          const clean = normalizeAddedEntry(entry);
          if (!clean) {
            changed = true;
            return;
          }
          entries.push(clean);
          if (canonical(clean) !== canonical(entry)) changed = true;
        });
        store.addedAccounts[id] = entries;
      });
    } else if ("addedAccounts" in raw && raw.addedAccounts != null) changed = true;

    return { store: store, changed: changed };
  }

  function ensureAccount(store, date, partnerId) {
    if (!store.days[date]) store.days[date] = { date: date, accounts: {} };
    const day = store.days[date];
    if (!day.accounts) day.accounts = {};
    if (!day.accounts[partnerId]) {
      const account = blankAccount();
      account.prospects = compactProspects([]);
      day.accounts[partnerId] = account;
    }
    return day.accounts[partnerId];
  }

  function filledProspects(prospects) {
    return (prospects || []).filter(function (prospect) { return !isEmptyProspect(prospect); });
  }

  function firstEmptyIndex(prospects) {
    for (let i = 0; i < prospects.length; i++) {
      if (isEmptyProspect(prospects[i])) return i;
    }
    return -1;
  }

  function naturalSide(prospect) {
    return seniority().side(seniority().rank(prospect && prospect.title));
  }

  function effectiveSide(prospect) {
    if (prospect && (prospect.placement === "above" || prospect.placement === "below")) return prospect.placement;
    return naturalSide(prospect);
  }

  function placeProspect(prospect, side) {
    prospect.placement = side === naturalSide(prospect) ? "" : side;
  }

  function orderedProspects(prospects) {
    const above = [];
    const below = [];
    (prospects || []).forEach(function (prospect, index) {
      if (isEmptyProspect(prospect)) return;
      const item = { prospect: prospect, index: index };
      (effectiveSide(prospect) === "above" ? above : below).push(item);
    });
    function compare(a, b) {
      const left = seniority().rank(a.prospect.title);
      const right = seniority().rank(b.prospect.title);
      const leftRank = left === null ? -1 : left;
      const rightRank = right === null ? -1 : right;
      if (leftRank !== rightRank) return rightRank - leftRank;
      return a.index - b.index;
    }
    above.sort(compare);
    below.sort(compare);
    const all = above.concat(below).map(function (item) { return item.prospect; });
    return {
      above: above.map(function (item) { return item.prospect; }),
      below: below.map(function (item) { return item.prospect; }),
      all: all
    };
  }

  function copyText(partnerName, account) {
    const header = partnerName + " - " + (account && account.accountName ? account.accountName : "");
    const people = orderedProspects(account && account.prospects).all;
    if (!people.length) return header;
    const noteKey = noteKeys()[0];
    const lines = [header];
    people.forEach(function (person, index) {
      const blocks = paragraphs(person[noteKey]);
      const parts = [person.name, person.title].map(function (part) { return String(part || "").trim(); }).filter(Boolean);
      if (blocks.length) parts.push(blocks[0]);
      lines.push((index + 1) + ". " + parts.join(", "));
      for (let i = 1; i < blocks.length; i++) {
        lines.push("");
        lines.push("   " + blocks[i]);
      }
    });
    return lines.join("\n");
  }

  function fold(value) {
    return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function accountsMatch(a, b) {
    if (!a || !b) return false;
    const aId = a.salesforce && a.salesforce.accountId;
    const bId = b.salesforce && b.salesforce.accountId;
    if (aId && bId && aId === bId) return true;
    const left = fold(a.accountName);
    const right = fold(b.accountName);
    return !!left && left === right;
  }

  function upcomingCalls(store, account, todayIso) {
    const found = [];
    Object.keys(store.days || {}).forEach(function (date) {
      const day = store.days[date];
      if (!day || !day.accounts) return;
      Object.keys(day.accounts).forEach(function (partnerId) {
        const other = day.accounts[partnerId];
        const call = other && other.upcomingCall;
        if (!call || !call.date || call.date < todayIso) return;
        if (!accountsMatch(account, other)) return;
        found.push({
          date: call.date,
          time: call.time || "",
          day: date,
          partnerId: partnerId
        });
      });
    });
    found.sort(function (a, b) { return (a.date + " " + a.time).localeCompare(b.date + " " + b.time); });
    return found;
  }

  function columnHasWork(account) {
    if (!account) return false;
    if (String(account.accountName || "").trim()) return true;
    if (paragraphs(account.notes).length) return true;
    if (account.upcomingCall) return true;
    return filledProspects(account.prospects).length > 0;
  }

  function weekBoard(store, todayDate) {
    return dates().weekdaysThrough(todayDate).map(function (date) {
      const key = dates().iso(date);
      const day = store.days && store.days[key];
      const names = {};
      partnerIds().forEach(function (id) {
        const account = day && day.accounts && day.accounts[id];
        const name = account && String(account.accountName || "").trim();
        names[id] = name || "";
      });
      return { date: key, label: dates().weekRow(date), names: names };
    });
  }

  function runningAccounts(store, partnerId, todayDate) {
    const groups = {};
    Object.keys((store && store.days) || {}).sort().forEach(function (key) {
      const date = dates().parse(key);
      if (!date || date.getDay() === 0 || date.getDay() === 6) return;
      if (!dates().weekFinished(dates().monday(date), todayDate)) return;
      const account = store.days[key].accounts && store.days[key].accounts[partnerId];
      if (!columnHasWork(account)) return;
      const name = String(account.accountName || "").trim();
      if (!name) return;
      const folded = fold(name);
      if (!groups[folded]) groups[folded] = { name: name, dates: [], salesforce: null, added: null };
      groups[folded].dates.push(key);
      groups[folded].name = name;
      if (account.salesforce && account.salesforce.accountId) groups[folded].salesforce = account.salesforce;
    });
    const added = (store.addedAccounts && store.addedAccounts[partnerId]) || [];
    added.forEach(function (entry) {
      const folded = fold(entry.name);
      if (!groups[folded]) {
        groups[folded] = { name: entry.name, dates: [], salesforce: entry.salesforce, added: entry };
      } else {
        groups[folded].added = entry;
        if ((!groups[folded].salesforce || !groups[folded].salesforce.accountId) && entry.salesforce) {
          groups[folded].salesforce = entry.salesforce;
        }
      }
    });
    return Object.keys(groups).map(function (key) { return groups[key]; }).sort(function (a, b) {
      const aDate = a.dates.length ? a.dates[a.dates.length - 1] : ((a.added && a.added.addedOn) || "");
      const bDate = b.dates.length ? b.dates[b.dates.length - 1] : ((b.added && b.added.addedOn) || "");
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (ch) {
      const n = Math.random() * 16 | 0;
      return (ch === "x" ? n : (n & 0x3 | 0x8)).toString(16);
    });
  }

  return {
    blankProspect: blankProspect,
    blankAccount: blankAccount,
    blankStore: blankStore,
    sanitizeHtml: sanitizeHtml,
    paragraphs: paragraphs,
    isEmptyProspect: isEmptyProspect,
    normalizeProspect: normalizeProspect,
    compactProspects: compactProspects,
    load: load,
    ensureAccount: ensureAccount,
    filledProspects: filledProspects,
    firstEmptyIndex: firstEmptyIndex,
    naturalSide: naturalSide,
    effectiveSide: effectiveSide,
    placeProspect: placeProspect,
    orderedProspects: orderedProspects,
    copyText: copyText,
    fold: fold,
    accountsMatch: accountsMatch,
    upcomingCalls: upcomingCalls,
    columnHasWork: columnHasWork,
    weekBoard: weekBoard,
    runningAccounts: runningAccounts,
    cleanCall: cleanCall,
    uuid: uuid,
    canonical: canonical
  };
});
