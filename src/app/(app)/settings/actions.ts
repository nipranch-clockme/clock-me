"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTab } from "@/lib/auth";
import { getSettings, logAction } from "@/lib/settings";
import { isDateStr, isTimeZone, longDate, toDate } from "@/lib/dates";

export type SettingsResult = { ok: boolean; error?: string } | null;
const done = () => { revalidatePath("/", "layout"); return { ok: true }; };

export async function saveSettings(_: SettingsResult, form: FormData): Promise<SettingsResult> {
  const me = await requireTab("settings");
  const before = await getSettings();
  const lock = String(form.get("lockBefore") ?? "");
  const dailyMinimum = parseFloat(String(form.get("dailyMinimum") ?? "0"));
  const day = parseInt(String(form.get("remindSubmitDay") ?? "5"));
  if (lock && !isDateStr(lock)) return { ok: false, error: "Choose a valid lock date." };
  if (isNaN(dailyMinimum) || dailyMinimum < 0 || dailyMinimum > 24) return { ok: false, error: "Daily minimum should be between 0 and 24 hours." };
  const timeZone = String(form.get("timeZone") ?? "");
  if (!isTimeZone(timeZone)) return { ok: false, error: "Choose a time zone." };
  const data = {
    timeZone,
    timeFormat: form.get("timeFormat") === "hhmm" ? "hhmm" : "decimal",
    requireTag: form.get("requireTag") === "on",
    requireDescription: form.get("requireDescription") === "on",
    lockBefore: lock ? toDate(lock) : null,
    dailyMinimum,
    remindSubmit: form.get("remindSubmit") === "on",
    remindSubmitDay: day >= 1 && day <= 7 ? day : 5,
    remindDaily: form.get("remindDaily") === "on",
    remindApprovers: form.get("remindApprovers") === "on",
  };
  await db.settings.update({ where: { id: 1 }, data });
  const changes = [
    before.timeZone !== data.timeZone && `time zone to ${timeZone}`,
    before.timeFormat !== data.timeFormat && `time format to ${data.timeFormat === "hhmm" ? "7:30" : "7.50"}`,
    before.requireTag !== data.requireTag && `tag ${data.requireTag ? "required" : "optional"}`,
    before.requireDescription !== data.requireDescription && `description ${data.requireDescription ? "required" : "optional"}`,
    (before.lockBeforeStr ?? "") !== lock && (lock ? `locked time on or before ${longDate(lock)}` : "removed the lock date"),
    before.dailyMinimum !== data.dailyMinimum && `daily minimum to ${dailyMinimum} h`,
    (before.remindSubmit !== data.remindSubmit || before.remindSubmitDay !== data.remindSubmitDay || before.remindDaily !== data.remindDaily || before.remindApprovers !== data.remindApprovers) && "reminders",
  ].filter(Boolean);
  if (changes.length) await logAction(me.id, `Changed settings: ${changes.join(", ")}`);
  return done();
}

export async function addTag(_: SettingsResult, form: FormData): Promise<SettingsResult> {
  const me = await requireTab("settings");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name the tag." };
  if (await db.tag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) return { ok: false, error: "That tag already exists." };
  await db.tag.create({ data: { name } });
  await logAction(me.id, `Added tag ${name}`);
  return done();
}

export async function removeTag(form: FormData) {
  const me = await requireTab("settings");
  const t = await db.tag.delete({ where: { id: String(form.get("id")) } });
  await logAction(me.id, `Removed tag ${t.name}`);
  done();
}

export async function addTemplate(_: SettingsResult, form: FormData): Promise<SettingsResult> {
  const me = await requireTab("settings");
  const name = String(form.get("name") ?? "").trim();
  const phases = String(form.get("phases") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!name || !phases.length) return { ok: false, error: "Give the template a name and at least one phase." };
  if (await db.phaseTemplate.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) return { ok: false, error: "A template with that name already exists." };
  await db.phaseTemplate.create({ data: { name, phases } });
  await logAction(me.id, `Added phase template ${name}`);
  return done();
}

export async function removeTemplate(form: FormData) {
  const me = await requireTab("settings");
  const t = await db.phaseTemplate.delete({ where: { id: String(form.get("id")) } });
  await logAction(me.id, `Removed phase template ${t.name}`);
  done();
}

export async function addField(_: SettingsResult, form: FormData): Promise<SettingsResult> {
  const me = await requireTab("settings");
  const name = String(form.get("name") ?? "").trim();
  const type = form.get("type") === "select" ? "select" : "text";
  const options = String(form.get("options") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!name) return { ok: false, error: "Name the field." };
  if (["project", "phase", "tag", "description", "date", "email", "hours", "start", "client"].includes(name.toLowerCase())) return { ok: false, error: "That name is already used by a built-in field." };
  if (type === "select" && options.length < 2) return { ok: false, error: "A dropdown needs at least two options, separated by commas." };
  if (await db.customField.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) return { ok: false, error: "A field with that name already exists." };
  const sort = await db.customField.count();
  await db.customField.create({ data: { name, type, options: type === "select" ? options : [], required: form.get("required") === "on", sort } });
  await logAction(me.id, `Added custom field ${name}`);
  return done();
}

export async function toggleFieldRequired(form: FormData) {
  const me = await requireTab("settings");
  const f = await db.customField.findUnique({ where: { id: String(form.get("id")) } });
  if (!f) return;
  await db.customField.update({ where: { id: f.id }, data: { required: !f.required } });
  await logAction(me.id, `Made custom field ${f.name} ${f.required ? "optional" : "required"}`);
  done();
}

export async function removeField(form: FormData) {
  const me = await requireTab("settings");
  const f = await db.customField.delete({ where: { id: String(form.get("id")) } });
  await logAction(me.id, `Removed custom field ${f.name}`);
  done();
}
