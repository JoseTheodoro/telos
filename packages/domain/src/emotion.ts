// #8 Curva de emoção: como a pessoa se sente em cada cena (−2…+2) e a dor (pain point).
import type { Scene, Workspace } from "./types.ts";

export interface EmotionLevel {
  value: number;
  face: string;
  label: string;
}

/** De cima para baixo (+2 no topo da curva). */
export const EMOTION_LEVELS: EmotionLevel[] = [
  { value: 2, face: "😀", label: "Muito bom" },
  { value: 1, face: "🙂", label: "Bom" },
  { value: 0, face: "😐", label: "Neutro" },
  { value: -1, face: "🙁", label: "Ruim" },
  { value: -2, face: "😣", label: "Muito ruim" },
];

export const EMOTION_MIN = -2;
export const EMOTION_MAX = 2;

export const clampEmotion = (v: number): number => Math.max(EMOTION_MIN, Math.min(EMOTION_MAX, Math.round(v)));

export const hasEmotion = (s: Scene | undefined): s is Scene & { emotion: number } =>
  typeof s?.emotion === "number" && Number.isFinite(s.emotion);

export const emotionLevel = (v: number): EmotionLevel => EMOTION_LEVELS.find((l) => l.value === clampEmotion(v)) ?? EMOTION_LEVELS[2];

/** "+2", "0", "−1" (sinal tipográfico, para o rótulo). */
export const emotionSigned = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

/** Normaliza notas vindas de JSON antigo/importado (inteiro entre −2 e +2, ou sem nota). */
export function upgradeEmotion(ws: Workspace): void {
  for (const s of ws.scenes as Scene[]) {
    if (s.emotion === undefined || s.emotion === null) {
      delete s.emotion;
      continue;
    }
    const n = Number(s.emotion);
    if (Number.isFinite(n)) s.emotion = clampEmotion(n);
    else delete s.emotion;
  }
}
