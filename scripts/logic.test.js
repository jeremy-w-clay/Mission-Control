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

console.log("logic.test.js: ok");
