# Mission Control: Cursor build prompt

> **How to use this.** You need a Mac on macOS 13 or later. Make an empty folder and open it in Cursor. Fill in the blanks under "My details" (the values already filled in are Jenna's defaults, so keep or change them). Then put this file in the folder and type "Build the app described in @Mission-Control-Cursor-Prompt.md" in a new Agent chat (or paste everything from "Prompt" down into the chat). It builds a Mac app that works like Jenna's Mission Control, with your own name, partners, contact notes and Salesforce scope. It checks in with you before it starts, and again when it needs your Salesforce sign-in.

---

## Prompt

Build me a personal Mac app called "<MY_NAME>'s Mission Control" in this empty folder. I'm a sales development rep. Every day I pick one target account for each of my GTM partners, find the right people there, take notes on them, and hand a summary to the partner. The app organizes that work by day, week and month, keeps a running list of every account I've worked, and reads from a local copy of our Salesforce data.

This is a rebuild of an app a teammate already uses every day, so the behavior, wording and design below are settled. Follow them exactly, using my details wherever this prompt refers to them by name. Where the prompt quotes on-screen text, a format or a value, use it verbatim.

### My details

```text
MY_NAME:               Jeremy's   (the app is titled "<MY_NAME>'s Mission Control")
MY_SALESFORCE_NAME:    Jeremy White   (exactly as on my Salesforce user record)
SALESFORCE_URL:        https://clay.my.salesforce.com/lightning/r/User/005a700000JYncrAAD/view.com  (from the browser address bar, up to ".com")

PARTNER_1:             ____________   Salesforce name: Sabrina Glaser
PARTNER_2:             ____________   Salesforce name: Joe Gordon
PARTNER_3:             ____________   Salesforce name: ____________

CONTACT_NOTE_1:        Top Level      (first note on each contact card; its first paragraph goes into Copy)
CONTACT_NOTE_2:        Likely Needs   (second note on each contact card)
DAILY_TARGET:          5              (prospects per partner per day; a goal, not a limit)
LINE_LEVEL:            Director       (this level and more senior sit above the line)
REFRESH_TIME:          7:00 AM        (daily Salesforce refresh)

ACCOUNT_SDR_FIELD:     ClayDR__c               (Account field that holds the SDR's Salesforce user)
ACCOUNT_PARTNER_FIELD: GTME__c                 (Account field that holds the GTM partner's Salesforce user)
OPPORTUNITY_SDR_FIELD: Opportunity_ClayDR__c   (Opportunity field that holds the SDR's Salesforce user)
```

- Each partner's id is the first word of their name in lowercase (for example "Ava" becomes `ava`). Use ids for storage keys and CSS classes, and display names on screen.
- Partner colors go in order: partner 1 pine (`#1e4a38`, tint `#e4ede7`, ink `#163829`), partner 2 terracotta (`#8a4b30`, tint `#f4e7df`, ink `#6b3822`), partner 3 slate (`#2a3b52`, tint `#e3e8ef`, ink `#1e2b3d`). "Tint" is a very soft fill and "ink" is a darker shade that's safe for text.
- The layout is built for three partners. If I listed two or four, use that many equal-width columns, and give a fourth partner a muted plum in the same style.
- The two contact notes are stored under camelCase keys made from their labels ("Top Level" becomes `topLevel`).

### Ground rules

- Before writing any code, restate my details and your plan (the steps under "Build order"), and wait for my OK. Then work through the steps in order. After each one, run the tests, commit, tell me in two lines what to try, and keep going unless you need something from me.
- If `swiftc` is missing, ask me to run `xcode-select --install`.
- No third-party dependencies: no npm packages, Swift packages or pip installs. Use only what ships with macOS, plus the Salesforce CLI. Ask before adding anything else.
- No network access except through the Salesforce CLI. No web fonts, no logo downloads, no analytics.
- Never read, print or log Salesforce access tokens or other credential output. Don't run `sf org display` or open the CLI's auth files. Only use the CLI's data commands (`sf data query`, `sf sobject describe`) with `--json`, plus `sf org login web` to sign in.
- My data matters. Never delete or rewrite `store.json` except through the app's normal save. Back it up before installing a new build. Test against a demo data folder (`ORGANIZER_SUPPORT_DIR`), never my real one.
- Respect the macOS Reduce Motion setting for every animation.
- Write plain, readable code: small modules, clear names, and comments only where the code can't explain itself.

### Architecture

- **Native shell:** a single Swift file, `Sources/main.swift`, compiled with `swiftc` (no Xcode project) against AppKit, WebKit and SQLite3. It draws the window and title bar and hosts a WKWebView that loads `Resources/index.html` from the app bundle.
- **UI:** plain HTML, CSS and JavaScript, with no framework, bundler or build step. Each JS file is a small UMD-style module. It sets a global in the page and also uses `module.exports`, so the logic can be unit-tested with Node.
- **Salesforce:** the Salesforce CLI (`sf`), plus one Python 3 script that uses only the standard library and runs with `/usr/bin/python3`.
- **Files:**
  - `Sources/main.swift`: window, native title bar and tabs, JS bridge, file reads and writes, and launching the Salesforce script.
  - `Resources/index.html`, `tokens.css` (design tokens) and `styles.css`.
  - `Resources/config.js`: every personal value from "My details" (app title, partners with ids, names and colors, contact note labels and keys, daily target, line level and rank). Nothing personal is hard-coded anywhere else.
  - `Resources/dates.js`: date math and labels.
  - `Resources/events.js`: the Important Events data source.
  - `Resources/seniority.js`: converts a job title to a seniority rank.
  - `Resources/model.js`: store shape, loading and cleanup, prospects, Copy text, week logic and Running Account List logic.
  - `Resources/salesforce.js`: read-only search over the local Salesforce index.
  - `Resources/day.js`: Day view building blocks (hero, follow-up band, contact card, the line, add card, account row, motion helpers).
  - `Resources/app.js`: app state, rendering of every view, dialogs and bridge calls.
  - `Resources/salesforce_sync.py`: copies Salesforce to disk and does live activity lookups.
  - `scripts/build.sh`, `scripts/install-daily-refresh.sh`, `scripts/logic.test.js`, `scripts/sync_test.py`, `scripts/make-demo.js`, `scripts/snapshot.sh`, `Info.plist` and `.gitignore` (ignore `Organizer.app` and `.snapshots/`).
- **Build:** `scripts/build.sh` produces `Organizer.app`, with `Contents/MacOS/Organizer`, the resources, and an `Info.plist` (bundle name "Organizer", bundle id `local.desktop.organizer`, minimum macOS 13). It then ad-hoc signs the app (`codesign --force --deep --sign -`).
- **Install location:** `~/Organizer/Organizer.app`.
- **Data folder:** `~/Library/Application Support/DesktopOrganizer/`, holding `store.json` and the Salesforce files. The `ORGANIZER_SUPPORT_DIR` environment variable overrides it for testing (both the app and the Python script honor it).

### Native shell (`Sources/main.swift`)

- **Window:** 1180×800, minimum 1080×620, centered. It's titled, closable, minimizable and resizable, with a full-size content view, hidden title text and a transparent title bar. Its background is the paper color and its title is the app title.
- **Title bar:** a custom view across the top, 92 pt tall, on the paper background, with a hairline separator along its bottom edge. It contains:
  - The app title, centered near the top, in Iowan Old Style 22 pt, regular weight (not bold), ink color.
  - Below it, a centered row of four borderless tab buttons in Iowan Old Style 16 pt with monospaced, lining numerals: Day, Week, Month and Running Account List.
    - The labels come from the real date: "October 5th", "Oct 5 - 9" (or "Sep 28 - Oct 2" when the week spans two months; weeks run Monday to Friday), "October", and "Running Account List".
    - The selected tab is ink-colored and underlined in the accent green; the others are muted.
  - A small status label at the right edge (11 pt medium, uppercase, muted) reading "SAVED" or "COPIED", or "COULD NOT SAVE" in red (`#8a3030`).
- **Title bar behavior:** pressing anywhere on the bar outside a tab drags the window and never switches tabs. Double-clicking zooms the window. Clicking a tab switches the view.
- The Left and Right arrow keys cycle through the tabs when no text field has focus and no dialog is open.
- Use the same paper, ink, muted and accent colors as `tokens.css`. Get the app title from `config.js` over the bridge (a `config` message sent at load), so changing names never needs a Swift edit.
- **Menus:** an app menu with Quit (⌘Q), and an Edit menu with Undo, Redo, Cut, Copy, Paste and Select All, so editing shortcuts work in the web view.
- **Boot:**
  - Read `store.json`. If it doesn't parse, move it aside as `store.bad-<unix time>.json` and start empty.
  - Inject the raw store as base64 (`window.__ORGANIZER_STORE_B64`) in a user script at document start, and add the class `native-shell` to `<html>`.
  - Use a non-persistent website data store.
  - When `index.html` is opened in a plain browser with no bridge, show an HTML version of the title bar and save to `localStorage` instead. The native shell hides that HTML title bar.
- **Links:** any link click or `target=_blank` link opens in the default browser, never inside the app.
- **JS bridge:** a `WKScriptMessageHandler` named `organizer`. Messages are `{op, ...}`:
  - `save {store}`: write `store.json` atomically (pretty-printed, sorted keys) on a background queue. If the write fails, call `Organizer.markSaveFailed()`.
  - `tabs {active, day, week, month, archive}`: restyle the native tabs.
  - `copy {text}`: put plain text on the pasteboard.
  - `status {text, failed}`: update the status label.
  - `config {appTitle}`: set the title label and the window title.
  - `salesforce:refresh`, `salesforce:signin`, `salesforce:record {object, id}` and `salesforce:activity {contacts, accounts, after}`, described under Salesforce.
- **Native to page calls:** base64 JSON passed through `evaluateJavaScript` to these page functions: `Organizer.receiveSalesforceIndex`, `receiveSalesforceStatus(b64, busy)`, `receiveSalesforceRecord`, `receiveSalesforceActivity(b64, ok)`, `setView` and `markSaveFailed`.
- **Salesforce data push:** on page load, and whenever the app becomes active, send the Salesforce index (only if the file changed since it was last sent) and the status.
- **Catch-up refresh:** when the app becomes active and the index is more than 20 hours old, start a refresh. Skip it if the status is "signin", is "running" and started within the last 30 minutes, or is "error" and finished within the last 30 minutes.
- **Closing:** closing the window waits for pending writes to finish, and the app quits when its last window closes.
- **Dev-only snapshot hook:** this does nothing in normal launches. When `ORGANIZER_SNAPSHOT_DIR` and `ORGANIZER_SNAPSHOT_STEPS` (a JSON list of `{name, js, wait}`) are both set:
  - After load, run each step's JS, wait, and save a PNG of the web view (`WKWebView.takeSnapshot`) to that folder.
  - A `debug {text}` message prints `CHECK <text>` to stderr.
  - Use this together with `ORGANIZER_SUPPORT_DIR` pointing at demo data to check your UI work visually.

### Data (`store.json`)

```json
{
  "version": 1,
  "days": {
    "2026-10-05": {
      "date": "2026-10-05",
      "accounts": {
        "<partner id>": {
          "accountName": "",
          "salesforce": null,
          "upcomingCall": null,
          "notes": "",
          "prospects": [
            { "name": "", "title": "", "linkedinUrl": "", "salesforceId": "", "topLevel": "", "likelyNeeds": "", "placement": "" }
          ]
        }
      }
    }
  },
  "months": {
    "2026-10": { "month": "2026-10", "events": [ { "id": "uuid", "title": "", "date": "", "tasks": [ { "id": "uuid", "text": "", "done": false } ] } ] }
  },
  "addedAccounts": {
    "<partner id>": [ { "id": "uuid", "name": "", "salesforce": null, "addedOn": "2026-10-05" } ]
  }
}
```

- **Field shapes:**
  - `salesforce` is `null` or `{ "accountId": "", "opportunityId": "" }`.
  - `upcomingCall` is `null` or `{ "date": "YYYY-MM-DD", "time": "HH:MM", "attendees": [ { "name": "", "title": "" } ] }`.
  - Account notes and the two contact notes are sanitized HTML.
  - `placement` is `"above"`, `"below"` or `""` (see "The line").
- **Loading and cleanup:**
  - Rebuild the store from known keys only, and fill in defaults for anything missing or malformed.
  - Ignore keys that aren't valid dates (YYYY-MM-DD) or months (YYYY-MM).
  - Keep at least DAILY_TARGET prospect slots per column: pad with empty slots, and drop extra empty slots from the end.
  - Don't re-save at boot unless the cleanup changed something.
- **Empty and filled prospects:**
  - A prospect is empty when its name, title, LinkedIn URL and Salesforce id are all blank and both notes have no text. Empty slots are never drawn.
  - Filled prospects keep the order they were added in. Compacting moves them ahead of the empty slots without reordering them.
  - A new card takes the first empty slot, or a new slot at the end.
- **Saving:** save the whole store on every edit and show "Saved".
- **Day change:** every 30 seconds, check the date. When the day changes, re-render, because the app is often left open overnight.

### Day view

- **Header:** today's date at display size, for example "Monday, October 5" (serif, 36px).
- **Columns:** below the header, one column per partner, side by side. Each column scrolls on its own, with a hairline between columns. Every element in a column takes that partner's three colors: set `--partner`, `--partner-tint` and `--partner-ink` on the column.
- Each column contains, from top to bottom:
  1. "Target account" as a small-caps label, then the partner's display name (serif, 32px, partner ink).
  2. The account (see "Account hero").
  3. The Account Follow Up band.
  4. Prospects.
  5. A "Copy" button.

#### Account hero

- **Before an account is picked**, show only an invitation, "Pick today’s account →" (serif, 22px, partner ink). The arrow slides 4px right on hover.
  - Clicking it opens the Salesforce account picker. If there's no Salesforce copy yet, it opens a small "Account" dialog with an "Account name" field instead.
  - If the column already has notes or a call, show the quiet actions (described below) under the invitation.
- **Once an account is picked**, show a hero card (surface color, 16px radius, the ambient shadow, 16px padding):
  - A 44px rounded-square monogram showing the account's initials (serif 17px, partner ink on partner tint). Use monograms only, no logos.
  - The company name (serif, 26px). When it's linked to Salesforce, clicking the name opens the account's details. Under it, in small muted text, show the opportunity name if it differs from the account name.
  - "Change" and "Clear" text buttons in the top-right corner, shown only on hover or focus.
  - A row of rounded chips (partner tint, a small-caps label at 72% opacity, and the value in medium weight, cut off with an ellipsis if too long). Hide any chip that has no value:
    - **Stage:** the linked opportunity's stage. Clicking it opens the opportunity's details.
    - **Owner:** the opportunity owner, otherwise the account owner.
    - **Last activity:** relative time ("today", "yesterday", "3d ago", "2w ago", "4mo ago", "1y ago"), taken from the newer of the account's `LastActivityDate` and its latest live activity. The full date shows as a tooltip.
    - **Call or Calls:** the soonest call logged for this account (matched by Salesforce account, or by name) in any day's column, dated today or later. It reads "Tue, Oct 6 · 2:30 PM", or "2 · next Tue, Oct 6 · 2:30 PM" when there are several. Clicking it opens that call.
  - Quiet actions, in small muted text that turns partner ink on hover:
    - "Notes" opens the notes writing space. It has a small ring in front of it that fills with the partner color once the notes have text.
    - "+ Add call" when there's no call, or "Call · Tue, Oct 6 · 2:30 PM" when this column's call isn't already shown as a chip.
- An account typed by hand (not linked) still gets its chips when its name matches a Salesforce account exactly, ignoring case and accents.

#### Account Follow Up

- A slim band under the hero for following up on the account I worked in this column exactly 7 days ago. It appears in the Day view only.
- **If the column was empty that day**, show a single quiet, faint line that can't be clicked: "↺ Nothing from last Monday" (using the weekday of the date 7 days ago).
- **Otherwise, show a band** (partner tint at 62% opacity, 14px radius) with a one-line toggle and a chevron at the right: "↺ Last Monday: Acme · 3 new activities".
  - The count is the number of Salesforce activities logged on that day's contacts on any later day. It shows "checking activity…" while loading and "no new activity" when the count is zero.
  - Clicking the toggle expands the band with a smooth height animation (CSS grid rows going from 0fr to 1fr, plus a fade) and turns the chevron 180°.
  - Remember whether each column's band is open or closed for the rest of the session.
- **Expanded content:**
  - The account's latest activity: "Latest: Email with Jane Doe · <subject> · Mon, Sep 28 · <owner>".
  - That day's contacts, numbered, in seniority order (see "The line"). For each contact, show:
    - The name, as a LinkedIn link when there's a URL.
    - A "Details" button, when the contact is matched to a Salesforce contact.
    - The title.
    - The contact's latest activity: "<label> · <subject> · <date> · <owner>".

    Activity subjects link to the Salesforce record.
  - "Account details" and "Refresh" text buttons. "Refresh" reads "Checking…" while it runs.
- **Activity labels:**
  - Events are "Meeting".
  - Tasks are "Email" (the Email and ListEmail subtypes), "Call", "Cadence step", or "LinkedIn" (the LinkedIn subtype, or "linkedin" in the subject). Any other task uses its Type, falling back to "Task".
  - Strip leading tags like "[Gong Out]" from subjects, and keep the full subject as a tooltip.
  - Dates look like "Mon, Sep 28", with the year added when it isn't the current year.
- **Matching:** match contacts by their stored Salesforce id. If there's none, use a loose name match at that account ("Graham M" matches "Graham M.").
- **Status messages:** "Checking Salesforce activity…", "Couldn’t load Salesforce activity.", "No activity in Salesforce yet." and "Not found in the Salesforce copy.". For an account that isn't linked, show "This account isn’t in the Salesforce copy."
- **Lookup timing:** look up activity live only for these follow-up contacts and accounts (see "Activity lookups"). Look again only when the cached result is over an hour old or was counted against a different day. Never ask about the same record twice within 10 minutes.

#### Prospects

- **Header row:**
  - "Prospects" as a small-caps label.
  - A count like "3/5", with DAILY_TARGET as the denominator, in muted tabular numerals that turn partner ink and semibold once the target is met.
  - A "Choose from Salesforce" text button at the right, when a Salesforce copy exists.
- **Card stack:** the contact cards, 12px apart and split by the dotted line, then a "+ Add prospect" card at the bottom.
  - The add card is a dashed ghost card (1.5px dashed border, 16px radius, muted text) that tints with the partner color on hover.
  - The target is a goal, not a limit, so the add card always shows.
- **Adding a card:** "+ Add prospect" adds a blank card at the bottom and puts the cursor in its name.
  - Only one blank card exists at a time.
  - If you leave a card while it's still empty, it collapses away.
- No empty slots are ever drawn. With no prospects, the section shows just the header, "0/5" and the add card.

#### Contact card

- **Style:** surface color, 16px radius, a very soft shadow that deepens on hover, 14px padding, and no borders or dividers inside.
- **Controls:** hover-only controls in the top-right corner:
  - "Details", only when the card is linked to a Salesforce contact. It opens every field.
  - A drag handle (a six-dot grip).
  - A remove button (×). Removing fades the card out and closes the gap smoothly.
- **Head:**
  - A 32px circular avatar showing the initials in the partner color (a blank tinted circle until there's a name).
  - Next to it, the name in medium weight, editable in place. Enter finishes editing, and pasted text becomes plain text.
  - After the name, a small LinkedIn icon that opens their LinkedIn URL in the browser. Hide it when there's no URL. There's no visible LinkedIn URL field.
  - Under the name, the title in muted small caps, also editable in place, with the placeholder "Add title".
- **Notes:** two notes, CONTACT_NOTE_1 then CONTACT_NOTE_2, each labeled with a small pill tag (partner tint background, partner ink text, 11px semibold).
  - Each note is an inline rich-text area that grows with its content and looks like plain text at rest, with the placeholder "Add a note".
  - While editing, it shows a faint tint and a soft partner-colored focus ring.
  - While a note has focus, a small floating toolbar appears at its top-right: "•" (bullets), the four highlight swatches, "Clear" (removes the highlight), and "↗", which opens the full writing space for that note.
- **Name edits:** changing the name of a Salesforce-linked contact to a different name unlinks it. Clearing the name also clears the LinkedIn URL.
- **Saving and sorting:** everything saves as you type. Cards never move while you're typing; they re-sort when focus leaves the card.

#### The line (above and below)

- **The split:** a dotted line splits each column's contacts.
  - Contacts at LINE_LEVEL or more senior go above it. Everyone else, including anyone without a usable title, goes below.
  - Within each side, sort by seniority, most senior first. Cards with no title go to the very bottom. Ties keep the order the cards were added in.
- **Line style:** a 2px dotted rule in the partner color at 60% opacity on each side of a centered small-caps label (11.5px, semibold, partner ink) reading "↑ 3 above · 2 below ↓".
  - The tooltip is "Director and up go above the line. Drag a card across to move it." (with LINE_LEVEL's name in place of "Director").
  - Hide the line when there are no cards. When nobody is above it, it sits at the top of the list.
- **Manual override,** for when I dig in and learn more about someone: I drag a card by its handle across the line.
  - Use plain pointer events, with no library.
  - While dragging, the card lifts (a deeper shadow and 1.02 scale) and follows the pointer.
  - When the card's center crosses the line, the line turns the full partner color, and the other cards and the line slide apart to open a gap where the card will land. Dropping places the card there.
  - With the keyboard, I focus the handle and press ↑ to move the card above the line or ↓ to move it below. Focus stays on the handle.
- **Where a moved card lands:** in seniority order on its new side, so an untitled card dropped above the line sits just above it.
  - Store the override as the prospect's `placement`, but only when it differs from what the title says.
  - Editing the title clears the override, so the title decides again.
- **Animation:** re-sorting uses FLIP. Measure the cards, reorder only the ones that need to move, then slide them from their old positions. Never move the element that has focus, so typing is never interrupted.
- **Order everywhere:** use this order wherever contacts are listed: the cards, Copy, and the follow-up list. The Salesforce picker keeps its own order.
- **Seniority ranks:** use this module verbatim as `Resources/seniority.js`, except that `LINE` comes from LINE_LEVEL in `config.js`. The ranks are Director 60, Head 68, VP 75, SVP 80 and C-suite 95.

```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Seniority = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Seniority read from a job title, for sorting contacts and splitting them at the line.
  // Higher is more senior: 100 for CEOs and founders, 60 for Directors (the line), 30 for a title
  // with no level in it (Account Executive, Marketing Operations). null when there is no usable title.
  const LINE = 60;

  const PLACEHOLDER = /^(n\/?a|none|unknown|tbd|null|undefined|title|no title|not available|x+)$/i;

  // Applied in order to the cleaned-up title. A match counts and is blanked out, so longer phrases
  // ("Associate Director", "Vice President") are read before the words inside them.
  const RULES = [
    [/\bfounders? (office|associate|assistant)\b/g, null],
    [/\bhead ?hunter\b/g, null],
    [/\blead gen(eration)?\b/g, null],
    [/\bchief of staff\b/g, 60],
    [/\b(chief executive( officer)?|ceo)\b/g, 100],
    [/\b(co ?founder|founder)\b/g, 100],
    [/\bchief( \S+){1,5}? officer\b/g, 95],
    // CRO, CMO, CISO and the like, unless the title is about the function ("Head of CRO",
    // "CRO Manager", "CTO Office").
    [/(?<!\bof )\bc(oo|fo|ro|mo|to|io|iso|so|po|co|do|hro|ao|bo|go|xo|lo|no|vo|dao|aio|pto|sco|mco)\b(?!.*\b(manager|specialist|analyst|strategist|consultant|coordinator|associate|engineer|expert|optimization|testing|office|business|team)\b)/g, 95],
    [/\b(executive (vice president|vp)|evp)\b/g, 85],
    [/\b(senior (vice president|vp)|svp)\b/g, 80],
    [/\b((assistant|associate) (vice president|vp)|avp)\b/g, 70],
    [/\b(vice president|vice pres|vp|rvp|gvp)\b/g, 75],
    [/\bpresident\b/g, 98],
    [/\b(chairman|chairwoman|chairperson|chair)\b/g, 97],
    [/\b(board member|member of the board|board of directors|board director)\b/g, 90],
    [/\bmanaging director\b/g, 80],
    [/\bchief\b/g, 75],
    // Sales and client-service roles, like Account Executive.
    [/\b(account|client) director\b/g, 50],
    [/\bexecutive director\b/g, 66],
    [/\b(senior|group) director\b/g, 64],
    [/\b(associate|assistant|deputy) director\b/g, 55],
    [/\b(director|directora|directeur|directrice|direktor|diretor|diretora|direttore)\b/g, 60],
    [/\bhead\b/g, 68],
    [/\b(assistant|deputy) general manager\b/g, 50],
    [/\b(general manager|gm)\b/g, 67],
    [/\bsenior manager\b/g, 50],
    [/\bprincipal\b/g, 48],
    [/\bassistant manager\b/g, 40],
    [/\b(manager|gerente)\b/g, 45],
    [/\b(team )?(lead|leader)\b/g, 42],
    [/\bsupervisor\b/g, 40],
    [/\bsenior\b/g, 35],
    [/\b(intern|junior|jr|trainee|apprentice|assistant|coordinator|associate)\b/g, 20],
  ];

  function words(value) {
    return value
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\b(sr|snr)\b/g, "senior")
      .replace(/\bdir\b/g, "director")
      .replace(/\bmgr\b/g, "manager")
      .replace(/\bexec\b/g, "executive")
      .replace(/\basst\b/g, "assistant")
      .replace(/\bassoc\b/g, "associate")
      .trim();
  }

  function rank(title) {
    const raw = typeof title === "string" ? title.trim() : "";
    if (!/\p{L}/u.test(raw) || PLACEHOLDER.test(raw)) return null;
    // The part that names the job: "(formerly …)" and whatever follows "to the CEO", "at Acme",
    // or "Office of" is left out.
    const job = raw.toLowerCase()
      .replace(/\((formerly|former|previously)\b[^)]*\)?/g, " ")
      .replace(/['’]s\b/g, "")
      .replace(/\./g, "")
      .replace(/[&+]/g, " and ")
      .replace(/\bgo[\s-]+to[\s-]+market\b/g, "gtm")
      .replace(/\b(direct|business|end)[\s-]+to[\s-]+/g, "$1 ")
      .split(/\s(?:to|at|for)\s|@|\boffice of\b/)[0];
    let remaining = " " + words(job) + " ";
    const found = [];
    RULES.forEach(function (rule) {
      remaining = remaining.replace(rule[0], function () {
        if (rule[1] !== null) found.push(rule[1]);
        return " ";
      });
    });
    // Owners and partners only when that is the whole role, not "Product Owner" or "Partner Manager".
    job.split(/[,|/;:()\u2013\u2014]|\s-\s|\sand\s/).forEach(function (part) {
      const role = words(part);
      if (/^(co |business |part |sole )?owner$/.test(role)) found.push(98);
      else if (/^(managing|general|founding|senior|equity) partner$/.test(role)) found.push(90);
      else if (role === "partner") found.push(75);
    });
    return found.length ? Math.max.apply(null, found) : 30;
  }

  function side(seniority) {
    return seniority !== null && seniority >= LINE ? "above" : "below";
  }

  return { LINE: LINE, rank: rank, side: side };
});
```

#### Copy

- The "Copy" button at the bottom of each column (a pill with a hairline border and partner ink text that fills with the tint on hover) puts this exact plain text on the clipboard and shows "Copied" in the title bar:

```text
<Partner display name> - <Account name>
1. <Name>, <Title>, <first paragraph of CONTACT_NOTE_1>
2. <Name>, <Title>, <first paragraph of CONTACT_NOTE_1>
```

- **Numbering and parts:** people are numbered in on-screen order (above the line, then below). Leave out empty parts along with their commas. If there are no people, copy just the header line.
- **Turning the note into paragraphs:** convert the note's HTML to plain text.
  - Line breaks, and the ends of paragraphs, divs, list items and headings, each start a new line.
  - Collapse whitespace, drop empty lines and decode HTML entities.
- **Placing the paragraphs:**
  - The first paragraph goes on the numbered line.
  - Each later paragraph follows after a blank line, indented three spaces, with a blank line between paragraphs.
  - The next numbered line starts on the very next line, with no blank line before it.
- Example:

```text
Ava - Northwind Logistics
1. Dana Reyes, VP Revenue Operations, Attended the Clay Ads livestream on Sep 24

   Asked about enrichment credits
2. Sam Ortiz, Director of Marketing Ops, Downloaded the GTM engineering guide
3. Lee Park, Account Executive
```

#### Writing space (notes)

- A dialog titled "<Partner> notes" for the account notes, or "<Name> · <note label>" for a contact note.
- **Toolbar:** "Paragraph", "Bullets", four round highlight swatches (Amber `#f4e2a8`, Green `#d7ecd9`, Blue `#d5e4f7`, Rose `#f6d6da`) and "Clear color".
- **Editor:** a large editable area below the toolbar, at least 260px tall, with 14.5px text.
- **Saving and closing:** it saves on every keystroke. "Done" closes it, and so do Esc and a click on the backdrop.
- **Storage:** store sanitized HTML, removing script, iframe, object and style elements. Treat plain text as a single paragraph.
- Account notes belong to one partner column on one day.

#### Calls

- An "Add call" or "Edit call" dialog with:
  - Date (defaulting to today) and Time, side by side.
  - An "Attendees" list of rows, each with Name and Title fields and "Remove", plus "+ Add attendee".
  - "Remove call" when editing, and Cancel and Save.
- Saving with every field blank removes the call. There's one call per column per day.

### Week view

- **Caption,** in muted text: "Monday’s account name, copied from the day view." on Mondays, otherwise "Account names from the day view, Monday through <today's weekday>."
- **Columns:** one column per partner, headed by the partner's name at 22px.
- **Rows:** one row per weekday so far this week, Monday through today (the whole Monday-to-Friday week on weekends). Each row shows "Mon · Oct 5" in muted text, then that day's account name, or "—".
- **Opening a day:** account names are buttons. Clicking one opens that day's column for that partner in a detail view:
  - A "Back to week" button and the date ("Monday, Oct 5").
  - The same column as the Day view: a hero with "Pick the account →", prospects, the line, Copy, notes and calls, but no follow-up band.
  - Edits made there save to that day.

### Month view: Important Events

- **Header:** "Important Events" (serif, 32px), the month and year under it ("October 2026"), and a "+ Add event" button.
- **Empty state:** "Events you add for October appear here."
- **Add or Edit event dialog:**
  - "Title" (required).
  - "Date or range", optional free text with the placeholder "Optional, such as Oct 12 or Oct 12–14".
  - Cancel and Save, plus "Delete event" when editing.
- **Each event:**
  - Its title (serif, 22px) and its date, if it has one.
  - A task list. Each task is a row with a checkbox, an inline text field (placeholder "Task") and "Remove". Checked tasks turn muted with a strikethrough.
  - Under the list: "+ Add task" (adds a row and focuses it), "Edit" and "Delete".
- Events belong to the month they were added in and only show in that month.
- **Data source:** keep events behind a data-source interface in `events.js`.
  - A `ManualEventSource` provides `list(month)`, `addEvent`, `updateEvent`, `deleteEvent`, `addTask`, `updateTask` and `deleteTask`.
  - The Month view talks only to the source, so a calendar or task tool can replace manual entry later without touching the UI.

### Running Account List

- **Header:** "Running Account List" and the intro "Accounts from the day view move here when their week ends. Open a date to see that day’s notes."
- **Columns:** one per partner, each containing:
  - A label with the count ("No accounts yet", "1 account", "12 accounts").
  - The partner's name (32px).
  - A "+ Add account" ghost card.
  - The list.
- **What's listed:**
  - Every weekday (Monday to Friday) from finished weeks where the partner's column had anything in it: an account name, notes, a call or a contact. A week is finished once its Friday has passed.
  - Accounts I added by hand.

  There's one row per account name (ignoring case) per partner, most recently worked first.
- **Each row:**
  - A 34px monogram (partner tint, 10px radius).
  - The account name (serif, 18px). It's a button that opens the latest day it was worked, or, for a hand-added Salesforce account, its details. The detail view's back button reads "Running Account List".
  - Under the name, the dates it was worked, as small buttons separated by "·" ("Sep 28 · Oct 1", with the year when it isn't the current year). Each one opens that day.
  - Hand-added accounts also show "Added Oct 5".
  - A hover-only × removes a hand-added account that has no worked days.
- **"+ Add account" dialog:** titled "Add an account", with the hint "It goes on <Partner>’s running list."
  - A search box with the placeholder "Search accounts and opportunities", or "Account name" when there's no Salesforce copy.
  - Suggestions work like the account picker, with the partner's accounts first, plus "Use “<typed>”" (name only, not linked).
  - Enter picks the first suggestion.
  - A duplicate shows "<Name> is already on <Partner>’s list." in red.
  - The new row eases in.

### Salesforce

#### Setup (do this with me)

1. If `sf` isn't installed, install it without admin rights. Download `https://developer.salesforce.com/media/salesforce-cli/sf/channels/stable/sf-darwin-arm64.tar.xz` (or `sf-darwin-x64.tar.xz` on Intel Macs) and extract it to `~/.local/sf`, so the CLI is `~/.local/sf/bin/sf`.
2. Sign me in with `sf org login web --alias organizer --set-default`, which opens my browser.
3. Look up the Salesforce user ids for me and my partners with `sf data query --query "SELECT Id, Name FROM User WHERE Name IN (...)" --target-org organizer --json`, and show me the matches to confirm.
4. Write `salesforce-config.json` in the data folder:

```json
{
  "orgAlias": "organizer",
  "instanceUrl": "<SALESFORCE_URL>",
  "accountWhere": "<ACCOUNT_SDR_FIELD> = '<my user id>' OR <ACCOUNT_PARTNER_FIELD> IN ('<partner 1 user id>', '<partner 2 user id>', '<partner 3 user id>')",
  "opportunityWhere": "<OPPORTUNITY_SDR_FIELD> = '<my user id>'",
  "accountPartnerField": "<ACCOUNT_PARTNER_FIELD>",
  "partners": { "<partner id>": { "id": "<partner user id>", "name": "<partner Salesforce name>" } }
}
```

5. Run the first refresh and show me the record counts.
6. Install the daily refresh with `scripts/install-daily-refresh.sh`. It creates a LaunchAgent labeled `local.desktop.organizer.salesforce-sync` that runs `/usr/bin/python3 ~/Organizer/Organizer.app/Contents/Resources/salesforce_sync.py` every day at REFRESH_TIME and logs to `~/Library/Logs/Organizer/salesforce-sync.log`.

#### The copy (`salesforce_sync.py`)

- **Scope:**
  - The accounts that match `accountWhere`, with their opportunities and contacts.
  - The opportunities that match `opportunityWhere`, with their accounts and those accounts' contacts.
  - The OpportunityContactRoles for all of those opportunities, fetched in batches of 150 ids, plus any contacts those roles point to that weren't already copied.
- **Fields:** copy every field I can read.
  - Describe each object (Account, Opportunity, Contact, OpportunityContactRole), and query every field except the address, location and base64 types.
  - For lookup fields that point to User, Account, Contact, Opportunity, Lead, Campaign, RecordType, Group, Pricebook2, a custom object, or several object types, also query `<Relationship>.Name`.
- **Query size limits:** queries go out as GET requests, which Salesforce rejects past about 16 KB.
  - Split long field lists across several queries, keeping each under 9,000 URL-encoded characters and ending with `ORDER BY Id`. Merge the results by Id.
  - If a query fails with INVALID_FIELD, INVALID_TYPE or "No such column", drop the named fields (or all relationship fields, if none are named), log them, and retry.
  - Fail if Salesforce returns fewer records than `totalSize`.
  - Run the CLI with `SF_ORG_MAX_QUERY_LIMIT=5000000`.
- **Running the CLI:**
  - Look for the CLI at `$SF_CLI`, `~/.local/sf/bin/sf`, `/usr/local/bin/sf` or `/opt/homebrew/bin/sf`.
  - Every call adds `--target-org <orgAlias> --json` and times out after 300 seconds.
  - Retry network failures (connection resets, timeouts, DNS errors and similar) after 15 seconds, then after 60. Never retry sign-in errors.
- **Output:** write the results to a temp file, then swap it into place.
  - `salesforce.sqlite` has three tables:
    - `objects(name, label, fields)`, where `fields` is field metadata JSON: name, label, type, relationshipName and html.
    - `records(id, object, account_id, data)`, with an index on `account_id`. `data` is the flattened record as JSON, with relationship fields written like "Owner.Name".
    - `meta(key, value)`, holding syncedAt, instanceUrl, scope and linkedinField.
  - `salesforce-index.json` (compact) is the only Salesforce file the UI loads at startup. It contains:
    - `syncedAt`, `instanceUrl`, `linkedinField` and `partners`.
    - `accounts [{id, name, partnerId, owner}]`.
    - `opportunities [{id, name, accountId, stage, closeDate, closed, owner}]`.
    - `contacts [{id, name, title, accountId, linkedin, email}]`.
    - `roles [{opportunityId, contactId, role, primary}]`.
- **LinkedIn field:** find it automatically. It's a Contact URL or text field with "linkedin" in its name or label; skip labels that mention company, source, token or unvalidated. Prefer URL fields, then the shortest name.
- **Status file:** `salesforce-status.json` holds `{state: "running" | "ok" | "error" | "signin", startedAt, finishedAt, message, counts}`. An expired or missing sign-in becomes "signin".
- **Concurrency:** only one refresh runs at a time (enforced with a lock file). Keep the Mac awake during a refresh with `caffeinate -i -w <pid>`.
- **From the app:** "Refresh now" runs the same script. "Sign in" runs `sf org login web --alias <orgAlias> --set-default` and refreshes if sign-in succeeds. Both log to the same log file.

#### Activity lookups

- **How it runs:** the app runs `salesforce_sync.py --activity '{"contacts": [...], "accounts": [...], "after": "YYYY-MM-DD"}'`. Only one lookup runs at a time; while one is running, keep only the newest pending request.
- **Input checks:** accept only valid Salesforce ids, with at most 60 contacts and 10 accounts.
- **Queries:** run them in parallel, up to 8 at once:
  - For contacts: completed Tasks (`IsClosed = true`, newest 1,000) and past Events (`StartDateTime <= now`, newest 200), by WhoId.
  - For each account: its completed Tasks (newest 100) and its latest past Event.
- **Results:** keep the newest activity per contact and per account. For each contact, count the activities on local calendar days after `after`. Salesforce timestamps are UTC, so convert them to the Mac's time zone first.
- **Cache:** merge the results into `salesforce-activity.json`, shaped as `{contacts: {id: {fetchedAt, item, after, newCount}}, accounts: {id: {fetchedAt, item}}}`, where `item` is `{id, kind, label, subject, date, owner, who}`. Drop entries older than 30 days.

#### In the app

- **Status line** in the picker and details dialogs, in one of these states:
  - "Copied from Salesforce today at 7:02 AM." with "Refresh now".
  - "Refreshing from Salesforce…".
  - "The last refresh failed (<reason>). Showing the copy from Oct 4 at 7:01 AM." with "Refresh now".
  - "Your Salesforce sign-in expired." with "Sign in".
  - "No Salesforce copy yet."
- **Account and contact picker:** opened by "Choose from Salesforce" and by "Pick today’s account →". It has two steps in one dialog.
  1. **"Choose the account"**, with the hint "Pick the opportunity or account for the <Partner> section. Its contacts come next." and a search box ("Search accounts and opportunities").
     - With nothing typed, list that partner's open opportunities by close date.
     - While typing, match opportunity and account names, ignoring case and accents. Rank the partner's accounts first, then names that start with the typed text, then open opportunities before closed ones. Show up to 40.
     - Each suggestion shows a name and a detail line: "Opportunity · <Account> · <Stage>" or "Account · 23 contacts".
     - Also offer "Use “<typed>”", with the detail "Account name only, not linked to Salesforce".
     - Picking a suggestion links the column to that account (and opportunity) and moves to step 2.
  2. **"Contacts at <Account>"**, with "Opportunity: <name> · <stage>" (or "No opportunity picked") and a "Change" button, plus a search box ("Search by name, title, or email").
     - Each row has a checkbox, the name, the title, a role badge ("Primary contact on this opportunity: <roles>", "Contact role on this opportunity" or "Contact role on another opportunity here"), a "LinkedIn" link and "Details". "Details" shows every field inside the dialog, with a "Back to contacts" button.
     - Order: the primary contact on this opportunity, then other roles on it, then roles on other opportunities at this account, then people with titles, then everyone else. Sort alphabetically within each group.
     - Show at most 200 rows, with a note like "Showing 200 of 1,240 contacts. Search to narrow the list."
     - Footer: "3 selected · 5/5 prospects", the status line, and Cancel and "Update prospects" buttons.
  - **Updating prospects:** keep hand-typed cards, remove Salesforce cards I unchecked, and add newly checked contacts as cards (name, title, LinkedIn URL and Salesforce id). New cards ease in with a short spring and fade, 45ms apart.
- **Details dialog,** opened by any "Details" button or linked name:
  - **Header:** the record's name as the heading, with a subtitle (Contact: Title · Account; Opportunity: Account · Stage; Account: Industry · Website).
  - **Links:** "Open in Salesforce" (`<instanceUrl>/<id>`) and "LinkedIn profile".
  - **Field list:** a "Filter fields" box, a "Show empty fields (N)" toggle, then a two-column list of every field that has a value.
    - Key fields come first, then the rest by label. Contact: Name, Title, LinkedIn, Account, Email, Phone, Mobile, Department, Owner. Account: Name, Website, Industry, Employees, Owner. Opportunity: Name, Account, Stage, Close Date, Amount, Next Step, Owner.
    - Value formats: dates as "Oct 5, 2026", date-times with the time, currency in the record's currency, percents, "Yes" for checked boxes (an unchecked box counts as empty), lookups as the related record's name, URLs and emails as links, and rich text as plain text.
  - **Loading:** it loads the full record from `salesforce.sqlite` through the native side, showing "Loading every field…" meanwhile. If the record is missing, it says "This record isn’t in the Salesforce copy. It may belong to an account outside your synced accounts."

### Design

- **Feel:** warm, calm and layered. A paper background, serif display type, a clean sans-serif for UI text, muted small-caps labels, tabular numerals, one soft ambient shadow, generous spacing, no hairlines inside cards, and controls that appear on hover.
- Put these tokens in `tokens.css` and use them everywhere:

```css
:root {
  color-scheme: light;
  --paper: #f3efe8;
  --surface: #faf8f4;
  --surface-sunken: #ece6dc;
  --scrim: rgba(29, 26, 22, 0.28);
  --ink: #1d1a16;
  --text: #3b352e;
  --muted: #7a7064;
  --faint: #a69c8f;
  --hairline: rgba(58, 45, 30, 0.1);
  --accent: #1e4a38;
  --accent-soft: rgba(30, 74, 56, 0.06);
  --link: #2a3b52;
  --danger: #8a3030;
  --font-display: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif;
  --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  --size-display: 36px;
  --size-partner: 32px;
  --size-heading: 22px;
  --size-subheading: 18px;
  --size-emphasis: 15px;
  --size-body: 13.5px;
  --size-small: 12.5px;
  --size-label: 13px;
  --weight-body: 400;
  --weight-medium: 560;
  --weight-display: 500;
  --tracking-label: 0.06em;
  --tracking-display: -0.02em;
  --leading-body: 1.45;
  --radius-card: 16px;
  --radius-panel: 14px;
  --radius-control: 10px;
  --radius-pill: 999px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --shadow: 0 1px 2px rgba(58, 45, 30, 0.05), 0 12px 32px -14px rgba(58, 45, 30, 0.2);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.05);
  --shadow-card-hover: 0 1px 3px rgba(0, 0, 0, 0.05), 0 8px 24px rgba(0, 0, 0, 0.08);
  --shadow-card-lift: 0 4px 10px rgba(0, 0, 0, 0.08), 0 18px 40px rgba(0, 0, 0, 0.14);
  --dash: rgba(58, 45, 30, 0.22);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
  --duration-quick: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --ease-spring: var(--ease-out);
    --duration-quick: 0ms;
    --duration-base: 0ms;
    --duration-slow: 0ms;
  }
}
```

- **Type roles:**
  - **Display** (app title, tabs, the Day date, partner names, dialog titles, account names, Month headings): `--font-display`, weight 500, `-0.02em` tracking, lining tabular numerals.
  - **Labels:** muted, 13px, weight 500, all small caps, `0.06em` tracking.
  - **Body:** `--font-ui` at 13.5px, line height 1.45, weight 400, tabular numerals.
- **Layout:** the page itself never scrolls; each column scrolls on its own (padding 16px 24px 48px). The Day header has 24px 24px 4px padding. Below 980px wide, stack the columns.
- **Buttons:**
  - Text buttons are partner-ink (or accent) text that underlines on hover.
  - Dialog buttons are pills (6px 14px padding, hairline border). The primary button is filled accent green with light text.
  - "Remove call" and "Delete event" are red ghost buttons.
  - Focus rings are 2px in the partner color with a 2px offset.
- **Dialogs:** a scrim (`--scrim`) behind the dialog, which sits near the top (72px down).
  - 560px wide, or 720px for the picker and details dialogs.
  - Surface background, 16px radius, the ambient shadow, and 24px 24px 16px padding.
  - The heading is serif, 24px.
  - Esc and clicks on the backdrop close the dialog.
- **Picker rows:** hairline separators and a light accent wash on hover and when selected. Suggestions take the partner tint on hover, and the first one is highlighted in advance.
- **Motion:** every animation uses the tokens and is turned off under Reduce Motion.
  - New cards ease in over 260ms on the spring curve, starting 8px lower, at 97% size and transparent.
  - Removed cards collapse over 250ms.
  - The follow-up band opens over 250ms.
  - Re-sorts slide using FLIP.
  - The hero's arrow nudges on hover.

### Tests and dev tools

- **`scripts/logic.test.js`:** plain Node with `assert`, no test framework. Cover:
  - Seniority, with at least 30 titles. For example: "CRO" is 95, "SVP Sales" 80, "Head of Growth" 68, "Sr. Director, Marketing" 64, "Dir RevOps" 60, "Account Director" 50, "RevOps Leader" 42 and "Account Executive" 30. "Assistant to the CEO" is not 100, and "CRO Manager" is not C-suite. "", "N/A", "unknown" and "147" return null.
  - The line split, sorting, placement, and the reset when a title is edited.
  - The Copy format, including multi-paragraph notes and an empty column.
  - Store loading and cleanup, including old data without `placement` and junk values.
  - Week entries.
  - The Running Account List: finished weeks only, grouping, hand-added accounts and duplicates.
  - The event source.
- **`scripts/sync_test.py`:** standard library only, with no Salesforce calls. Check that split queries stay under the size limit, that relationship fields flatten correctly, that the LinkedIn field is detected, and the retry rules.
- **`scripts/make-demo.js`:** writes a demo data folder (`/tmp/organizer-demo`) with realistic fake data for today, last week and earlier weeks, including a contact with no title.
- **`scripts/snapshot.sh`:** builds the app, runs it against the demo folder with the snapshot hook, and saves screenshots to `.snapshots/`. Use it to check your UI work by looking at the screenshots.

### Build order

1. **Shell and plumbing:** the build script, window, title bar and tabs (labels, drag, double-click, arrow keys), the bridge, saving and loading, the status label and `config.js`. Check that it launches, the tabs switch, dragging never switches tabs, and an edit survives a relaunch.
2. **Day view without Salesforce:** columns, the invitation and name dialog, the hero, notes and the writing space, calls, contact cards, adding and removing cards, and Copy. Write tests for the model and the Copy format.
3. **The line:** `seniority.js`, sorting, drag and keyboard moves, placement and FLIP animation. Write tests.
4. **The other views:** the Week view with its day detail view, the Month view and the Running Account List. Write tests.
5. **Salesforce:** CLI setup with me, the config, the sync script, the index, the picker, the details dialog, the hero chips, the follow-up band and activity lookups, the status line, and the daily refresh. Write the Python tests.
6. **Polish and install:**
   - Check every screen in screenshots against demo data, and check motion with and without Reduce Motion.
   - Install to `~/Organizer/Organizer.app`: back up `store.json`, quit the running app, build, copy the app with `ditto`, then open it.
   - Walk me through the checklist below.

### Done when

- The app opens from `~/Organizer`, titled "<MY_NAME>'s Mission Control", with four tabs labeled from today's date. Dragging the title bar moves the window without switching tabs.
- An empty Day column shows only "Pick today’s account →", the quiet follow-up line, and "+ Add prospect" with "0/5".
- A full column reads as a hero with chips, a follow-up band, and a stack of clean cards split by the dotted line, most senior first, with untitled people at the bottom.
- Dragging a card across the line (or pressing ↑ or ↓ on its handle) moves it, the move survives a relaunch, and it resets when the card's title changes.
- Copy produces exactly the format above, in on-screen order.
- Week view names open past days, past weeks' accounts show in the Running Account List, and Important Events and their tasks persist per month.
- The Salesforce copy refreshes every morning and on demand, and the picker, details dialog, chips and follow-up activity all use it.
- Everything still works with Reduce Motion on, and all tests pass.
