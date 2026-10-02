"use client";
import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";

/** A GET form that re-runs the page as soon as any field changes. */
export default function AutoForm({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const go = (form: HTMLFormElement) => {
    const q = new URLSearchParams();
    new FormData(form).forEach((v, k) => { if (typeof v === "string" && v) q.set(k, v); });
    start(() => router.replace(`${path}?${q}`, { scroll: false }));
  };
  return (
    <form className={className} onChange={(e) => go(e.currentTarget)} onSubmit={(e) => { e.preventDefault(); go(e.currentTarget); }} style={{ opacity: pending ? 0.7 : 1 }} aria-busy={pending}>
      {children}
    </form>
  );
}
