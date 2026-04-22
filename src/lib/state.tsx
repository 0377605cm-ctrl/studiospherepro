import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Difficulty, Genre, Instrument, ScaleId } from "./music/theory";

interface AppState {
  rootKey: string;
  scaleId: ScaleId;
  instrument: Instrument;
  genre: Genre;
  difficulty: Difficulty;
  setRootKey: (k: string) => void;
  setScaleId: (s: ScaleId) => void;
  setInstrument: (i: Instrument) => void;
  setGenre: (g: Genre) => void;
  setDifficulty: (d: Difficulty) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [rootKey, setRootKey] = useState("A");
  const [scaleId, setScaleId] = useState<ScaleId>("minor");
  const [instrument, setInstrument] = useState<Instrument>("both");
  const [genre, setGenre] = useState<Genre>("rock");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");

  const value = useMemo(
    () => ({ rootKey, scaleId, instrument, genre, difficulty, setRootKey, setScaleId, setInstrument, setGenre, setDifficulty }),
    [rootKey, scaleId, instrument, genre, difficulty],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used inside AppStateProvider");
  return v;
}