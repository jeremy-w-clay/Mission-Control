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

console.log("logic.test.js: ok");
