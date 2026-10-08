// Overtime (OT) is time tagged "OT". People tag the time they work as overtime, and it is highlighted while a timesheet is
// reviewed (Approvals, and Review Time from there). The reports, exports and every other screen treat it like any other tag.
import { db } from "./db";

export const OT_TAG_NAME = "OT";

/** The id of the "OT" tag (any capitals), as a list: empty when the tag has not been created, so nothing is marked. */
export async function loadOtTagIds(): Promise<string[]> {
  const tags = await db.tag.findMany({ where: { name: { equals: OT_TAG_NAME, mode: "insensitive" } }, select: { id: true } });
  return tags.map((t) => t.id);
}

/** Whether an entry (its list of tag ids) carries the OT tag. */
export const hasOtTag = (tagIds: string[] | null | undefined, otIds: string[]) => otIds.length > 0 && !!tagIds?.some((id) => otIds.includes(id));
