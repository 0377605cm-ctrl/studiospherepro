import { useAppState } from "@/lib/state";
import { ALL_KEY_NAMES, scalesByDifficulty, type Difficulty, type Genre, type Instrument, type ScaleId } from "@/lib/music/theory";

const DIFFICULTIES: { id: Difficulty; label: string; color: string }[] = [
  { id: "easy", label: "Easy", color: "text-emerald-400" },
  { id: "intermediate", label: "Intermediate", color: "text-amber-400" },
  { id: "difficult", label: "Difficult", color: "text-rose-400" },
  { id: "very-difficult", label: "Very Difficult", color: "text-fuchsia-400" },
];

const INSTRUMENTS: Instrument[] = ["guitar", "piano", "both"];
const GENRES: Genre[] = ["blues", "rock", "jazz", "rnb", "trap", "metal"];

interface Props {
  showScale?: boolean;
  showInstrument?: boolean;
  showGenre?: boolean;
  showDifficulty?: boolean;
}

export function GlobalControls({ showScale = true, showInstrument = true, showGenre = false, showDifficulty = true }: Props) {
  const s = useAppState();
  const scales = scalesByDifficulty(s.difficulty);

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Key">
          <select
            value={s.rootKey}
            onChange={(e) => s.setRootKey(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:border-gold focus:outline-none"
          >
            {ALL_KEY_NAMES.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </Field>

        {showScale && (
          <Field label="Scale / Mode">
            <select
              value={s.scaleId}
              onChange={(e) => s.setScaleId(e.target.value as ScaleId)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:border-gold focus:outline-none"
            >
              {scales.map((sc) => (
                <option key={sc.id} value={sc.id}>{sc.name}</option>
              ))}
            </select>
          </Field>
        )}

        {showInstrument && (
          <Field label="Instrument">
            <div className="flex gap-1 rounded-md border border-border bg-background p-1">
              {INSTRUMENTS.map((i) => (
                <button
                  key={i}
                  onClick={() => s.setInstrument(i)}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                    s.instrument === i ? "bg-gold text-gold-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </Field>
        )}

        {showGenre && (
          <Field label="Genre">
            <select
              value={s.genre}
              onChange={(e) => s.setGenre(e.target.value as Genre)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:border-gold focus:outline-none"
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>{g.toUpperCase()}</option>
              ))}
            </select>
          </Field>
        )}

        {showDifficulty && (
          <Field label="Difficulty">
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => s.setDifficulty(d.id)}
                  className={`rounded px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                    s.difficulty === d.id ? "bg-secondary text-foreground" : `${d.color} hover:bg-secondary/60`
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}