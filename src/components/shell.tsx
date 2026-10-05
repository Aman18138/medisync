import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-md bg-nuit text-canvas">
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M10 2h4v6h6v4h-6v10h-4V12H4V8h6z" />
        </svg>
      </span>
      <span className={`brand-title text-canvas ${compact ? "text-lg" : "text-xl"}`}>
        Medi<span className="text-spring">Sync</span>
      </span>
    </Link>
  );
}

export function PortalShell({
  title,
  subtitle,
  nav,
  children,
}: {
  title: string;
  subtitle: string;
  nav: { label: string; id: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="hidden w-72 shrink-0 flex-col bg-navy p-7 lg:flex">
        <BrandLogo compact />
        <p className="clinical-data mt-9 text-canvas/45">NAVIGATION</p>
        <nav className="mt-3 flex flex-col gap-2">
          {nav.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="clinical-label rounded-lg px-4 py-2.5 text-canvas/70 transition-colors hover:bg-nuit hover:text-canvas"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto space-y-2 pt-8">
          <Link
            to="/"
            className="clinical-label block rounded-lg border border-canvas/20 px-4 py-2.5 text-center text-canvas/75 hover:border-spring hover:text-spring"
          >
            ← Master Gateway
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="border-b border-navy/10 bg-white px-4 py-5 sm:px-8 lg:px-8">
          <div className="lg:hidden">
            <div className="mb-4 flex items-center justify-between gap-3">
              <BrandLogo compact />
              <Link
                to="/"
                className="clinical-label rounded-lg border border-navy/15 px-3 py-1.5 text-navy hover:border-spring hover:text-spring"
              >
                Gateway
              </Link>
            </div>
            <nav className="-mx-1 flex gap-2 overflow-x-auto pb-1">
              {nav.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="clinical-label shrink-0 rounded-lg border border-navy/10 bg-canvas px-3 py-2 text-navy/70"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <h1 className="brand-title text-2xl text-navy">{title}</h1>
          <p className="clinical-data mt-1 text-navy/55">{subtitle}</p>
        </header>
        <div className="mx-auto max-w-[1200px] space-y-8 p-8">{children}</div>
      </main>
    </div>
  );
}

export function SectionCard({
  title,
  eyebrow,
  children,
  id,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="card-elevated p-7">
      {eyebrow && <p className="clinical-data text-nuit/80">{eyebrow}</p>}
      <h2 className="brand-title text-lg text-navy">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}
