const assert = require("assert");
const Dates = require("../Resources/dates.js");
const Config = require("../Resources/config.js");
const Model = require("../Resources/model.js");

const oct5 = new Date(2026, 9, 5);
const sep28 = new Date(2026, 8, 28);

assert.strictEqual(Dates.dayTab(oct5), "October 5th");
assert.strictEqual(Dates.weekTab(oct5), "Oct 5 - 9");
assert.strictEqual(Dates.monthTab(oct5), "October");
assert.strictEqual(Dates.weekTab(sep28), "Sep 28 - Oct 2");
assert.strictEqual(Dates.heading(oct5), "Monday, October 5");
assert.strictEqual(Dates.ordinal(1), "1st");
assert.strictEqual(Dates.ordinal(2), "2nd");
assert.strictEqual(Dates.ordinal(3), "3rd");
assert.strictEqual(Dates.ordinal(11), "11th");
assert.strictEqual(Dates.ordinal(12), "12th");
assert.strictEqual(Dates.ordinal(13), "13th");
assert.strictEqual(Dates.ordinal(21), "21st");
assert.strictEqual(Dates.tabLabels(oct5).archive, "Running Account List");

assert.strictEqual(Config.appTitle, "Jeremy's Mission Control");
assert.strictEqual(Config.partners.length, 2);
assert.strictEqual(Config.partners[0].id, "sabrina");
assert.strictEqual(Config.partners[1].id, "joe");
assert.strictEqual(Config.notes[0].key, "topLevel");
assert.strictEqual(Config.notes[1].key, "likelyNeeds");
assert.strictEqual(Config.dailyTarget, 5);
assert.strictEqual(Config.lineLevel, "Director");
assert.strictEqual(Config.lineRank, 60);

const loaded = Model.load({ version: 1, days: { "2026-10-05": { date: "2026-10-05", accounts: {} } } });
assert.strictEqual(loaded.store.version, 1);
assert.ok(loaded.store.days["2026-10-05"]);
const account = Model.ensureAccount(loaded.store, "2026-10-05", "sabrina");
account.notes = "Kept";
assert.strictEqual(loaded.store.days["2026-10-05"].accounts.sabrina.notes, "Kept");

assert.strictEqual(Model.sanitizeHtml("Hello"), "<p>Hello</p>");
assert.strictEqual(Model.sanitizeHtml("<p>Hi</p><script>alert(1)</script>"), "<p>Hi</p>");
assert.strictEqual(Model.sanitizeHtml("<p><br></p>"), "");
assert.strictEqual(Model.sanitizeHtml('  <span style="background-color: rgb(244, 226, 168)">Note</span>'), '<span style="background-color: #f4e2a8">Note</span>');
assert.deepStrictEqual(Model.paragraphs("<p>One</p><p>Two</p>"), ["One", "Two"]);
assert.deepStrictEqual(Model.paragraphs("<div>Line&amp;Co<br>Next</div>"), ["Line&Co", "Next"]);

const messy = {
  version: 1,
  extra: true,
  days: {
    nope: { date: "nope" },
    "2026-10-05": {
      date: "2026-10-05",
      accounts: {
        sabrina: {
          accountName: "Acme",
          notes: "Hello",
          junk: 1,
          prospects: [
            { name: "", title: "", linkedinUrl: "", salesforceId: "", topLevel: "", likelyNeeds: "" },
            { name: "Sam", title: "AE", linkedinUrl: "", salesforceId: "", topLevel: "", likelyNeeds: "", placement: "sideways" },
            { name: "Lee", title: "", linkedinUrl: "", salesforceId: "", topLevel: "<p>Hi</p>", likelyNeeds: "" }
          ]
        },
        nobody: { accountName: "Skip" }
      }
    }
  }
};
const cleaned = Model.load(messy);
assert.strictEqual(cleaned.changed, true);
assert.strictEqual(cleaned.store.days.nope, undefined);
assert.strictEqual(cleaned.store.days["2026-10-05"].accounts.nobody, undefined);
const prospects = cleaned.store.days["2026-10-05"].accounts.sabrina.prospects;
assert.strictEqual(prospects[0].name, "Sam");
assert.strictEqual(prospects[0].placement, "");
assert.strictEqual(prospects[1].name, "Lee");
assert.strictEqual(prospects.length, 5);
assert.ok(Model.isEmptyProspect(prospects[2]));
assert.strictEqual(cleaned.store.days["2026-10-05"].accounts.sabrina.notes, "<p>Hello</p>");
assert.strictEqual(Model.load(cleaned.store).changed, false);

const copyAccount = {
  accountName: "Northwind Logistics",
  prospects: [
    {
      name: "Dana Reyes",
      title: "VP Revenue Operations",
      topLevel: "<p>Attended the Clay Ads livestream on Sep 24</p><p>Asked about enrichment credits</p>"
    },
    { name: "Sam Ortiz", title: "Director of Marketing Ops", topLevel: "<p>Downloaded the GTM engineering guide</p>" },
    { name: "Lee Park", title: "Account Executive", topLevel: "" },
    { name: "", title: "", topLevel: "", likelyNeeds: "" }
  ]
};
assert.strictEqual(Model.copyText("Ava", copyAccount), [
  "Ava - Northwind Logistics",
  "1. Dana Reyes, VP Revenue Operations, Attended the Clay Ads livestream on Sep 24",
  "",
  "   Asked about enrichment credits",
  "2. Sam Ortiz, Director of Marketing Ops, Downloaded the GTM engineering guide",
  "3. Lee Park, Account Executive"
].join("\n"));
assert.strictEqual(Model.copyText("Sabrina Glaser", Model.blankAccount()), "Sabrina Glaser - ");
assert.strictEqual(Model.copyText("Joe Gordon", { accountName: "Acme", prospects: [{ name: "Ada", title: "", topLevel: "" }] }), "Joe Gordon - Acme\n1. Ada");

const Seniority = require("../Resources/seniority.js");
const ranks = {
  "CEO": 100,
  "Founder": 100,
  "Co-Founder": 100,
  "Chief Revenue Officer": 95,
  "CRO": 95,
  "CMO": 95,
  "SVP Sales": 80,
  "Senior Vice President": 80,
  "EVP": 85,
  "VP Revenue Operations": 75,
  "AVP": 70,
  "President": 98,
  "Chair": 97,
  "Owner": 98,
  "Partner": 75,
  "Managing Director": 80,
  "Chief of Staff": 60,
  "Head of Growth": 68,
  "Sr. Director, Marketing": 64,
  "Dir RevOps": 60,
  "Director of Marketing Ops": 60,
  "Executive Director": 66,
  "Associate Director": 55,
  "Account Director": 50,
  "General Manager": 67,
  "Senior Manager": 50,
  "Manager": 45,
  "RevOps Leader": 42,
  "Principal": 48,
  "Supervisor": 40,
  "Senior Analyst": 35,
  "Intern": 20,
  "Account Executive": 30
};
Object.keys(ranks).forEach(function (title) {
  assert.strictEqual(Seniority.rank(title), ranks[title], title);
});
assert.ok(Object.keys(ranks).length >= 30);
assert.notStrictEqual(Seniority.rank("Assistant to the CEO"), 100);
assert.notStrictEqual(Seniority.rank("CRO Manager"), 95);
assert.strictEqual(Seniority.rank("Head of CRO"), 68);
assert.strictEqual(Seniority.rank(""), null);
assert.strictEqual(Seniority.rank("N/A"), null);
assert.strictEqual(Seniority.rank("unknown"), null);
assert.strictEqual(Seniority.rank("147"), null);
assert.strictEqual(Seniority.side(60), "above");
assert.strictEqual(Seniority.side(59), "below");
assert.strictEqual(Seniority.side(null), "below");
assert.strictEqual(Seniority.LINE, Config.lineRank);

const linePeople = [
  { name: "Lee", title: "Account Executive" },
  { name: "Dana", title: "VP Revenue Operations" },
  { name: "Sam", title: "Director of Marketing Ops" },
  { name: "Pat", title: "" }
];
const ordered = Model.orderedProspects(linePeople);
assert.deepStrictEqual(ordered.above.map(function (person) { return person.name; }), ["Dana", "Sam"]);
assert.deepStrictEqual(ordered.below.map(function (person) { return person.name; }), ["Lee", "Pat"]);

const moved = { name: "Lee", title: "Account Executive", placement: "" };
Model.placeProspect(moved, "above");
assert.strictEqual(moved.placement, "above");
assert.strictEqual(Model.effectiveSide(moved), "above");
const director = { name: "Sam", title: "Director of Marketing Ops", placement: "below" };
Model.placeProspect(director, "above");
assert.strictEqual(director.placement, "");
director.placement = "below";
assert.strictEqual(Model.effectiveSide(director), "below");
director.placement = "";
assert.strictEqual(Model.effectiveSide(director), "above");

const tied = [
  { name: "First", title: "Director" },
  { name: "Second", title: "Director" }
];
assert.deepStrictEqual(Model.orderedProspects(tied).all.map(function (person) { return person.name; }), ["First", "Second"]);

assert.strictEqual(Model.copyText("Sabrina Glaser", {
  accountName: "Northwind",
  prospects: [
    { name: "Lee Park", title: "Account Executive", topLevel: "" },
    { name: "Dana Reyes", title: "VP Revenue Operations", topLevel: "<p>Asked about credits</p>" }
  ]
}), [
  "Sabrina Glaser - Northwind",
  "1. Dana Reyes, VP Revenue Operations, Asked about credits",
  "2. Lee Park, Account Executive"
].join("\n"));

assert.strictEqual(Dates.weekCaption(oct5), "Monday\u2019s account name, copied from the day view.");
assert.strictEqual(Dates.weekCaption(new Date(2026, 9, 7)), "Account names from the day view, Monday through Wednesday.");
const board = Model.weekBoard({
  days: {
    "2026-10-05": { accounts: { sabrina: { accountName: "  Northwind  " }, joe: { accountName: "" } } }
  }
}, oct5);
assert.strictEqual(board.length, 1);
assert.strictEqual(board[0].date, "2026-10-05");
assert.strictEqual(board[0].label, "Mon · Oct 5");
assert.strictEqual(board[0].names.sabrina, "Northwind");
assert.strictEqual(board[0].names.joe, "");
assert.strictEqual(Model.weekBoard({ days: {} }, new Date(2026, 9, 7)).length, 3);

const listStore = {
  days: {
    "2026-09-28": { accounts: { sabrina: { accountName: "Acme", notes: "", prospects: [] } } },
    "2026-09-29": { accounts: { sabrina: { accountName: "Initech", notes: "", prospects: [] } } },
    "2026-09-30": { accounts: { sabrina: { accountName: "Hooli", notes: "<p>Notes only</p>", prospects: [] }, joe: { accountName: "", notes: "<p>Only notes</p>", prospects: [] } } },
    "2026-10-01": { accounts: { sabrina: { accountName: "acme", notes: "", prospects: [] } } },
    "2026-10-02": { accounts: { sabrina: { accountName: "Umbrella", notes: "", prospects: [{ name: "Lee", title: "AE", topLevel: "x", likelyNeeds: "" }], upcomingCall: { date: "2026-10-08", time: "09:00", attendees: [] } } } },
    "2026-10-03": { accounts: { sabrina: { accountName: "Weekend Co", notes: "", prospects: [] } } },
    "2026-10-05": { accounts: { sabrina: { accountName: "Northwind", notes: "", prospects: [] } } }
  },
  addedAccounts: {
    sabrina: [{ id: "g1", name: "Globex", salesforce: null, addedOn: "2026-10-05" }],
    joe: [{ id: "a1", name: "Acme", salesforce: { accountId: "001", opportunityId: "" }, addedOn: "2026-09-01" }]
  }
};
const sabrinaRows = Model.runningAccounts(listStore, "sabrina", oct5);
assert.deepStrictEqual(sabrinaRows.map(function (row) { return row.name; }), ["Globex", "Umbrella", "acme", "Hooli", "Initech"]);
assert.deepStrictEqual(sabrinaRows[2].dates, ["2026-09-28", "2026-10-01"]);
assert.strictEqual(sabrinaRows.some(function (row) { return row.name === "Northwind" || row.name === "Weekend Co"; }), false);
const joeRows = Model.runningAccounts(listStore, "joe", oct5);
assert.deepStrictEqual(joeRows.map(function (row) { return row.name; }), ["Acme"]);
assert.strictEqual(joeRows[0].dates.length, 0);
assert.strictEqual(joeRows[0].salesforce.accountId, "001");
const taken = Model.runningAccounts(listStore, "sabrina", oct5).some(function (row) {
  return Model.fold(row.name) === Model.fold("ACME");
});
assert.strictEqual(taken, true);

const Events = require("../Resources/events.js");
const monthStore = Model.blankStore();
const source = Events.manual(monthStore);
assert.deepStrictEqual(source.list("2026-10"), []);
assert.strictEqual(source.addEvent("2026-10", "   ", ""), null);
const added = source.addEvent("2026-10", " Offsite ", "Oct 12\u201314");
assert.strictEqual(added.title, "Offsite");
assert.strictEqual(source.list("2026-10").length, 1);
assert.strictEqual(source.list("2026-11").length, 0);
const task = source.addTask("2026-10", added.id, "");
source.updateTask("2026-10", added.id, task.id, { text: "Book the room", done: true });
assert.strictEqual(source.list("2026-10")[0].tasks[0].text, "Book the room");
assert.strictEqual(source.list("2026-10")[0].tasks[0].done, true);
source.updateEvent("2026-10", added.id, { title: "Planning offsite", date: "Oct 12" });
assert.strictEqual(source.list("2026-10")[0].title, "Planning offsite");
source.deleteTask("2026-10", added.id, task.id);
assert.strictEqual(source.list("2026-10")[0].tasks.length, 0);
source.deleteEvent("2026-10", added.id);
assert.strictEqual(source.list("2026-10").length, 0);

const Salesforce = require("../Resources/salesforce.js");
const index = {
  syncedAt: "2026-10-05T11:02:00Z",
  instanceUrl: "https://clay.my.salesforce.com",
  linkedinField: "LinkedIn__c",
  partners: { sabrina: { id: "005S", name: "Sabrina Glaser" }, joe: { id: "005J", name: "Joe Gordon" } },
  accounts: [
    { id: "001A", name: "Acme", partnerId: "sabrina", owner: "Pat Owner", lastActivity: "2026-09-30" },
    { id: "001B", name: "Northwind Logístics", partnerId: "joe", owner: "Lee Owner", lastActivity: "" },
    { id: "001C", name: "Zeta", partnerId: "", owner: "", lastActivity: "" }
  ],
  opportunities: [
    { id: "006A", name: "Acme - Expansion", accountId: "001A", stage: "2. Discovery", closeDate: "2026-12-01", closed: false, owner: "Sabrina Glaser" },
    { id: "006B", name: "Acme - Old deal", accountId: "001A", stage: "Closed Lost", closeDate: "2025-01-01", closed: true, owner: "Sabrina Glaser" },
    { id: "006C", name: "Northwind - New", accountId: "001B", stage: "1. Engage", closeDate: "2026-11-01", closed: false, owner: "Joe Gordon" }
  ],
  contacts: [
    { id: "003A", name: "Dana Reyes", title: "VP Revenue Operations", accountId: "001A", linkedin: "https://linkedin.com/in/dana", email: "dana@acme.com" },
    { id: "003B", name: "Bob Able", title: "", accountId: "001A", linkedin: "", email: "" },
    { id: "003C", name: "Cal Zed", title: "Analyst", accountId: "001A", linkedin: "", email: "cal@acme.com" },
    { id: "003D", name: "Ann Prime", title: "CRO", accountId: "001A", linkedin: "", email: "" },
    { id: "003E", name: "Other Role", title: "Director", accountId: "001A", linkedin: "", email: "" }
  ],
  roles: [
    { opportunityId: "006A", contactId: "003D", role: "Decision Maker", primary: true },
    { opportunityId: "006A", contactId: "003C", role: "Influencer", primary: false },
    { opportunityId: "006B", contactId: "003E", role: "Champion", primary: false }
  ]
};
const view = Salesforce.build(index);
assert.deepStrictEqual(Salesforce.suggestions(view, "sabrina", "").map(function (s) { return s.name; }), ["Acme - Expansion"]);
assert.deepStrictEqual(Salesforce.suggestions(view, "sabrina", "ac").map(function (s) { return s.name; }), ["Acme", "Acme - Expansion", "Acme - Old deal"]);
assert.strictEqual(Salesforce.suggestions(view, "sabrina", "acme")[0].detail, "Account · 5 contacts");
assert.strictEqual(Salesforce.suggestions(view, "sabrina", "expansion")[0].detail, "Opportunity · Acme · 2. Discovery");
assert.deepStrictEqual(Salesforce.suggestions(view, "sabrina", "northwind logis").map(function (s) { return s.name; }), ["Northwind Logístics"]);
assert.deepStrictEqual(Salesforce.suggestions(view, "joe", "n").map(function (s) { return s.name; }).slice(0, 2), ["Northwind - New", "Northwind Logístics"]);
const contacts = Salesforce.contactsFor(view, "001A", "006A", "");
assert.deepStrictEqual(contacts.rows.map(function (row) { return row.contact.name; }), ["Ann Prime", "Cal Zed", "Other Role", "Dana Reyes", "Bob Able"]);
assert.strictEqual(contacts.rows[0].badge, "Primary contact on this opportunity: Decision Maker");
assert.strictEqual(contacts.rows[1].badge, "Contact role on this opportunity");
assert.strictEqual(contacts.rows[2].badge, "Contact role on another opportunity here");
assert.strictEqual(contacts.rows[3].badge, "");
assert.strictEqual(Salesforce.contactsFor(view, "001A", "006A", "cal@").rows.length, 1);
assert.strictEqual(Salesforce.accountByName(view, "northwind logistics").id, "001B");
assert.strictEqual(Salesforce.linkedAccount(view, { accountName: "ACME", salesforce: null }).id, "001A");
const chips = Salesforce.chips(view, { accountName: "Acme", salesforce: { accountId: "001A", opportunityId: "006A" } }, { date: "2026-10-04" }, oct5);
assert.deepStrictEqual(chips.map(function (chip) { return chip.label + "=" + chip.value; }), ["Stage=2. Discovery", "Owner=Sabrina Glaser", "Last activity=yesterday"]);
assert.strictEqual(chips[2].title, "Oct 4, 2026");
assert.deepStrictEqual(Salesforce.chips(view, { accountName: "Zeta", salesforce: null }, null, oct5), []);
assert.strictEqual(Salesforce.statusLine({ state: "running" }, false, index, oct5).text, "Refreshing from Salesforce…");
assert.strictEqual(Salesforce.statusLine({ state: "signin" }, false, index, oct5).text, "Your Salesforce sign-in expired.");
assert.strictEqual(Salesforce.statusLine(null, false, null, oct5).text, "No Salesforce copy yet.");
assert.ok(/^Copied from Salesforce today at \d{1,2}:\d{2} [AP]M\.$/.test(Salesforce.statusLine({ state: "ok" }, false, index, oct5).text));
assert.ok(/^The last refresh failed \(timed out\)\. Showing the copy from today at /.test(Salesforce.statusLine({ state: "error", message: "timed out." }, false, index, oct5).text));
assert.strictEqual(Salesforce.formatValue({ type: "date" }, "2026-10-05").text, "Oct 5, 2026");
assert.strictEqual(Salesforce.formatValue({ type: "boolean" }, true).text, "Yes");
assert.strictEqual(Salesforce.formatValue({ type: "boolean" }, false).text, "");
assert.strictEqual(Salesforce.formatValue({ type: "currency" }, 1500, { CurrencyIsoCode: "USD" }).text, "$1,500.00");
assert.strictEqual(Salesforce.formatValue({ type: "percent" }, 12.5).text, "12.5%");
assert.strictEqual(Salesforce.formatValue({ type: "reference", relationshipName: "Owner" }, "005X", { "Owner.Name": "Pat" }).text, "Pat");
assert.strictEqual(Salesforce.formatValue({ type: "email" }, "a@b.com").link, "mailto:a@b.com");
assert.strictEqual(Salesforce.formatValue({ type: "textarea", html: true }, "<p>Hi<br>there</p>").text, "Hi\nthere");
const rows = Salesforce.fieldRows("Contact", [
  { name: "Email", label: "Email", type: "email" },
  { name: "Name", label: "Full Name", type: "string" },
  { name: "Title", label: "Title", type: "string" },
  { name: "AccountId", label: "Account ID", type: "reference", relationshipName: "Account" },
  { name: "OwnerId", label: "Owner ID", type: "reference", relationshipName: "Owner" },
  { name: "Aardvark__c", label: "Aardvark", type: "string" }
], { Email: "d@acme.com", Name: "Dana", Title: "", AccountId: "001", "Account.Name": "Acme", OwnerId: "005", "Owner.Name": "Pat", Aardvark__c: "x" });
assert.deepStrictEqual(rows.map(function (row) { return row.label; }), ["Full Name", "Title", "Account", "Email", "Owner", "Aardvark"]);
assert.strictEqual(rows[1].empty, true);
assert.strictEqual(rows[2].text, "Acme");

console.log("logic.test.js: ok");
