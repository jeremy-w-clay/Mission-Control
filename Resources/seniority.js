(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Seniority = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Seniority read from a job title, for sorting contacts and splitting them at the line.
  // Higher is more senior: 100 for CEOs and founders, 60 for Directors (the line), 30 for a title
  // with no level in it (Account Executive, Marketing Operations). null when there is no usable title.
  function lineRank() {
    if (typeof OrganizerConfig !== "undefined" && typeof OrganizerConfig.lineRank === "number") return OrganizerConfig.lineRank;
    if (typeof require === "function") return require("./config.js").lineRank;
    return 60;
  }
  const LINE = lineRank();

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
