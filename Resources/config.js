(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrganizerConfig = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    appTitle: "Jeremy's Mission Control",
    salesforceUserName: "Jeremy White",
    instanceUrl: "https://clay.my.salesforce.com",
    dailyTarget: 5,
    lineLevel: "Director",
    lineRank: 60,
    refreshTime: "7:00 AM",
    accountSdrField: "ClayDR__c",
    accountPartnerField: "GTME__c",
    opportunitySdrField: "Opportunity_ClayDR__c",
    notes: [
      { key: "topLevel", label: "Top Level" },
      { key: "likelyNeeds", label: "Likely Needs" }
    ],
    partners: [
      {
        id: "sabrina",
        name: "Sabrina Glaser",
        salesforceName: "Sabrina Glaser",
        color: "#1e4a38",
        tint: "#e4ede7",
        ink: "#163829"
      },
      {
        id: "joe",
        name: "Joe Gordon",
        salesforceName: "Joe Gordon",
        color: "#8a4b30",
        tint: "#f4e7df",
        ink: "#6b3822"
      }
    ]
  };
});
