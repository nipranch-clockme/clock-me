import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { findVisiblePerson } from "@/lib/profile";

/** A profile picture, for people who may see that person's profile. Anyone else gets "not found". */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  const { id } = await params;
  const photo = me && (await findVisiblePerson(me, id)) ? await db.profilePhoto.findUnique({ where: { userId: id } }) : null;
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(photo.data), {
    headers: {
      "Content-Type": "image/jpeg",
      // The page asks for it with ?v=<when it changed>, so a copy kept by this browser never goes stale.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
