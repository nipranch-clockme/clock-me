// Checks the arithmetic of expected hours on its own (no database): run with `npx tsx e2e/expected-unit.mts`
import * as X0 from "../src/lib/expected.ts";
import * as D0 from "../src/lib/dates.ts";
// tsx loads these as CommonJS here, so the named exports sit under `default`
const X: typeof X0 = (X0 as any).default ?? X0, D: typeof D0 = (D0 as any).default ?? D0;
const { buildExpected, weekdaysBetween, cleanFraction } = X;
const { workdays, addDays } = D;

let bad = 0;
const eq = (n: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(a) + " != " + JSON.stringify(b)); if (!ok) bad++; };

// the fast weekday count is the same as walking the days
let same = true;
for (let a = "2026-01-01"; a < "2026-03-20"; a = addDays(a, 1)) for (let n = 0; n < 40; n++) { const b = addDays(a, n); if (weekdaysBetween(a, b) !== workdays(a, b)) { same = false; console.log("  differs", a, b, weekdaysBetween(a, b), workdays(a, b)); } }
eq("weekdaysBetween matches workdays", same, true);
eq("weekdaysBetween b before a", weekdaysBetween("2026-10-08", "2026-10-07"), 0);

const AMD = "amd", PNQ = "pnq";
const A = { id: "a", locationId: AMD, weeklyTarget: 40 }, B = { id: "b", locationId: PNQ, weeklyTarget: 40 }, P = { id: "p", locationId: AMD, weeklyTarget: 20 };
const build = (o: Partial<Parameters<typeof buildExpected>[0]> = {}) => buildExpected({
  starts: new Map([["a", "2026-01-01"], ["b", "2026-01-01"], ["p", "2026-01-01"]]),
  holidays: [], leave: [], today: "2026-10-12", ...o,
});
// October 2026: Thu 1st. Mon-Fri days up to Fri 9th = 7 (1,2,5,6,7,8,9)
eq("no holidays: 1-9 Oct", build()(A, "2026-10-01", "2026-10-09"), 7 * 8 * 60);
eq("part-time weekly 20", build()(P, "2026-10-01", "2026-10-09"), 7 * 4 * 60);
eq("cut at yesterday by default", build()(A, "2026-10-01", "2026-10-31"), build()(A, "2026-10-01", "2026-10-11")); // today is Mon 12th
eq("whole counts the future", build()(A, "2026-10-12", "2026-10-16", { whole: true }), 5 * 8 * 60);
eq("whole = nothing before today without it", build()(A, "2026-10-12", "2026-10-16"), 0);

const hol = [{ locationId: AMD, date: "2026-10-02", name: "Gandhi Jayanti", fraction: 1 }, { locationId: AMD, date: "2026-10-03", name: "Saturday one", fraction: 1 }];
eq("holiday takes a day off its own office", build({ holidays: hol })(A, "2026-10-01", "2026-10-09"), 6 * 8 * 60);
eq("other office unaffected", build({ holidays: hol })(B, "2026-10-01", "2026-10-09"), 7 * 8 * 60);
eq("weekend holiday takes nothing", build({ holidays: hol })(A, "2026-10-03", "2026-10-04"), 0);
eq("part-time loses a fifth of the week too", build({ holidays: hol })(P, "2026-10-01", "2026-10-09"), 6 * 4 * 60);
eq("half-day holiday", build({ holidays: [{ locationId: AMD, date: "2026-10-02", name: "Half", fraction: 0.5 }] })(A, "2026-10-01", "2026-10-09"), 6.5 * 8 * 60);

const lv = (o: object) => ({ id: "l1", userId: "a", from: "2026-10-05", to: "2026-10-07", fraction: 1, label: "PTO", source: "manual", ...o });
eq("PTO Mon-Wed", build({ leave: [lv({})] })(A, "2026-10-01", "2026-10-09"), 4 * 8 * 60);
eq("PTO of one person only", build({ leave: [lv({})] })(P, "2026-10-01", "2026-10-09"), 7 * 4 * 60);
eq("PTO across a weekend skips it", build({ leave: [lv({ from: "2026-10-02", to: "2026-10-06" })] })(A, "2026-10-01", "2026-10-09"), 4 * 8 * 60);
eq("half-day PTO", build({ leave: [lv({ from: "2026-10-05", to: "2026-10-05", fraction: 0.5 })] })(A, "2026-10-01", "2026-10-09"), 6.5 * 8 * 60);
eq("holiday and PTO on one day count once", build({ holidays: hol, leave: [lv({ from: "2026-10-02", to: "2026-10-02" })] })(A, "2026-10-01", "2026-10-09"), 6 * 8 * 60);
eq("two PTO rows on one day count once (the larger)", build({ leave: [lv({ from: "2026-10-05", to: "2026-10-05", fraction: 0.5 }), lv({ id: "l2", from: "2026-10-05", to: "2026-10-05", fraction: 1 })] })(A, "2026-10-01", "2026-10-09"), 6 * 8 * 60);
eq("half holiday + half PTO = a whole day off", build({ holidays: [{ locationId: AMD, date: "2026-10-05", name: "H", fraction: 0.5 }], leave: [lv({ from: "2026-10-05", to: "2026-10-05", fraction: 0.5 })] })(A, "2026-10-01", "2026-10-09"), 6 * 8 * 60);
eq("never below zero", build({ leave: [lv({ from: "2026-10-01", to: "2026-10-09" })] })(A, "2026-10-01", "2026-10-09"), 0);
eq("start clip: days before the person started do not count", build({ starts: new Map([["a", "2026-10-06"]]), leave: [lv({})] })(A, "2026-10-01", "2026-10-09"), 2 * 8 * 60); // from the 6th: 6 and 7 are PTO, 8 and 9 remain
eq("start clip with holiday before start ignored", build({ starts: new Map([["a", "2026-10-05"]]), holidays: hol })(A, "2026-10-01", "2026-10-09"), 5 * 8 * 60);
eq("PTO outside the window ignored", build({ leave: [lv({})], window: { from: "2026-11-01", to: "2026-11-30" } })(A, "2026-10-01", "2026-10-09"), 7 * 8 * 60);
eq("long PTO is cut to the window but still counts inside it", build({ leave: [lv({ from: "2026-01-01", to: "2027-12-31" })], window: { from: "2026-10-01", to: "2026-10-31" } })(A, "2026-10-01", "2026-10-09"), 0);

const e = build({ holidays: hol, leave: [lv({ from: "2026-10-05", to: "2026-10-06" })] });
eq("days = minutes / (weekly/5*60)", e.days(A, "2026-10-01", "2026-10-09"), e(A, "2026-10-01", "2026-10-09") / (8 * 60));
eq("dates lists the days that count", e.dates(A, "2026-10-01", "2026-10-09"), ["2026-10-01", "2026-10-07", "2026-10-08", "2026-10-09"]);
eq("off: holiday", e.off(A, "2026-10-02"), { holiday: { name: "Gandhi Jayanti", fraction: 1 } });
eq("off: PTO", e.off(A, "2026-10-05"), { leave: { id: "l1", label: "PTO", fraction: 1, source: "manual" } });
eq("off: normal day", e.off(A, "2026-10-08"), null);
eq("off: weekend", e.off(A, "2026-10-03"), null);
eq("off: other office", e.off(B, "2026-10-02"), null);
eq("breakdown", e.breakdown(A, "2026-10-01", "2026-10-09"), { weekdays: 7, holidays: [{ date: "2026-10-02", name: "Gandhi Jayanti", fraction: 1 }], holidayDays: 1, leaveDays: 2, days: 4 });
eq("half-day dates still count", build({ leave: [lv({ from: "2026-10-05", to: "2026-10-05", fraction: 0.5 })] }).dates(A, "2026-10-05", "2026-10-05"), ["2026-10-05"]);
eq("cleanFraction", [cleanFraction(2), cleanFraction(0.5), cleanFraction(0.3), cleanFraction(0.01), cleanFraction(0), cleanFraction(-1)], [1, 0.5, 0.25, 0.25, 0, 0]);

console.log(bad ? `${bad} FAILED` : "ALL PASSED");
process.exit(bad ? 1 : 0);
