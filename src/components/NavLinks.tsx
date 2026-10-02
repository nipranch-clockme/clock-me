"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ tabs }: { tabs: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Main">
      {tabs.map(([href, label]) => (
        <Link key={href} href={"/" + href} className="nav-link" aria-current={path.startsWith("/" + href) ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
