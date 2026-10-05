(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Model = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function blankProspect() {
    return {
      name: "",
      title: "",
      linkedinUrl: "",
      salesforceId: "",
      topLevel: "",
      likelyNeeds: "",
      placement: ""
    };
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

  function ensureAccount(store, date, partnerId) {
    if (!store.days[date]) store.days[date] = { date: date, accounts: {} };
    const day = store.days[date];
    if (!day.accounts) day.accounts = {};
    if (!day.accounts[partnerId]) day.accounts[partnerId] = blankAccount();
    return day.accounts[partnerId];
  }

  function load(raw) {
    const store = blankStore();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { store: store, changed: false };
    if (raw.days && typeof raw.days === "object" && !Array.isArray(raw.days)) store.days = raw.days;
    if (raw.months && typeof raw.months === "object" && !Array.isArray(raw.months)) store.months = raw.months;
    if (raw.addedAccounts && typeof raw.addedAccounts === "object" && !Array.isArray(raw.addedAccounts)) {
      store.addedAccounts = raw.addedAccounts;
    }
    return { store: store, changed: false };
  }

  return {
    blankProspect: blankProspect,
    blankAccount: blankAccount,
    blankStore: blankStore,
    ensureAccount: ensureAccount,
    load: load
  };
});
