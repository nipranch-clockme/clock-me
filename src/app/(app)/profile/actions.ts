"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, type Me } from "@/lib/auth";
import { logAction } from "@/lib/settings";
import { canManagePerson } from "@/lib/scope";
import { DUP_EMPLOYEE_ID, MAX_PHOTO_BYTES, MAX_PHOTO_SIDE, isDupEmployeeId, jpegSize, profileChanges, readProfileFields } from "@/lib/profile";

export type ProfileResult = { ok: boolean; error?: string } | null;
const NOT_ALLOWED = "You don't have permission to change that.";

const refresh = (id: string) => { revalidatePath("/profile"); revalidatePath(`/profile/${id}`); revalidatePath("/people"); };

/** Employee ID, joining date and expected hours per week: admins for everyone, location managers for their own office. */
export async function saveProfileDetails(_: ProfileResult, form: FormData): Promise<ProfileResult> {
  const me = await requireUser();
  const id = String(form.get("id") ?? "");
  const person = await db.user.findUnique({ where: { id } });
  if (!person || !canManagePerson(me, person)) return { ok: false, error: NOT_ALLOWED };
  const f = await readProfileFields(form, id);
  if ("error" in f) return { ok: false, error: f.error };
  try {
    await db.user.update({ where: { id }, data: f.data });
  } catch (e) {
    if (isDupEmployeeId(e)) return { ok: false, error: DUP_EMPLOYEE_ID };
    throw e;
  }
  const changes = profileChanges(person, f.data);
  if (changes.length) await logAction(me.id, `Updated ${person.name}: ${changes.join(", ")}`, id);
  refresh(id);
  return { ok: true };
}

/** People change their own picture; admins and location managers (own office) change other people's. */
async function photoTarget(me: Me, form: FormData) {
  const person = await db.user.findUnique({ where: { id: String(form.get("id") ?? "") } });
  return person && (person.id === me.id || canManagePerson(me, person)) ? person : null;
}

export async function uploadPhoto(_: ProfileResult, form: FormData): Promise<ProfileResult> {
  const me = await requireUser();
  const person = await photoTarget(me, form);
  if (!person) return { ok: false, error: NOT_ALLOWED };
  const file = form.get("photo");
  if (!(file instanceof Blob) || !file.size) return { ok: false, error: "Choose a picture to upload." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That picture is too big. Try a different one." };
  const data = new Uint8Array(await file.arrayBuffer());
  const size = jpegSize(data);
  if (!size) return { ok: false, error: "Choose a JPEG, PNG or WebP picture." };
  if (size.w > MAX_PHOTO_SIDE || size.h > MAX_PHOTO_SIDE || !size.w || !size.h) return { ok: false, error: "That picture is too big. Try a different one." };
  await db.$transaction([
    db.profilePhoto.upsert({ where: { userId: person.id }, update: { data }, create: { userId: person.id, data } }),
    db.user.update({ where: { id: person.id }, data: { photoAt: new Date() } }),
  ]);
  await logAction(me.id, person.id === me.id ? "Changed their profile picture" : `Changed the profile picture of ${person.name}`, person.id);
  refresh(person.id);
  return { ok: true };
}

export async function removePhoto(_: ProfileResult, form: FormData): Promise<ProfileResult> {
  const me = await requireUser();
  const person = await photoTarget(me, form);
  if (!person) return { ok: false, error: NOT_ALLOWED };
  await db.$transaction([
    db.profilePhoto.deleteMany({ where: { userId: person.id } }),
    db.user.update({ where: { id: person.id }, data: { photoAt: null } }),
  ]);
  if (person.photoAt) await logAction(me.id, person.id === me.id ? "Removed their profile picture" : `Removed the profile picture of ${person.name}`, person.id);
  refresh(person.id);
  return { ok: true };
}
