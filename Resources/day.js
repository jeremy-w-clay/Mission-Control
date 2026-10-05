(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Day = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function initials(name) {
    const words = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }

  function hasAccount(account) {
    if (!account) return false;
    if (String(account.accountName || "").trim()) return true;
    return !!(account.salesforce && account.salesforce.accountId);
  }

  function arrow() {
    const node = el("span", "arrow", "→");
    return node;
  }

  function renderInvite() {
    const button = el("button", "invite");
    button.type = "button";
    button.appendChild(document.createTextNode("Pick today\u2019s account "));
    button.appendChild(arrow());
    return button;
  }

  function renderQuiet(options) {
    const row = el("div", "quiet");
    const notes = el("button", "quiet-button notes-button");
    notes.type = "button";
    const ring = el("span", "ring" + (options.notesFilled ? " filled" : ""));
    notes.appendChild(ring);
    notes.appendChild(document.createTextNode("Notes"));
    row.appendChild(notes);

    const call = el("button", "quiet-button call-button");
    call.type = "button";
    if (!options.columnCall) call.textContent = "+ Add call";
    else if (!options.chipIsMine) call.textContent = "Call \u00b7 " + options.columnCallLabel;
    else return notesFilledOnly(row, notes);
    row.appendChild(call);
    return row;
  }

  function notesFilledOnly(row, notes) {
    if (!row.childElementCount) row.appendChild(notes);
    return row;
  }

  function renderChip(label, value, extra) {
    const chip = el(extra.button ? "button" : "div", "chip" + (extra.className ? " " + extra.className : ""));
    if (extra.button) chip.type = "button";
    if (extra.title) chip.title = extra.title;
    chip.appendChild(el("span", "chip-label", label));
    chip.appendChild(el("span", "chip-value", value));
    return chip;
  }

  function renderHero(account, options) {
    const wrap = el("div", "hero");
    if (!hasAccount(account)) {
      wrap.appendChild(renderInvite());
      if (options.notesFilled || options.columnCall) {
        wrap.appendChild(renderQuiet(Object.assign({}, options, { chipIsMine: false })));
      }
      return wrap;
    }

    const card = el("article", "hero-card");
    const top = el("div", "hero-top");
    const mark = el("div", "monogram", initials(account.accountName));
    top.appendChild(mark);

    const id = el("div", "hero-id");
    const title = options.linked
      ? el("button", "account-title account-link")
      : el("h3", "account-title");
    if (options.linked) title.type = "button";
    title.textContent = account.accountName;
    id.appendChild(title);
    if (options.opportunity && options.opportunity !== account.accountName) {
      id.appendChild(el("p", "opportunity-name", options.opportunity));
    }
    top.appendChild(id);

    const actions = el("div", "hover-actions");
    const change = el("button", "text-button change-account", "Change");
    change.type = "button";
    const clear = el("button", "text-button clear-account", "Clear");
    clear.type = "button";
    actions.appendChild(change);
    actions.appendChild(clear);
    top.appendChild(actions);
    card.appendChild(top);

    if (options.chips && options.chips.length) {
      const chips = el("div", "chips");
      options.chips.forEach(function (chip) { chips.appendChild(renderChip(chip.label, chip.value, chip)); });
      card.appendChild(chips);
    }
    card.appendChild(renderQuiet(options));
    wrap.appendChild(card);
    return wrap;
  }

  function gripIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 10 16");
    svg.setAttribute("width", "10");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    [[2, 2], [8, 2], [2, 8], [8, 8], [2, 14], [8, 14]].forEach(function (point) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", point[0]);
      dot.setAttribute("cy", point[1]);
      dot.setAttribute("r", "1.2");
      svg.appendChild(dot);
    });
    return svg;
  }

  function linkedinIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "15");
    svg.setAttribute("height", "15");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", "M4.7 3.3a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM3.2 8.5h3V20.7h-3zM10 8.5h2.9v1.7h.1c.4-.8 1.4-1.7 2.9-1.7 3.1 0 3.7 2 3.7 4.7v7.5h-3v-6.6c0-1.6 0-3.6-2.2-3.6s-2.5 1.7-2.5 3.5v6.7H10z");
    svg.appendChild(path);
    return svg;
  }

  function renderCard(prospect, options) {
    const slot = el("div", "card-slot" + (options.entering ? " is-entering" : ""));
    const card = el("article", "card" + (options.entering ? " is-new" : ""));
    card.setAttribute("data-index", String(options.index));

    const tools = el("div", "card-tools");
    if (prospect.salesforceId) {
      const details = el("button", "tool details-button", "Details");
      details.type = "button";
      tools.appendChild(details);
    }
    const grip = el("button", "tool grip");
    grip.type = "button";
    grip.setAttribute("aria-label", "Move " + (prospect.name || "prospect"));
    grip.appendChild(gripIcon());
    const remove = el("button", "tool remove-card", "\u00d7");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove prospect");
    tools.appendChild(grip);
    tools.appendChild(remove);
    card.appendChild(tools);

    const head = el("div", "card-head");
    const avatar = el("div", "avatar", initials(prospect.name));
    if (!prospect.name) avatar.classList.add("blank");
    head.appendChild(avatar);
    const identity = el("div", "identity");
    const nameRow = el("div", "name-row");
    const name = el("div", "name");
    name.contentEditable = "true";
    name.spellcheck = false;
    name.textContent = prospect.name || "";
    name.setAttribute("role", "textbox");
    name.setAttribute("aria-label", "Name");
    if (prospect.salesforceId) name.dataset.linkedName = prospect.name || "";
    nameRow.appendChild(name);
    if (prospect.linkedinUrl) {
      const link = el("a", "linkedin");
      link.href = prospect.linkedinUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.setAttribute("aria-label", "LinkedIn");
      link.appendChild(linkedinIcon());
      nameRow.appendChild(link);
    }
    identity.appendChild(nameRow);
    const title = el("div", "job");
    title.contentEditable = "true";
    title.spellcheck = false;
    title.textContent = prospect.title || "";
    title.setAttribute("role", "textbox");
    title.setAttribute("aria-label", "Title");
    title.dataset.placeholder = "Add title";
    if (!String(prospect.title || "").trim()) title.dataset.empty = "1";
    identity.appendChild(title);
    head.appendChild(identity);
    card.appendChild(head);

    options.notes.forEach(function (note) {
      const block = el("div", "note");
      block.appendChild(el("span", "pill", note.label));
      const body = el("div", "note-body");
      body.contentEditable = "true";
      body.dataset.note = note.key;
      body.dataset.placeholder = "Add a note";
      body.setAttribute("role", "textbox");
      body.setAttribute("aria-label", note.label);
      const html = prospect[note.key] || "";
      if (html) body.innerHTML = html;
      if (!body.textContent.trim()) body.dataset.empty = "1";
      block.appendChild(body);
      card.appendChild(block);
    });

    slot.appendChild(card);
    return slot;
  }

  function renderAddCard() {
    const button = el("button", "add-card", "+ Add prospect");
    button.type = "button";
    return button;
  }

  function animateOut(slot, done) {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!slot || reduce) {
      done();
      return;
    }
    const height = slot.getBoundingClientRect().height;
    slot.style.height = height + "px";
    slot.classList.add("is-leaving");
    slot.getBoundingClientRect();
    slot.style.height = "0px";
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      done();
    }
    slot.addEventListener("transitionend", finish);
    window.setTimeout(finish, 320);
  }

  return {
    el: el,
    initials: initials,
    hasAccount: hasAccount,
    renderInvite: renderInvite,
    renderHero: renderHero,
    renderCard: renderCard,
    renderAddCard: renderAddCard,
    animateOut: animateOut
  };
});
