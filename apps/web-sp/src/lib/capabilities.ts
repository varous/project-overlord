/**
 * Capability flags — the mechanism that makes the MVP a strict SUBSET of the
 * final product rather than a different app.
 *
 * The requirement, verbatim from the brief: "The UI in the MVP and the UI in
 * the final version, when 3D capability comes on, cannot be drastically
 * different, including the layout and placement of things."
 *
 * So the rule here is stronger than "hide what we haven't built":
 *
 *   EVERY slot in the V2 shell exists in the DOM at its designed position,
 *   in every build. A capability that is off renders its control DISABLED
 *   IN PLACE — never removed, never collapsed, never reflowed around.
 *
 * Turning `threeD` on must change what controls DO, and nothing about where
 * anything IS. If a layout shifts when a flag flips, that is a bug, and
 * `EditorShell.reference.test` is there to catch it.
 */
export interface Capabilities {
  /** 3D viewport, view cube, primitives toolbar, working planes. Phase 6. */
  threeD: boolean;
  /** Push/Pull and solid modelling mode groups in the mode bar. Phase 6. */
  solidModelling: boolean;
  /** Full snapping set (4 extra toggles). Grid + object sit on `snapping`. */
  advancedSnapping: boolean;
  /**
   * Grid + object snap. Off in the MVP until an engine exists (QA-21) —
   * an enabled control that does nothing is the QA-16 lie.
   */
  snapping: boolean;
  /** Saved views, class system, plane selection. Phase 2+. */
  cadOrganisation: boolean;
  /** Command palette behind the Quick Search field. Phase 2. */
  commandPalette: boolean;
  /** Real-time multi-user presence (the avatar stack). Phase 6. */
  presence: boolean;
  /** The BOQ mode and its derivation. Phase 0 — this is the product. */
  boq: boolean;
  /** Application menus (File/Edit/View/...). Not built. Slots reserved. */
  appMenus: boolean;
  /** Client share links + roles. Slice 8. */
  sharing: boolean;
  /**
   * Fit-to-window, grid, rulers, page boundary. Off until those actually
   * draw or the camera moves — an enabled Fit that does nothing is QA-16.
   */
  drawingAids: boolean;
}

/** What the MVP ships. Everything 3D-shaped is off, and visibly reserved. */
export const MVP: Capabilities = {
  threeD: false,
  solidModelling: false,
  advancedSnapping: false,
  snapping: false,
  cadOrganisation: false,
  commandPalette: false,
  presence: false,
  boq: true,
  appMenus: false,
  sharing: false,
  drawingAids: false,
};

/** The designed end state. Used by the /_reference route (DEV only, ADR-008). */
export const FULL: Capabilities = {
  threeD: true,
  solidModelling: true,
  advancedSnapping: true,
  snapping: true,
  cadOrganisation: true,
  commandPalette: true,
  presence: true,
  boq: true,
  appMenus: true,
  sharing: true,
  drawingAids: true,
};

/**
 * Why a control is disabled, shown in its tooltip. Being honest with the user
 * about "not yet" beats a dead button with no explanation.
 */
export const NOT_YET = "Arrives with 3D support in a later release";
export const SNAP_NOT_YET = "Snapping is not built yet";
export const AIDS_NOT_YET = "Fit, grid and guides are not built yet";
export const ZONES_NOT_YET = "Zones are not built yet";
export const SCALE_FIRST = "Set scale before measuring";
export const AREA_LATER = "Area measure follows in a later pass";
