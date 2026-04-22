import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Music Builder Pro — Visual Music Theory & AI Music Toolkit" },
      { name: "description", content: "Learn scales, generate riffs, navigate the circle of fifths, and analyze any track. Guitar + Piano." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" /> v1.0 — Studio Edition
          </div>
          <h1 className="max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Visual music theory.
            <br />
            <span className="text-gold">AI riffs.</span>{" "}
            <span className="text-muted-foreground">One toolkit.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            See scales on guitar and piano. Generate riffs in any key, genre, and difficulty. Decode any song with the audio analyzer. Built for players who want to <em className="text-foreground not-italic">understand</em> what they hear.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/scales"
              className="inline-flex items-center gap-2 rounded-md bg-gold px-5 py-3 text-sm font-semibold text-gold-foreground glow-gold transition-transform hover:scale-[1.02]"
            >
              Start exploring
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" />
              </svg>
            </Link>
            <Link
              to="/riffs"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-5 py-3 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              🎲 Inspire me
            </Link>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-gold">// Modules</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">Four pages, one workflow.</h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            to="/scales"
            kicker="01 — Theory"
            title="Scales & Theory"
            desc="Visualize scales, modes, chords, and arpeggios across guitar and piano. Click any note to play it."
          />
          <FeatureCard
            to="/riffs"
            kicker="02 — Generate"
            title="AI Riff Generator"
            desc="Deterministic riff generator with TAB output, tempo control, and difficulty-aware phrasing."
          />
          <FeatureCard
            to="/circle"
            kicker="03 — Navigate"
            title="Circle of Fifths"
            desc="Interactive circle showing relative keys, dominants, and subdominants. Click to jump anywhere."
          />
          <FeatureCard
            to="/analyzer"
            kicker="04 — Analyze"
            title="Audio Analyzer"
            desc="Upload an MP3 and detect key + chord progression with confidence scoring and chord-sheet fallback."
          />
        </div>
      </section>

      {/* Difficulty system */}
      <section className="border-t border-border/50 bg-card/20 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <p className="font-mono text-xs uppercase tracking-widest text-gold">// Difficulty layers</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">Layered to never overwhelm.</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Every scale, chord, riff, and fretboard shape is tagged. The UI hides what you don't need yet.</p>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Tier color="emerald" name="Easy" items={["Major / Minor", "Pentatonic", "3-4 basic chords", "1 fretboard shape"]} />
            <Tier color="amber" name="Intermediate" items={["Modes (Dorian, Mixolydian)", "Barre chords", "Multiple positions", "Basic arpeggios"]} />
            <Tier color="rose" name="Difficult" items={["Harmonic / Melodic minor", "7th chords + extensions", "Full neck mapping", "Advanced riffs"]} />
            <Tier color="fuchsia" name="Very Difficult" items={["Modal interchange", "Secondary dominants", "Exotic scales", "Sweep & advanced jazz"]} />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ to, kicker, title, desc }: { to: "/scales" | "/riffs" | "/circle" | "/analyzer"; kicker: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 p-5 transition-all hover:border-gold/50 hover:bg-card/70"
    >
      <div className="absolute -right-12 -top-12 h-24 w-24 rounded-full bg-gold/10 blur-2xl transition-opacity group-hover:opacity-100 opacity-0" />
      <p className="font-mono text-[10px] uppercase tracking-widest text-gold">{kicker}</p>
      <h3 className="mt-2 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-gold">
        Open <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

function Tier({ color, name, items }: { color: string; name: string; items: string[] }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400 border-emerald-400/40",
    amber: "text-amber-400 border-amber-400/40",
    rose: "text-rose-400 border-rose-400/40",
    fuchsia: "text-fuchsia-400 border-fuchsia-400/40",
  };
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-5">
      <div className={`inline-flex items-center gap-2 rounded-full border ${colorMap[color]} px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" /> {name}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-gold/60" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
