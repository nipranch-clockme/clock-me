"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ICONS } from "./icons";

type Tab = { href: string; label: string; icon: string };
const GROUPS: string[][] = [["dashboard", "timesheet"], ["approvals", "reports", "clients"], ["projects", "people", "import-export"]];
const ICON_FOR: Record<string, string> = { dashboard: "dash", timesheet: "sheet", approvals: "approve", reports: "reports", clients: "clients", projects: "projects", people: "people", "import-export": "io", settings: "settings" };

const Mark = () => (
  <svg className="mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="13" r="9.5" fill="var(--accent)" /><path d="M11 8v5l3.2 2.1" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="19.6" cy="4.6" r="3.1" fill="var(--s2)" /></svg>
);
const Svg = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;

/** The sidebar (a drawer on phones), the top bar and the page area. */
export default function AppShell({ allowed, who, children }: { allowed: string[]; who: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.classList.toggle("navopen", open);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); document.body.classList.remove("navopen"); };
  }, [open]);
  const labels: Record<string, string> = { dashboard: "Dashboard", timesheet: "Timesheet", approvals: "Approvals", reports: "Reports", clients: "Clients", projects: "Projects", people: "People", "import-export": "Import & export", settings: "Settings" };
  const link = (k: string, cls?: string) => {
    const t: Tab = { href: "/" + k, label: labels[k], icon: ICONS[ICON_FOR[k]] };
    const here = path.startsWith(t.href) || (k === "timesheet" && path.startsWith("/calendar"));
    return <Link key={k} href={t.href} className={cls} aria-current={here ? "page" : undefined}><Svg d={t.icon} /><span>{t.label}</span></Link>;
  };
  const groups = GROUPS.map((g) => g.filter((k) => allowed.includes(k))).filter((g) => g.length);
  return (
    <div className="app">
      <aside className="side" id="side" aria-label="Menu"><div className="sidein">
        <div className="sbrand"><Mark /><span>The Time Sink</span>
          <button className="iconbtn sclose" aria-label="Close menu" onClick={() => setOpen(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>
        <nav className="snav" id="tabs" aria-label="Main">
          {groups.map((g, i) => <span key={i} style={{ display: "contents" }}>{i > 0 && <hr />}{g.map((k) => link(k))}</span>)}
          {allowed.includes("settings") && link("settings", "navend")}
        </nav>
      </div></aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main" id="mainc">
        <header className="top">
          <button className="menubtn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="side" onClick={() => setOpen(!open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
          <div className="tbrand"><Mark /><span>The Time Sink</span></div>
          <div className="who">{who}</div>
        </header>
        <main id="view">{children}</main>
      </div>
    </div>
  );
}
