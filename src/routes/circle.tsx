import { createFileRoute } from "@tanstack/react-router";
import { useAppState } from "@/lib/state";
import {
  CIRCLE_OF_FIFTHS_MAJOR,
  CIRCLE_OF_FIFTHS_MINOR,
  relativeMinor,
  dominant,
  subdominant,
  noteToPc,
} from "@/lib/music/theory";
import { Card, PageHeader } from "./scales";
import { GlobalControls } from "@/components/GlobalControls";

export const Route = createFileRoute("/circle")({
  head: () => ({
    meta: [
      { title: "Circle of Fifths — Chris goes: Pro" },
      { name: "description", content: "Interactive circle of fifths. See key relationships, dominants, subdominants, and relative minors." },
    ],
  }),
  component: CirclePage,
});

function CirclePage() {
  const { rootKey, setRootKey, scaleId, setScaleId } = useAppState();
  const isMinorMode = scaleId === "minor" || scaleId === "harmonic_minor" || scaleId === "melodic_minor";
  const selectedIdx = (isMinorMode ? CIRCLE_OF_FIFTHS_MINOR : CIRCLE_OF_FIFTHS_MAJOR).findIndex(
    (k) => noteToPc(k) === noteToPc(rootKey),
  );

  const dom = dominant(rootKey);
  const sub = subdominant(rootKey);
  const rel = isMinorMode
    ? CIRCLE_OF_FIFTHS_MAJOR[selectedIdx === -1 ? 0 : selectedIdx]
    : relativeMinor(rootKey);

  const size = 480;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 220;
  const innerR = 140;
  const slice = (2 * Math.PI) / 12;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        kicker="03 — Navigate"
        title="Circle of Fifths"
        sub={`${rootKey} · ${isMinorMode ? "Minor mode" : "Major mode"}`}
      />

      <GlobalControls showInstrument={false} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="flex justify-center">
            <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[520px]">
              <defs>
                <radialGradient id="cof-bg" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="oklch(0.18 0.02 85)" />
                  <stop offset="100%" stopColor="oklch(0.14 0.005 60)" />
                </radialGradient>
              </defs>
              <circle cx={cx} cy={cy} r={outerR + 8} fill="url(#cof-bg)" stroke="oklch(0.78 0.13 85 / 0.2)" />
              {/* Major ring */}
              {CIRCLE_OF_FIFTHS_MAJOR.map((key, i) => {
                const angle = i * slice - Math.PI / 2;
                const x1 = cx + Math.cos(angle - slice / 2) * outerR;
                const y1 = cy + Math.sin(angle - slice / 2) * outerR;
                const x2 = cx + Math.cos(angle + slice / 2) * outerR;
                const y2 = cy + Math.sin(angle + slice / 2) * outerR;
                const x1i = cx + Math.cos(angle - slice / 2) * innerR;
                const y1i = cy + Math.sin(angle - slice / 2) * innerR;
                const x2i = cx + Math.cos(angle + slice / 2) * innerR;
                const y2i = cy + Math.sin(angle + slice / 2) * innerR;
                const isSelected = !isMinorMode && noteToPc(key) === noteToPc(rootKey);
                const isDom = noteToPc(key) === noteToPc(dom);
                const isSub = noteToPc(key) === noteToPc(sub);
                const isRel = !isMinorMode && noteToPc(key) === noteToPc(rel);
                let fill = "oklch(0.18 0.006 60)";
                if (isSelected) fill = "oklch(0.78 0.13 85)";
                else if (isDom) fill = "oklch(0.4 0.08 85)";
                else if (isSub) fill = "oklch(0.35 0.06 200)";
                else if (isRel) fill = "oklch(0.3 0.04 320)";
                const tx = cx + Math.cos(angle) * ((outerR + innerR) / 2);
                const ty = cy + Math.sin(angle) * ((outerR + innerR) / 2);
                return (
                  <g key={`maj-${i}`} className="cursor-pointer" onClick={() => setRootKey(key)}>
                    <path
                      d={`M ${x1i} ${y1i} L ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x2i} ${y2i} A ${innerR} ${innerR} 0 0 0 ${x1i} ${y1i} Z`}
                      fill={fill}
                      stroke="oklch(0.28 0.008 60)"
                      strokeWidth={1}
                      className="transition-colors hover:fill-[oklch(0.3_0.06_85)]"
                    />
                    <text x={tx} y={ty + 5} textAnchor="middle" className="select-none" fill={isSelected ? "oklch(0.14 0 0)" : "oklch(0.96 0 0)"} fontSize={20} fontWeight={600} fontFamily="Space Grotesk">
                      {key}
                    </text>
                  </g>
                );
              })}
              {/* Minor inner ring */}
              {CIRCLE_OF_FIFTHS_MINOR.map((key, i) => {
                const angle = i * slice - Math.PI / 2;
                const innerInnerR = 70;
                const x1 = cx + Math.cos(angle - slice / 2) * innerR;
                const y1 = cy + Math.sin(angle - slice / 2) * innerR;
                const x2 = cx + Math.cos(angle + slice / 2) * innerR;
                const y2 = cy + Math.sin(angle + slice / 2) * innerR;
                const x1i = cx + Math.cos(angle - slice / 2) * innerInnerR;
                const y1i = cy + Math.sin(angle - slice / 2) * innerInnerR;
                const x2i = cx + Math.cos(angle + slice / 2) * innerInnerR;
                const y2i = cy + Math.sin(angle + slice / 2) * innerInnerR;
                const isSelected = isMinorMode && noteToPc(key) === noteToPc(rootKey);
                const tx = cx + Math.cos(angle) * ((innerR + innerInnerR) / 2);
                const ty = cy + Math.sin(angle) * ((innerR + innerInnerR) / 2);
                return (
                  <g
                    key={`min-${i}`}
                    className="cursor-pointer"
                    onClick={() => {
                      setRootKey(key);
                      if (!isMinorMode) setScaleId("minor");
                    }}
                  >
                    <path
                      d={`M ${x1i} ${y1i} L ${x1} ${y1} A ${innerR} ${innerR} 0 0 1 ${x2} ${y2} L ${x2i} ${y2i} A ${innerInnerR} ${innerInnerR} 0 0 0 ${x1i} ${y1i} Z`}
                      fill={isSelected ? "oklch(0.78 0.13 85)" : "oklch(0.22 0.008 60)"}
                      stroke="oklch(0.28 0.008 60)"
                      strokeWidth={1}
                      className="transition-colors hover:fill-[oklch(0.3_0.06_85)]"
                    />
                    <text x={tx} y={ty + 4} textAnchor="middle" className="select-none" fill={isSelected ? "oklch(0.14 0 0)" : "oklch(0.7 0 0)"} fontSize={13} fontWeight={500} fontFamily="JetBrains Mono">
                      {key}m
                    </text>
                  </g>
                );
              })}
              {/* center */}
              <circle cx={cx} cy={cy} r={68} fill="oklch(0.16 0.006 60)" stroke="oklch(0.78 0.13 85 / 0.3)" />
              <text x={cx} y={cy - 4} textAnchor="middle" fill="oklch(0.78 0.13 85)" fontSize={11} fontFamily="JetBrains Mono">
                CIRCLE OF
              </text>
              <text x={cx} y={cy + 14} textAnchor="middle" fill="oklch(0.78 0.13 85)" fontSize={11} fontFamily="JetBrains Mono">
                FIFTHS
              </text>
            </svg>
          </div>
        </Card>

        <div className="space-y-4">
          <Card kicker="// Selected">
            <div className="text-3xl font-bold tracking-tight text-gold">{rootKey}</div>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {isMinorMode ? "Minor" : "Major"} key
            </div>
          </Card>
          <Card kicker="// Relationships">
            <Relationship label="Dominant (V)" value={dom} hint="A 5th up — strong tension" />
            <Relationship label="Subdominant (IV)" value={sub} hint="A 4th up — soft motion" />
            <Relationship label={isMinorMode ? "Relative major" : "Relative minor"} value={rel} hint="Same notes, different home" />
          </Card>
          <Card kicker="// Tip">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Click any key on the wheel to jump there. The outer ring is major; the inner ring is minor.
              Adjacent keys share most notes — perfect for modulation.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Relationship({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      </div>
      <div className="font-mono text-2xl font-semibold text-gold">{value}</div>
    </div>
  );
}