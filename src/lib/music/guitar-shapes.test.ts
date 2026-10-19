import { describe, expect, test } from "bun:test";
import { guitarShape } from "./guitar-shapes";
import { CHORD_FORMULAS } from "./theory";

describe("suggested progression guitar fingerings", () => {
  test("C major shows its open six-string grip with muted low E", () => {
    expect(guitarShape(0, "maj").frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(guitarShape(0, "maj").fingers).toEqual([0, 3, 2, 0, 1, 0]);
  });
  test("every transposed shape contains exactly its chord tones and stays in its fret window", () => {
    for (let root = 0; root < 12; root++) {
      for (const type of Object.keys(CHORD_FORMULAS)) {
        const shape = guitarShape(root, type);
        const expected = [...new Set(CHORD_FORMULAS[type].intervals.map((i) => (root + i) % 12))].sort();
        expect([...new Set(shape.midis.map((m) => m % 12))].sort()).toEqual(expected);
        expect(shape.frets).toHaveLength(6);
        for (const fret of shape.frets) {
          if (fret === null || fret === 0) continue;
          expect(fret).toBeGreaterThanOrEqual(shape.startFret);
          expect(fret).toBeLessThan(shape.startFret + 5);
        }
      }
    }
  });
});