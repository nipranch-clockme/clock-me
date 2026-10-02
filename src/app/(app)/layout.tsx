import { requireUser } from "@/lib/auth";
import { TABS, roleName } from "@/lib/roles";
import NavLinks from "@/components/NavLinks";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const tabs = TABS.filter(([, , roles]) => roles === "all" || roles.includes(me.role)).map(([k, l]) => [k, l] as [string, string]);
  return (
    <div className="wrap">
      <header className="bar">
        <div className="brand"><h1>Clock me</h1></div>
        <div className="userbox">
          <span>{me.name} · {roleName(me.role)} · {me.location.name}</span>
          <form action={logout}><button className="btn sm">Sign out</button></form>
        </div>
      </header>
      <NavLinks tabs={tabs} />
      <main>{children}</main>
    </div>
  );
}
