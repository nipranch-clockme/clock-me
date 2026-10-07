"use client";
import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";

/**
 * A GET form that re-runs the page as soon as any field changes.
 * With `manual`, only fields marked `data-auto` do that; the rest wait for the form's submit button.
 */
export default function AutoForm({ children, className, manual }: { children: React.ReactNode; className?: string; manual?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const go = (form: HTMLFormElement) => {
    const q = new URLSearchParams();
    new FormData(form).forEach((v, k) => { if (typeof v === "string" && v) q.append(k, v); });
    start(() => router.replace(`${path}?${q}`, { scroll: false }));
  };
  return (
    <form className={className} onChange={(e) => { if (!manual || (e.target as HTMLElement).closest("[data-auto]")) go(e.currentTarget); }}
      onSubmit={(e) => { e.preventDefault(); go(e.currentTarget); }} style={{ opacity: pending ? 0.7 : 1 }} aria-busy={pending}>
      {children}
    </form>
  );
}
