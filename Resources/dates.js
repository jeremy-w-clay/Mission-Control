(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Dates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function iso(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function parse(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
  }

  function isDateKey(value) {
    return !!parse(value);
  }

  function isMonthKey(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(value || "");
    if (!match) return false;
    const month = Number(match[2]);
    return month >= 1 && month <= 12;
  }

  function monthKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1);
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function monday(date) {
    const day = date.getDay();
    const delta = day === 0 ? -6 : 1 - day;
    return addDays(date, delta);
  }

  function friday(date) {
    return addDays(monday(date), 4);
  }

  function ordinal(day) {
    const tens = day % 100;
    let suffix = "th";
    if (tens < 11 || tens > 13) {
      if (day % 10 === 1) suffix = "st";
      else if (day % 10 === 2) suffix = "nd";
      else if (day % 10 === 3) suffix = "rd";
    }
    return day + suffix;
  }

  function dayTab(date) {
    return MONTHS[date.getMonth()] + " " + ordinal(date.getDate());
  }

  function weekTab(date) {
    const start = monday(date);
    const end = friday(date);
    const left = MONTHS_SHORT[start.getMonth()] + " " + start.getDate();
    if (start.getMonth() === end.getMonth()) return left + " - " + end.getDate();
    return left + " - " + MONTHS_SHORT[end.getMonth()] + " " + end.getDate();
  }

  function monthTab(date) {
    return MONTHS[date.getMonth()];
  }

  function tabLabels(date) {
    return {
      day: dayTab(date),
      week: weekTab(date),
      month: monthTab(date),
      archive: "Running Account List"
    };
  }

  function heading(date) {
    return WEEKDAYS[date.getDay()] + ", " + MONTHS[date.getMonth()] + " " + date.getDate();
  }

  function detailDate(date) {
    return WEEKDAYS[date.getDay()] + ", " + MONTHS_SHORT[date.getMonth()] + " " + date.getDate();
  }

  function monthYear(date) {
    return MONTHS[date.getMonth()] + " " + date.getFullYear();
  }

  function weekdayName(date) {
    return WEEKDAYS[date.getDay()];
  }

  function weekRow(date) {
    return WEEKDAYS_SHORT[date.getDay()] + " · " + MONTHS_SHORT[date.getMonth()] + " " + date.getDate();
  }

  function shortDate(date, todayDate) {
    const base = MONTHS_SHORT[date.getMonth()] + " " + date.getDate();
    if (todayDate && date.getFullYear() !== todayDate.getFullYear()) return base + ", " + date.getFullYear();
    return base;
  }

  function weekdayDate(date, todayDate) {
    let base = WEEKDAYS_SHORT[date.getDay()] + ", " + MONTHS_SHORT[date.getMonth()] + " " + date.getDate();
    if (todayDate && date.getFullYear() !== todayDate.getFullYear()) base += ", " + date.getFullYear();
    return base;
  }

  function longDate(date) {
    return MONTHS_SHORT[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }

  function formatTime(hhmm) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
    if (!match) return "";
    let hour = Number(match[1]);
    const minute = match[2];
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return hour + ":" + minute + " " + suffix;
  }

  function callLabel(dateValue, time) {
    const date = typeof dateValue === "string" ? parse(dateValue) : dateValue;
    if (!date) return "";
    const when = weekdayDate(date);
    const clock = formatTime(time);
    return clock ? when + " · " + clock : when;
  }

  function relative(isoDay, todayDate) {
    const date = parse(isoDay);
    if (!date || !todayDate) return "";
    const days = Math.round((todayDate.getTime() - date.getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return days + "d ago";
    if (days < 30) return Math.floor(days / 7) + "w ago";
    if (days < 365) return Math.floor(days / 30) + "mo ago";
    return Math.floor(days / 365) + "y ago";
  }

  function weekdaysThrough(todayDate) {
    const start = monday(todayDate);
    const day = todayDate.getDay();
    const endOffset = day === 0 || day === 6 ? 4 : day - 1;
    const out = [];
    for (let i = 0; i <= endOffset; i++) out.push(addDays(start, i));
    return out;
  }

  function weekFinished(weekMonday, todayDate) {
    return iso(addDays(weekMonday, 4)) < iso(todayDate);
  }

  function lastWeekPhrase(date) {
    return "last " + WEEKDAYS[date.getDay()];
  }

  function clockNow() {
    const now = new Date();
    let hour = now.getHours();
    const minute = pad(now.getMinutes());
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return hour + ":" + minute + " " + suffix;
  }

  return {
    MONTHS: MONTHS,
    MONTHS_SHORT: MONTHS_SHORT,
    WEEKDAYS: WEEKDAYS,
    WEEKDAYS_SHORT: WEEKDAYS_SHORT,
    pad: pad,
    iso: iso,
    parse: parse,
    isDateKey: isDateKey,
    isMonthKey: isMonthKey,
    monthKey: monthKey,
    addDays: addDays,
    today: today,
    monday: monday,
    friday: friday,
    ordinal: ordinal,
    dayTab: dayTab,
    weekTab: weekTab,
    monthTab: monthTab,
    tabLabels: tabLabels,
    heading: heading,
    detailDate: detailDate,
    monthYear: monthYear,
    weekdayName: weekdayName,
    weekRow: weekRow,
    shortDate: shortDate,
    weekdayDate: weekdayDate,
    longDate: longDate,
    formatTime: formatTime,
    callLabel: callLabel,
    relative: relative,
    weekdaysThrough: weekdaysThrough,
    weekFinished: weekFinished,
    lastWeekPhrase: lastWeekPhrase,
    clockNow: clockNow
  };
});
