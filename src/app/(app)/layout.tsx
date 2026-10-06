import { requireUser } from "@/lib/auth";
import { TABS, roleName } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import TeamStrip from "@/components/TeamStrip";
import Link from "next/link";
import { cookies } from "next/headers";
import ThemeToggle from "@/components/ThemeToggle";
import { THEME_COOKIE, themeOf } from "@/lib/themes";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const allowed = TABS.filter(([k, , roles]) => k !== "calendar" && (roles === "all" || roles.includes(me.role))).map(([k]) => k as string);
  const theme = themeOf((await cookies()).get(THEME_COOKIE)?.value);
  const who = (
    <>
      <Link href="/profile" className="plink" title="My profile" aria-label={`${me.name}, my profile`}>
        <span className="whot"><b>{me.name}</b><small>{roleName(me.role)} · {me.location.name}</small></span>
        <Avatar person={me} size={34} />
      </Link>
      <ThemeToggle initial={theme} />
      <form action={logout} className="inline" style={{ marginLeft: 8 }}><button className="btn sm">Sign out</button></form>
    </>
  );
  return (
    <AppShell allowed={allowed} who={who}>
      <TeamStrip me={me} />
      {children}
    </AppShell>
  );
}
