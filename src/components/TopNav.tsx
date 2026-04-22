import { Link } from "@tanstack/react-router";

const links = [
  { to: "/", label: "Home" },
  { to: "/scales", label: "Scales & Theory" },
  { to: "/riffs", label: "Riff Generator" },
  { to: "/circle", label: "Circle of Fifths" },
  { to: "/analyzer", label: "Audio Analyzer" },
] as const;

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="group flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-gold/40 bg-gradient-to-br from-gold/20 to-transparent">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-gold" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">
              Music Builder <span className="text-gold">Pro</span>
            </span>
            <span className="hidden text-[10px] font-mono uppercase tracking-widest text-muted-foreground sm:block">
              Music Theory · AI · Toolkit
            </span>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/" }}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-gold"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <details className="relative lg:hidden">
          <summary className="list-none rounded-md border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground cursor-pointer">
            Menu
          </summary>
          <div className="absolute right-0 mt-2 w-56 rounded-lg border border-border bg-popover p-2 shadow-xl">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                activeOptions={{ exact: l.to === "/" }}
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground data-[status=active]:text-gold"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </header>
  );
}