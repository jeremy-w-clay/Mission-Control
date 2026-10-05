(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Salesforce = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Read-only search over salesforce-index.json. Nothing here writes or calls Salesforce.
  function fold(value) {
    return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function dates() {
    if (typeof Dates !== "undefined") return Dates;
    return require("./dates.js");
  }

  function build(index) {
    const view = {
      raw: index,
      accountsById: {},
      opportunitiesById: {},
      contactsById: {},
      contactsByAccount: {},
      opportunitiesByAccount: {},
      rolesByOpportunity: {},
      rolesByContact: {},
      accountsByName: {}
    };
    (index.accounts || []).forEach(function (account) {
      view.accountsById[account.id] = account;
      const key = fold(account.name);
      if (key && !view.accountsByName[key]) view.accountsByName[key] = account;
    });
    (index.opportunities || []).forEach(function (opp) {
      view.opportunitiesById[opp.id] = opp;
      if (!view.opportunitiesByAccount[opp.accountId]) view.opportunitiesByAccount[opp.accountId] = [];
      view.opportunitiesByAccount[opp.accountId].push(opp);
    });
    (index.contacts || []).forEach(function (contact) {
      view.contactsById[contact.id] = contact;
      if (!view.contactsByAccount[contact.accountId]) view.contactsByAccount[contact.accountId] = [];
      view.contactsByAccount[contact.accountId].push(contact);
    });
    (index.roles || []).forEach(function (role) {
      if (!view.rolesByOpportunity[role.opportunityId]) view.rolesByOpportunity[role.opportunityId] = [];
      view.rolesByOpportunity[role.opportunityId].push(role);
      if (!view.rolesByContact[role.contactId]) view.rolesByContact[role.contactId] = [];
      view.rolesByContact[role.contactId].push(role);
    });
    return view;
  }

  function contactCount(view, accountId) {
    return (view.contactsByAccount[accountId] || []).length;
  }

  function opportunitySuggestion(view, opp) {
    const account = view.accountsById[opp.accountId];
    return {
      kind: "opportunity",
      id: opp.id,
      opportunityId: opp.id,
      accountId: opp.accountId,
      name: opp.name,
      detail: "Opportunity \u00b7 " + (account ? account.name : "") + " \u00b7 " + opp.stage,
      closed: !!opp.closed
    };
  }

  function accountSuggestion(view, account) {
    const count = contactCount(view, account.id);
    return {
      kind: "account",
      id: account.id,
      opportunityId: "",
      accountId: account.id,
      name: account.name,
      detail: "Account \u00b7 " + count + (count === 1 ? " contact" : " contacts"),
      closed: false
    };
  }

  function suggestions(view, partnerId, typed, limit) {
    limit = limit || 40;
    const query = fold(typed);
    if (!query) {
      return (view.raw.opportunities || [])
        .filter(function (opp) {
          const account = view.accountsById[opp.accountId];
          return !opp.closed && account && account.partnerId === partnerId;
        })
        .sort(function (a, b) { return (a.closeDate || "9999").localeCompare(b.closeDate || "9999") || a.name.localeCompare(b.name); })
        .slice(0, limit)
        .map(function (opp) { return opportunitySuggestion(view, opp); });
    }
    const matches = [];
    (view.raw.opportunities || []).forEach(function (opp) {
      const name = fold(opp.name);
      if (name.indexOf(query) === -1) return;
      const account = view.accountsById[opp.accountId];
      matches.push({ item: opportunitySuggestion(view, opp), mine: !!(account && account.partnerId === partnerId), starts: name.indexOf(query) === 0, open: !opp.closed ? 0 : 1 });
    });
    (view.raw.accounts || []).forEach(function (account) {
      const name = fold(account.name);
      if (name.indexOf(query) === -1) return;
      matches.push({ item: accountSuggestion(view, account), mine: account.partnerId === partnerId, starts: name.indexOf(query) === 0, open: 0 });
    });
    matches.sort(function (a, b) {
      if (a.mine !== b.mine) return a.mine ? -1 : 1;
      if (a.starts !== b.starts) return a.starts ? -1 : 1;
      if (a.open !== b.open) return a.open - b.open;
      return a.item.name.localeCompare(b.item.name);
    });
    return matches.slice(0, limit).map(function (match) { return match.item; });
  }

  function roleBadge(view, contactId, opportunityId) {
    const roles = view.rolesByContact[contactId] || [];
    const here = roles.filter(function (role) { return opportunityId && role.opportunityId === opportunityId; });
    const primary = here.filter(function (role) { return role.primary; });
    if (primary.length) {
      const names = here.map(function (role) { return role.role; }).filter(Boolean);
      return { group: 0, text: "Primary contact on this opportunity" + (names.length ? ": " + names.join(", ") : "") };
    }
    if (here.length) return { group: 1, text: "Contact role on this opportunity" };
    if (roles.length) return { group: 2, text: "Contact role on another opportunity here" };
    return { group: 3, text: "" };
  }

  function contactsFor(view, accountId, opportunityId, typed, limit) {
    limit = limit || 200;
    const query = fold(typed);
    const all = (view.contactsByAccount[accountId] || []).map(function (contact) {
      const badge = roleBadge(view, contact.id, opportunityId);
      let group = badge.group;
      if (group === 3 && String(contact.title || "").trim()) group = 3;
      else if (group === 3) group = 4;
      return { contact: contact, badge: badge.text, group: group };
    });
    const filtered = all.filter(function (row) {
      if (!query) return true;
      return fold(row.contact.name + " " + row.contact.title + " " + row.contact.email).indexOf(query) !== -1;
    });
    filtered.sort(function (a, b) {
      if (a.group !== b.group) return a.group - b.group;
      return a.contact.name.localeCompare(b.contact.name);
    });
    return { rows: filtered.slice(0, limit), total: filtered.length };
  }

  function accountByName(view, name) {
    return view.accountsByName[fold(name)] || null;
  }

  function linkedAccount(view, account) {
    if (!view || !account) return null;
    const id = account.salesforce && account.salesforce.accountId;
    if (id && view.accountsById[id]) return view.accountsById[id];
    return accountByName(view, account.accountName);
  }

  function linkedOpportunity(view, account) {
    if (!view || !account) return null;
    const id = account.salesforce && account.salesforce.opportunityId;
    return (id && view.opportunitiesById[id]) || null;
  }

  function chips(view, account, activityItem, todayDate) {
    const sfAccount = linkedAccount(view, account);
    if (!sfAccount) return [];
    const opp = linkedOpportunity(view, account);
    const out = [];
    if (opp && opp.stage) out.push({ label: "Stage", value: opp.stage, button: true, className: "chip-stage", recordId: opp.id });
    const owner = (opp && opp.owner) || sfAccount.owner;
    if (owner) out.push({ label: "Owner", value: owner });
    let last = sfAccount.lastActivity || "";
    if (activityItem && activityItem.date && activityItem.date > last) last = activityItem.date;
    if (last) {
      const d = dates();
      out.push({ label: "Last activity", value: d.relative(last, todayDate), title: d.longDate(d.parse(last)) });
    }
    return out;
  }

  function timeLabel(isoValue) {
    const parsed = isoValue ? new Date(isoValue) : null;
    if (!parsed || isNaN(parsed.getTime())) return "";
    let hour = parsed.getHours();
    const minute = String(parsed.getMinutes()).padStart(2, "0");
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return hour + ":" + minute + " " + suffix;
  }

  function copyStamp(isoValue, todayDate) {
    const parsed = isoValue ? new Date(isoValue) : null;
    if (!parsed || isNaN(parsed.getTime())) return "";
    const d = dates();
    const sameDay = todayDate && d.iso(parsed) === d.iso(todayDate);
    const day = sameDay ? "today" : d.shortDate(parsed, todayDate);
    return day + " at " + timeLabel(isoValue);
  }

  function statusLine(status, busy, index, todayDate) {
    const state = status && status.state;
    if (busy || state === "running") return { text: "Refreshing from Salesforce\u2026", action: "" };
    if (state === "signin") return { text: "Your Salesforce sign-in expired.", action: "signin" };
    const synced = index && index.syncedAt ? copyStamp(index.syncedAt, todayDate) : "";
    if (state === "error") {
      const reason = (status.message || "unknown error").replace(/\.$/, "");
      const tail = synced ? " Showing the copy from " + synced + "." : "";
      return { text: "The last refresh failed (" + reason + ")." + tail, action: "refresh" };
    }
    if (synced) return { text: "Copied from Salesforce " + synced + ".", action: "refresh" };
    return { text: "No Salesforce copy yet.", action: index ? "refresh" : "" };
  }

  const KEY_FIELDS = {
    Contact: ["Name", "Title", "LinkedIn", "Account", "Email", "Phone", "Mobile", "Department", "Owner"],
    Account: ["Name", "Website", "Industry", "Employees", "Owner"],
    Opportunity: ["Name", "Account", "Stage", "Close Date", "Amount", "Next Step", "Owner"]
  };

  function isEmptyValue(field, value) {
    if (value === null || value === undefined || value === "") return true;
    if (field.type === "boolean" && value === false) return true;
    return false;
  }

  function stripHtml(html) {
    return String(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function formatValue(field, value, record) {
    if (isEmptyValue(field, value)) return { text: "", link: "" };
    const d = dates();
    switch (field.type) {
      case "boolean":
        return { text: "Yes", link: "" };
      case "date": {
        const parsed = d.parse(String(value).slice(0, 10));
        return { text: parsed ? d.longDate(parsed) : String(value), link: "" };
      }
      case "datetime": {
        const parsed = new Date(value);
        if (isNaN(parsed.getTime())) return { text: String(value), link: "" };
        return { text: d.longDate(parsed) + " " + timeLabel(value), link: "" };
      }
      case "currency": {
        const code = record && record.CurrencyIsoCode ? String(record.CurrencyIsoCode) : "USD";
        try {
          return { text: new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(Number(value)), link: "" };
        } catch (err) {
          return { text: code + " " + Number(value).toLocaleString("en-US"), link: "" };
        }
      }
      case "percent":
        return { text: Number(value).toLocaleString("en-US") + "%", link: "" };
      case "double":
      case "int":
      case "long":
        return { text: Number(value).toLocaleString("en-US"), link: "" };
      case "reference": {
        const related = field.relationshipName && record ? record[field.relationshipName + ".Name"] : "";
        return { text: related || String(value), link: "" };
      }
      case "url":
        return { text: String(value), link: /^https?:\/\//i.test(String(value)) ? String(value) : "https://" + String(value) };
      case "email":
        return { text: String(value), link: "mailto:" + String(value) };
      default:
        if (field.html) return { text: stripHtml(value), link: "" };
        return { text: String(value), link: "" };
    }
  }

  function fieldRows(object, fields, record) {
    const keys = KEY_FIELDS[object] || [];
    const rows = (fields || [])
      .filter(function (field) { return field.name !== "Id" && !/^(IsDeleted|SystemModstamp)$/.test(field.name); })
      .map(function (field) {
        const value = record ? record[field.name] : null;
        const formatted = formatValue(field, value, record);
        // Lookups are labeled "Account ID" in Salesforce; the dialog shows the related name.
        const label = field.type === "reference" ? (field.label || field.name).replace(/ ID$/i, "") : (field.label || field.name);
        const keyIndex = keys.findIndex(function (key) {
          return fold(key) === fold(label) || fold(key) === fold(field.name) || fold(key) === fold(field.name.replace(/Id$/, ""));
        });
        return { name: field.name, label: label, text: formatted.text, link: formatted.link, empty: formatted.text === "", keyIndex: keyIndex === -1 ? 999 : keyIndex };
      });
    rows.sort(function (a, b) {
      if (a.keyIndex !== b.keyIndex) return a.keyIndex - b.keyIndex;
      return a.label.localeCompare(b.label);
    });
    return rows;
  }

  function subtitle(object, record, view) {
    if (!record) return "";
    if (object === "Contact") {
      return [record.Title, record["Account.Name"]].filter(Boolean).join(" \u00b7 ");
    }
    if (object === "Opportunity") {
      return [record["Account.Name"], record.StageName].filter(Boolean).join(" \u00b7 ");
    }
    if (object === "Account") {
      return [record.Industry, record.Website].filter(Boolean).join(" \u00b7 ");
    }
    return "";
  }

  return {
    fold: fold,
    build: build,
    suggestions: suggestions,
    contactsFor: contactsFor,
    roleBadge: roleBadge,
    accountByName: accountByName,
    linkedAccount: linkedAccount,
    linkedOpportunity: linkedOpportunity,
    chips: chips,
    statusLine: statusLine,
    copyStamp: copyStamp,
    formatValue: formatValue,
    fieldRows: fieldRows,
    subtitle: subtitle,
    KEY_FIELDS: KEY_FIELDS
  };
});
