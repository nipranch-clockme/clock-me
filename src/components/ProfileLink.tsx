"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** The top-bar link to your own profile. It gets the "you are here" look while that page is open. */
export default function ProfileLink({ name, children }: { name: string; children: React.ReactNode }) {
  const path = usePathname();
  return <Link href="/profile" className="plink" title="My profile" aria-label={`${name}, my profile`} aria-current={path === "/profile" ? "page" : undefined}>{children}</Link>;
}
