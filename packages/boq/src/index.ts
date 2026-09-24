/**
 * @overlord/boq — the BOQ domain rules, as pure functions.
 *
 * Hard constraint: this package has ZERO runtime dependencies and imports
 * nothing from apps/ or web/. It must survive a rewrite of either. The ESLint
 * import boundary in eslint.config.js enforces this, not good intentions.
 * See docs/showplan/02-architecture-and-stack.md ADR-002.
 *
 * Money is never computed here. Rates belong to QuoteOS through
 * contracts/quote/v1. See AGENTS.md rule 7.
 */

export * from "./units.js";
export * from "./geometry.js";
export * from "./scale.js";
export * from "./export-gate.js";
export * from "./measurement.js";

/* The BOQ engine — the data contract in ClockworkAV_BOQ_seed_v1. */
export * from "./catalog.js";
export * from "./findings.js";
export * from "./days.js";
export * from "./instances.js";
export * from "./show-items.js";
export * from "./boq.js";
export * from "./load.js";
