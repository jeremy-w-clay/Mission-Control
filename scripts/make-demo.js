// Writes a demo data folder with fake data for today, last week and earlier weeks.
// Usage: node scripts/make-demo.js [folder]   (default /tmp/organizer-demo)
const fs = require("fs");
const path = require("path");
const Dates = require("../Resources/dates.js");
const Config = require("../Resources/config.js");

const folder = process.argv[2] || "/tmp/organizer-demo";
fs.mkdirSync(folder, { recursive: true });

const today = Dates.today();
const iso = Dates.iso;
const partners = Config.partners.map(function (partner) { return partner.id; });
const first = partners[0];
const second = partners[1] || partners[0];

function prospect(name, title, extra) {
  const base = { name: name, title: title, linkedinUrl: "", salesforceId: "", placement: "" };
  Config.notes.forEach(function (note) { base[note.key] = ""; });
  return Object.assign(base, extra || {});
}

function stamp(date) {
  return iso(date) + "T15:02:00Z";
}

const ids = {
  acme: "001000000000001AAA", northwind: "001000000000002AAA", globex: "001000000000003AAA", initech: "001000000000004AAA",
  oppAcme: "006000000000001AAA", oppNorthwind: "006000000000002AAA", oppGlobexOld: "006000000000003AAA",
  dana: "003000000000001AAA", ann: "003000000000002AAA", cal: "003000000000003AAA", bob: "003000000000004AAA",
  lee: "003000000000005AAA", mia: "003000000000006AAA", omar: "003000000000007AAA", priya: "003000000000008AAA"
};

const noteKey = Config.notes[0].key;
const noteKey2 = Config.notes[1] ? Config.notes[1].key : noteKey;

const days = {};
function day(date, accounts) {
  days[iso(date)] = { date: iso(date), accounts: accounts };
}

const lastMonday = Dates.addDays(Dates.monday(today), -7);
const twoWeeksAgo = Dates.addDays(lastMonday, -7);

// Today: a full column and an empty one.
const todayAccounts = {};
todayAccounts[first] = {
  accountName: "Acme",
  salesforce: { accountId: ids.acme, opportunityId: ids.oppAcme },
  upcomingCall: { date: iso(Dates.addDays(today, 1)), time: "14:30", attendees: [{ name: "Dana Reyes", title: "VP Revenue Operations" }] },
  notes: "<p>Renewal conversation is open. Finance wants usage numbers before <span style=\"background-color: #f4e2a8\">Oct 20</span>.</p>",
  prospects: [
    prospect("Dana Reyes", "VP Revenue Operations", { salesforceId: ids.dana, linkedinUrl: "https://www.linkedin.com/in/dana-reyes", [noteKey]: "<p>Attended the Clay Ads livestream on Sep 24</p><p>Asked about enrichment credits</p>", [noteKey2]: "<ul><li>Credit pooling across teams</li><li>Waterfall for phone numbers</li></ul>" }),
    prospect("Ann Prime", "CRO", { salesforceId: ids.ann, [noteKey]: "<p>Primary on the expansion opportunity</p>" }),
    prospect("Cal Zed", "Marketing Operations Analyst", { salesforceId: ids.cal, [noteKey]: "<p>Downloaded the GTM engineering guide</p>" }),
    prospect("Lee Park", "Account Executive", { [noteKey]: "<p>Replied to the Sales Navigator note</p>" }),
    prospect("Bob Able", "", { salesforceId: ids.bob })
  ]
};
day(today, todayAccounts);

// Seven days ago: the follow-up band's account for the first partner, nothing for the second.
const back = Dates.addDays(today, -7);
const backAccounts = {};
backAccounts[first] = {
  accountName: "Acme",
  salesforce: { accountId: ids.acme, opportunityId: ids.oppAcme },
  upcomingCall: null,
  notes: "",
  prospects: [
    prospect("Dana Reyes", "VP Revenue Operations", { salesforceId: ids.dana, linkedinUrl: "https://www.linkedin.com/in/dana-reyes" }),
    prospect("Cal Zed", "Marketing Operations Analyst", { salesforceId: ids.cal })
  ]
};
day(back, backAccounts);

// Earlier this week, last week and two weeks ago, so Week and the Running Account List have rows.
if (today.getDay() > 1) {
  const earlier = {};
  earlier[second] = { accountName: "Northwind Logistics", salesforce: { accountId: ids.northwind, opportunityId: ids.oppNorthwind }, upcomingCall: null, notes: "", prospects: [prospect("Mia Chen", "Head of Growth", { salesforceId: ids.mia })] };
  day(Dates.monday(today), earlier);
}
[0, 1, 3].forEach(function (offset) {
  const date = Dates.addDays(lastMonday, offset);
  if (iso(date) === iso(back)) return;
  const accounts = {};
  accounts[first] = { accountName: offset === 3 ? "Globex" : "Initech", salesforce: offset === 3 ? { accountId: ids.globex, opportunityId: "" } : null, upcomingCall: null, notes: "<p>Worked " + Dates.weekdayName(date) + "</p>", prospects: [prospect("Omar Diaz", "Director of Demand Gen", { salesforceId: ids.omar })] };
  accounts[second] = { accountName: "Northwind Logistics", salesforce: { accountId: ids.northwind, opportunityId: ids.oppNorthwind }, upcomingCall: null, notes: "", prospects: [prospect("Priya Nair", "Sr. Director, Marketing", { salesforceId: ids.priya }), prospect("Sam Ortiz", "")] };
  day(date, accounts);
});
[0, 2].forEach(function (offset) {
  const date = Dates.addDays(twoWeeksAgo, offset);
  const accounts = {};
  accounts[first] = { accountName: "Initech", salesforce: null, upcomingCall: null, notes: "", prospects: [prospect("Omar Diaz", "Director of Demand Gen")] };
  day(date, accounts);
});

const monthKey = Dates.monthKey(today);
const months = {};
months[monthKey] = {
  month: monthKey,
  events: [
    { id: "evt-1", title: "Q4 planning offsite", date: Dates.MONTHS_SHORT[today.getMonth()] + " 12\u201314", tasks: [
      { id: "task-1", text: "Book the room", done: true },
      { id: "task-2", text: "Send the pre-read", done: false }
    ] },
    { id: "evt-2", title: "Dreamforce follow-ups due", date: "", tasks: [] }
  ]
};

const addedAccounts = {};
addedAccounts[first] = [{ id: "added-1", name: "Umbrella Corp", salesforce: null, addedOn: iso(today) }];
addedAccounts[second] = [{ id: "added-2", name: "Globex", salesforce: { accountId: ids.globex, opportunityId: "" }, addedOn: iso(Dates.addDays(today, -10)) }];

const store = { version: 1, days: days, months: months, addedAccounts: addedAccounts };
fs.writeFileSync(path.join(folder, "store.json"), JSON.stringify(store, null, 2) + "\n");

const index = {
  syncedAt: stamp(today),
  instanceUrl: Config.instanceUrl,
  linkedinField: "LinkedIn__c",
  partners: {},
  accounts: [
    { id: ids.acme, name: "Acme", partnerId: first, owner: "Pat Owner", lastActivity: iso(Dates.addDays(today, -3)) },
    { id: ids.northwind, name: "Northwind Logistics", partnerId: second, owner: "Lee Owner", lastActivity: iso(Dates.addDays(today, -12)) },
    { id: ids.globex, name: "Globex", partnerId: first, owner: "Pat Owner", lastActivity: "" },
    { id: ids.initech, name: "Initech", partnerId: "", owner: "Kim Owner", lastActivity: iso(Dates.addDays(today, -400)) }
  ],
  opportunities: [
    { id: ids.oppAcme, name: "Acme - Expansion", accountId: ids.acme, stage: "2. Discovery", closeDate: iso(Dates.addDays(today, 40)), closed: false, owner: Config.partners[0].name },
    { id: ids.oppNorthwind, name: "Northwind - New Logo", accountId: ids.northwind, stage: "1. Engage", closeDate: iso(Dates.addDays(today, 20)), closed: false, owner: Config.partners[1] ? Config.partners[1].name : "" },
    { id: ids.oppGlobexOld, name: "Globex - 2025 Pilot", accountId: ids.globex, stage: "Closed Lost", closeDate: iso(Dates.addDays(today, -300)), closed: true, owner: Config.partners[0].name }
  ],
  contacts: [
    { id: ids.dana, name: "Dana Reyes", title: "VP Revenue Operations", accountId: ids.acme, linkedin: "https://www.linkedin.com/in/dana-reyes", email: "dana@acme.example" },
    { id: ids.ann, name: "Ann Prime", title: "CRO", accountId: ids.acme, linkedin: "", email: "ann@acme.example" },
    { id: ids.cal, name: "Cal Zed", title: "Marketing Operations Analyst", accountId: ids.acme, linkedin: "", email: "cal@acme.example" },
    { id: ids.bob, name: "Bob Able", title: "", accountId: ids.acme, linkedin: "", email: "" },
    { id: ids.lee, name: "Lee Park", title: "Account Executive", accountId: ids.acme, linkedin: "", email: "lee@acme.example" },
    { id: ids.mia, name: "Mia Chen", title: "Head of Growth", accountId: ids.northwind, linkedin: "https://www.linkedin.com/in/mia-chen", email: "" },
    { id: ids.omar, name: "Omar Diaz", title: "Director of Demand Gen", accountId: ids.globex, linkedin: "", email: "" },
    { id: ids.priya, name: "Priya Nair", title: "Sr. Director, Marketing", accountId: ids.northwind, linkedin: "", email: "priya@northwind.example" }
  ],
  roles: [
    { opportunityId: ids.oppAcme, contactId: ids.ann, role: "Decision Maker", primary: true },
    { opportunityId: ids.oppAcme, contactId: ids.cal, role: "Influencer", primary: false },
    { opportunityId: ids.oppGlobexOld, contactId: ids.omar, role: "Champion", primary: false },
    { opportunityId: ids.oppNorthwind, contactId: ids.mia, role: "Decision Maker", primary: true }
  ]
};
Config.partners.forEach(function (partner, i) {
  index.partners[partner.id] = { id: "00500000000000" + (i + 1) + "AAA", name: partner.name };
});
fs.writeFileSync(path.join(folder, "salesforce-index.json"), JSON.stringify(index));
fs.writeFileSync(path.join(folder, "salesforce-status.json"), JSON.stringify({ state: "ok", startedAt: stamp(today), finishedAt: stamp(today), message: "", counts: { accounts: 4, opportunities: 3, contacts: 8, roles: 4 } }, null, 2));

const activity = { contacts: {}, accounts: {} };
activity.contacts[ids.dana] = { fetchedAt: stamp(today), item: { id: "00T1", kind: "task", label: "Email", subject: "Re: enrichment credits", date: iso(Dates.addDays(today, -3)), owner: Config.salesforceUserName, who: "Dana Reyes" }, after: iso(back), newCount: 3 };
activity.contacts[ids.cal] = { fetchedAt: stamp(today), item: null, after: iso(back), newCount: 0 };
activity.accounts[ids.acme] = { fetchedAt: stamp(today), item: { id: "00U1", kind: "event", label: "Meeting", subject: "Discovery call", date: iso(Dates.addDays(today, -1)), owner: Config.partners[0].name, who: "Ann Prime" } };
fs.writeFileSync(path.join(folder, "salesforce-activity.json"), JSON.stringify(activity, null, 2));

// A small salesforce.sqlite so the Details dialog has every field to show.
try {
  const { DatabaseSync } = require("node:sqlite");
  const dbPath = path.join(folder, "salesforce.sqlite");
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE objects (name TEXT PRIMARY KEY, label TEXT, fields TEXT)");
  db.exec("CREATE TABLE records (id TEXT PRIMARY KEY, object TEXT, account_id TEXT, data TEXT)");
  db.exec("CREATE INDEX records_account ON records(account_id)");
  db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
  const contactFields = [
    { name: "Id", label: "Contact ID", type: "id", relationshipName: null, html: false },
    { name: "Name", label: "Full Name", type: "string", relationshipName: null, html: false },
    { name: "Title", label: "Title", type: "string", relationshipName: null, html: false },
    { name: "AccountId", label: "Account ID", type: "reference", relationshipName: "Account", html: false },
    { name: "Email", label: "Email", type: "email", relationshipName: null, html: false },
    { name: "Phone", label: "Business Phone", type: "phone", relationshipName: null, html: false },
    { name: "MobilePhone", label: "Mobile", type: "phone", relationshipName: null, html: false },
    { name: "Department", label: "Department", type: "string", relationshipName: null, html: false },
    { name: "LinkedIn__c", label: "LinkedIn", type: "url", relationshipName: null, html: false },
    { name: "OwnerId", label: "Owner ID", type: "reference", relationshipName: "Owner", html: false },
    { name: "HasOptedOutOfEmail", label: "Email Opt Out", type: "boolean", relationshipName: null, html: false },
    { name: "CreatedDate", label: "Created Date", type: "datetime", relationshipName: null, html: false },
    { name: "Description", label: "Contact Description", type: "textarea", relationshipName: null, html: true }
  ];
  const accountFields = [
    { name: "Id", label: "Account ID", type: "id", relationshipName: null, html: false },
    { name: "Name", label: "Account Name", type: "string", relationshipName: null, html: false },
    { name: "Website", label: "Website", type: "url", relationshipName: null, html: false },
    { name: "Industry", label: "Industry", type: "picklist", relationshipName: null, html: false },
    { name: "NumberOfEmployees", label: "Employees", type: "int", relationshipName: null, html: false },
    { name: "AnnualRevenue", label: "Annual Revenue", type: "currency", relationshipName: null, html: false },
    { name: "OwnerId", label: "Owner ID", type: "reference", relationshipName: "Owner", html: false },
    { name: "LastActivityDate", label: "Last Activity", type: "date", relationshipName: null, html: false }
  ];
  const oppFields = [
    { name: "Id", label: "Opportunity ID", type: "id", relationshipName: null, html: false },
    { name: "Name", label: "Name", type: "string", relationshipName: null, html: false },
    { name: "AccountId", label: "Account ID", type: "reference", relationshipName: "Account", html: false },
    { name: "StageName", label: "Stage", type: "picklist", relationshipName: null, html: false },
    { name: "CloseDate", label: "Close Date", type: "date", relationshipName: null, html: false },
    { name: "Amount", label: "Amount", type: "currency", relationshipName: null, html: false },
    { name: "Probability", label: "Probability (%)", type: "percent", relationshipName: null, html: false },
    { name: "NextStep", label: "Next Step", type: "string", relationshipName: null, html: false },
    { name: "OwnerId", label: "Owner ID", type: "reference", relationshipName: "Owner", html: false }
  ];
  const insertObject = db.prepare("INSERT INTO objects VALUES (?, ?, ?)");
  insertObject.run("Contact", "Contact", JSON.stringify(contactFields));
  insertObject.run("Account", "Account", JSON.stringify(accountFields));
  insertObject.run("Opportunity", "Opportunity", JSON.stringify(oppFields));
  insertObject.run("OpportunityContactRole", "Opportunity Contact Role", JSON.stringify([]));
  const insert = db.prepare("INSERT INTO records VALUES (?, ?, ?, ?)");
  index.contacts.forEach(function (contact, i) {
    insert.run(contact.id, "Contact", contact.accountId, JSON.stringify({
      Id: contact.id, Name: contact.name, Title: contact.title || null, AccountId: contact.accountId,
      "Account.Name": index.accounts.filter(function (a) { return a.id === contact.accountId; })[0].name,
      Email: contact.email || null, Phone: i % 2 ? "+1 415 555 01" + (10 + i) : null, MobilePhone: null, Department: i % 3 ? "Revenue" : null,
      LinkedIn__c: contact.linkedin || null, OwnerId: "005000000000001AAA", "Owner.Name": Config.partners[0].name,
      HasOptedOutOfEmail: false, CreatedDate: "2025-03-04T15:22:00.000+0000",
      Description: i === 0 ? "<p>Met at <b>Dreamforce</b>.<br>Owns the RevOps roadmap.</p>" : null
    }));
  });
  index.accounts.forEach(function (account) {
    insert.run(account.id, "Account", account.id, JSON.stringify({
      Id: account.id, Name: account.name, Website: account.name.toLowerCase().replace(/\s+/g, "") + ".example", Industry: "Software",
      NumberOfEmployees: 1200, AnnualRevenue: 48000000, CurrencyIsoCode: "USD", OwnerId: "005000000000009AAA", "Owner.Name": account.owner,
      LastActivityDate: account.lastActivity || null
    }));
  });
  index.opportunities.forEach(function (opp) {
    insert.run(opp.id, "Opportunity", opp.accountId, JSON.stringify({
      Id: opp.id, Name: opp.name, AccountId: opp.accountId,
      "Account.Name": index.accounts.filter(function (a) { return a.id === opp.accountId; })[0].name,
      StageName: opp.stage, CloseDate: opp.closeDate, Amount: 125000, CurrencyIsoCode: "USD", Probability: 40,
      NextStep: "Scope the pilot", OwnerId: "005000000000001AAA", "Owner.Name": opp.owner
    }));
  });
  const meta = db.prepare("INSERT INTO meta VALUES (?, ?)");
  meta.run("syncedAt", index.syncedAt);
  meta.run("instanceUrl", index.instanceUrl);
  meta.run("scope", "{}");
  meta.run("linkedinField", "LinkedIn__c");
  db.close();
} catch (err) {
  console.error("Skipped salesforce.sqlite (" + err.message + ")");
}

console.log("Demo data written to " + folder);
