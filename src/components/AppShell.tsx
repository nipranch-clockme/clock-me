"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ICONS } from "./icons";
import Logo from "./Logo";

type Tab = { href: string; label: string; icon: string };
const GROUPS: string[][] = [["dashboard", "timesheet", "time-off"], ["approvals", "reports"], ["clients", "projects", "people", "import-export"]];
const ICON_FOR: Record<string, string> = { dashboard: "dash", timesheet: "sheet", "time-off": "off", approvals: "approve", reports: "reports", clients: "clients", projects: "projects", people: "people", "import-export": "io", settings: "settings" };

const Svg = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;

/** The sidebar (a drawer on phones), the top bar and the page area. */
export default function AppShell({ allowed, who, children }: { allowed: string[]; who: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const sideRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.classList.toggle("navopen", open);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); document.body.classList.remove("navopen"); };
  }, [open]);
  // The open drawer takes focus (the page behind it is inert), and closing it puts focus back on the menu button.
  useEffect(() => {
    if (open) sideRef.current?.querySelector<HTMLElement>("nav a")?.focus();
    else if (wasOpen.current) {
      const a = document.activeElement;
      if (!a || a === document.body || sideRef.current?.contains(a)) menuRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);
  // The drawer is only a drawer on narrow screens; widening the window closes it so the page doesn't stay inert.
  useEffect(() => {
    // The same query as the stylesheet's drawer rule, so a fractional width (browser zoom) can't fall between the two.
    const narrow = window.matchMedia("(max-width: 899px)");
    const close = () => { if (!narrow.matches) setOpen(false); };
    narrow.addEventListener("change", close);
    return () => narrow.removeEventListener("change", close);
  }, []);
  const labels: Record<string, string> = { dashboard: "Dashboard", timesheet: "Timesheet", "time-off": "Time off", approvals: "Approvals", reports: "Reports", clients: "Clients", projects: "Projects", people: "People", "import-export": "Import & export", settings: "Settings" };
  const link = (k: string, cls?: string) => {
    // The Timesheet link opens its Timer tab, and the Reports link opens this week only (a short range loads fast); the other ranges are on the page.
    const to = k === "timesheet" ? "/timesheet?view=timer" : k === "reports" ? "/reports?range=thisweek" : "/" + k;
    const t: Tab = { href: to, label: labels[k], icon: ICONS[ICON_FOR[k]] };
    const here = path.startsWith("/" + k) || (k === "timesheet" && path.startsWith("/calendar"));
    return <Link key={k} href={t.href} className={cls} aria-current={here ? "page" : undefined}><Svg d={t.icon} /><span>{t.label}</span></Link>;
  };
  // The skip link moves focus to the page itself (made focusable only for that moment), not just the Tab starting point.
  const skip = (e: React.MouseEvent) => {
    const m = document.getElementById("view");
    if (!m) return;
    e.preventDefault();
    m.tabIndex = -1;
    m.focus();
    m.addEventListener("blur", () => m.removeAttribute("tabindex"), { once: true });
  };
  const groups = GROUPS.map((g) => g.filter((k) => allowed.includes(k))).filter((g) => g.length);
  return (
    <>
      <a href="#view" className="skiplink" inert={open} onClick={skip}>Skip to main content</a>
      <div className="app">
        <aside ref={sideRef} className="side" id="side" aria-label="Menu"><div className="sidein">
          <div className="sbrand"><Logo id="logo-side" className="mark" /><span>The Time Sink</span>
            <button className="iconbtn sclose" aria-label="Close menu" onClick={() => setOpen(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>
          <nav className="snav" id="tabs" aria-label="Main">
            {groups.map((g, i) => <span key={i} style={{ display: "contents" }}>{i > 0 && <hr />}{g.map((k) => link(k))}</span>)}
            {allowed.includes("settings") && link("settings", "navend")}
          </nav>
        </div></aside>
        <div className="scrim" onClick={() => setOpen(false)} />
        <div className="main" id="mainc" inert={open}>
          <header className="top">
            <button ref={menuRef} className="menubtn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="side" onClick={() => setOpen(!open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
            <div className="tbrand"><Logo id="logo-top" className="mark" /><span>The Time Sink</span></div>
            <div className="who">{who}</div>
          </header>
          <main id="view" style={{ outline: "none" }}>{children}</main>
        </div>
      </div>
    </>
  );
}
