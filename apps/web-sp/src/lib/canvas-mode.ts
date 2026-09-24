/**
 * Exclusive canvas interaction (QA-19).
 *
 * Place, calibrate, measure, and the rail tools are one value. Contradictory
 * combinations are unrepresentable — that is the union carrying its weight.
 */

export type CalPoint = { x: number; y: number };

export type CanvasMode =
  | { readonly kind: "tool"; readonly tool: string }
  | { readonly kind: "place"; readonly packageId: string }
  | {
      readonly kind: "calibrate";
      readonly phase: "a" | "b" | "confirm";
      readonly points: readonly CalPoint[];
    }
  | {
      readonly kind: "measure";
      readonly points: readonly CalPoint[];
    };

export const SELECT_TOOL: CanvasMode = { kind: "tool", tool: "Select" };

export function dataToolOf(mode: CanvasMode): string {
  switch (mode.kind) {
    case "place":
      return "Place";
    case "calibrate":
      return "Calibrate";
    case "measure":
      return "Measure distance";
    case "tool":
      return mode.tool;
  }
}

/** What the tool rail shows as pressed. Place/calibrate sit on Select. */
export function railToolOf(mode: CanvasMode): string {
  if (mode.kind === "measure") return "Measure distance";
  return mode.kind === "tool" ? mode.tool : "Select";
}
