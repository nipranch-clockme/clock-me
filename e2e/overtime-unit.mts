// Overtime arithmetic on its own: npx tsx e2e/overtime-unit.mts
import * as ns from "../src/lib/overtime";
const { weekOvertime } = ((ns as any).default ?? ns) as typeof import("../src/lib/overtime");
let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); if (!cond) bad++; };
const e = (id: string, date: string, startMin: number, minutes: number) => ({ id, date, startMin, minutes });
const H = 60;

// 40 h week, nothing over
let r = weekOvertime([e("a", "2026-10-05", 540, 8 * H), e("b", "2026-10-06", 540, 8 * H)], 40 * H);
ok("under the expected hours: no OT", r.ot === 0 && r.logged === 16 * H && r.byEntry.size === 0);
// exactly the expected hours
r = weekOvertime(["05", "06", "07", "08", "09"].map((d) => e("d" + d, "2026-10-" + d, 540, 8 * H)), 40 * H);
ok("exactly the expected hours: no OT", r.ot === 0 && r.byEntry.size === 0);
// 45 h: the last entries are the OT, the boundary entry is split
r = weekOvertime([...["05", "06", "07", "08", "09"].map((d) => e("d" + d, "2026-10-" + d, 540, 8 * H)), e("sat", "2026-10-10", 540, 5 * H)], 40 * H);
ok("45 h of 40: 5 h OT, all of it Saturday's entry", r.ot === 5 * H && r.byEntry.size === 1 && r.byEntry.get("sat") === 5 * H, JSON.stringify([...r.byEntry]));
// boundary entry split
r = weekOvertime([e("a", "2026-10-05", 540, 6 * H), e("b", "2026-10-06", 540, 6 * H)], 8 * H);
ok("the entry that crosses the line is partly OT", r.ot === 4 * H && r.byEntry.get("a") === undefined && r.byEntry.get("b") === 4 * H, JSON.stringify([...r.byEntry]));
r = weekOvertime([e("a", "2026-10-05", 540, 10 * H)], 8 * H);
ok("one long entry: only the part above the line", r.ot === 2 * H && r.byEntry.get("a") === 2 * H);
// holiday week: 32 h capacity
r = weekOvertime(["05", "06", "08", "09"].map((d) => e("d" + d, "2026-10-" + d, 540, 8 * H)).concat([e("wed", "2026-10-07", 540, 2 * H)]), 32 * H);
ok("a day off lowers the line: 34 h of 32 is 2 h OT (the last-worked entry)", r.ot === 2 * H && r.byEntry.get("d09") === 2 * H, JSON.stringify([...r.byEntry]));
// worked order uses start time within a day
r = weekOvertime([e("late", "2026-10-05", 15 * H, 3 * H), e("early", "2026-10-05", 9 * H, 7 * H)], 8 * H);
ok("within a day, earlier start counts first", r.ot === 2 * H && r.byEntry.get("late") === 2 * H && !r.byEntry.has("early"), JSON.stringify([...r.byEntry]));
// whole week off but time logged: everything is OT
r = weekOvertime([e("a", "2026-10-05", 540, 4 * H)], 0);
ok("nothing expected: all logged time is OT", r.ot === 4 * H && r.byEntry.get("a") === 4 * H);
// no weekly target: no OT concept
r = weekOvertime([e("a", "2026-10-05", 540, 4 * H)], 0, false);
ok("no weekly target: no OT", r.ot === 0 && r.byEntry.size === 0 && r.logged === 4 * H);
// fractional capacity is rounded to a minute
r = weekOvertime([e("a", "2026-10-05", 540, 481)], 480.4);
ok("capacity rounds to the minute", r.ot === 1);
console.log(bad ? `${bad} FAILED` : "ALL PASSED");
process.exit(bad ? 1 : 0);
