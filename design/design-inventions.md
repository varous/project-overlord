# Design inventions log

Everything on this page was **built without a design**, because the handoff
digest marks it `NOT PRESENT`. It exists so the Figma session can formalise
these and we can re-ingest the result rather than discovering divergence later.

**How to read this:** each entry says what was built, which existing tokens and
components it reuses, and — the important column — **what is genuinely new** and
therefore needs a designer's decision rather than my judgement.

Status key: 🟡 built, awaiting design · 🔵 designed by me, low risk · 🔴 needs a
designer before it ships to a client

---

## 1. Capability gating of the V2 chrome 🔵

**Why:** the MVP has no 3D, but the brief requires that "the UI in the MVP and
the UI in the final version cannot be drastically different, including the
layout and placement of things."

**What was built:** `lib/capabilities.ts`. Every slot in the V2 shell renders in
every build at its designed position; a control whose capability is off renders
**disabled in place** with the tooltip *"Arrives with 3D support in a later
release."* Nothing is removed, collapsed, or reflowed around.

Verified: `/` (MVP) and `/_reference` (all capabilities on) produce **identical**
band and panel dimensions — 40 / 44 / 36 / 32, left 296, rail 48, right 300.
At 1366 × 768 only the canvas shrinks, to 770 × 616.

**Reserved-in-place today:** 3D segment · Flyover · Line/Circle/Polygon/Eyedropper
tools · the entire primitives toolbar · 3D Modeling tool grid · Z / Height /
working-plane fields · all six snapping toggles (QA-21: grid + object were
enabled no-ops) · Quick Search palette · the multi-user avatar stack.

**New and needs a decision:** the disabled treatment itself. I used `opacity .38`
plus `cursor: not-allowed`, because the design has **no disabled state for any
component** (digest §8). A reserved-for-later control arguably deserves a
different, more deliberate treatment than a merely-unavailable one.

## 2. Mode bar repurposed as the tool context bar 🔵

**Why:** in V2 this 36px band carries Push/Pull and working-plane modes, which
have no meaning in a 2D site plan — but the band must stay, at that height, in
that position.

**What was built:** same band, same height, carrying the **active tool's context**
— its name and its instruction line (*"Click to place points · Esc to finish"*),
plus the Quick Preferences group on the right exactly as designed. When
`solidModelling` turns on, the mode groups appear here and the context line
moves beside them. Same band, same role: what the current tool is doing.

**New:** nothing visual — reuses `Segmented`, `IconButton`, and the existing
`.modebar` class. Only the *content* is new.

## 3. Uncalibrated state 🔴

**Why:** digest §3.5 marks both "Scale calibration" and "Uncalibrated warning
state" as `NOT PRESENT`, and this is the highest-risk gap in the project. Every
quantity and every rupee downstream is a multiple of the scale.

**What was built (slice 3):**
- Three map states: **no map** (legitimate, no Uncalibrated badge) · **map
  present uncalibrated** (orange badge + warning banner + measure tools
  disabled) · **calibrated** (scale readout + on-canvas scale bar)
- `.app-shell.is-uncalibrated` disables `data-requires-scale="true"` controls
- Calibration flow in the mode bar: click A → click B → typed distance + unit →
  confirm panel always shows *"This plan would be about N m wide"* · soft warn
  + Use anyway for implausible implied width · Esc cancels
- Replace plan confirms destructive clear of calibration
- PDF: rasterise page 1 client-side; note *"Using page 1 of N"* when multipage
- New `.banner` / `.banner--warning` / `.banner--danger` (existing) + plain
  Upload/Replace/Set scale `Button`s in the viewbar (no new chrome dimensions)

**New and needs a designer:**
- Calibration confirm chrome (now a non-blocking `role=dialog` named “Set scale”
  after QA-18 — still an invention, still replaceable)
- Persistent uncalibrated banner vs status-only
- Implausible-scale treatment
- Upload progress / error affordances
- Page-note chip on the canvas

## 4. Numeric emphasis rule 🔵

**Why:** digest §8 reports `--text-secondary` at ~3.9:1 and `--text-tertiary` at
~2.2:1, both failing WCAG AA at the 10–12px sizes they're used at, and notes
ad-hoc 8.5–9.5px sizes.

**What was built:** a `.numeric` class — 12.5px, weight 500, `--text-primary`,
tabular figures, monospace. Applied to every quantity, rate, amount, coordinate
and dimension field. `--text-tertiary` is now restricted to placeholders via
`.is-placeholder`.

**Rationale worth a designer's agreement:** a salesperson reads these numbers
aloud to a client on a call. A misread quantity is a commercial error, so
numbers are never small and never grey. This is a deliberate departure from the
mocks' micro type in data contexts.

## 5. Focus-visible across the board 🔵

**Why:** digest §8 — "only `Input` has a designed focus."

**What was built:** one ink ring (`box-shadow: 0 0 0 1.5px var(--accent-default)`)
on `:focus-visible` for every interactive class, matching the Input treatment.
Inside `.canvas` the ring switches to `--selection` so it can't be confused with
chrome emphasis.

**New:** nothing — extends the existing Input pattern to 13 more components.

## 6. 24px minimum hit targets 🔵

**Why:** digest §8 — mode-bar 26px, snapping 22px, RM view toggle 18px are below
WCAG 2.5.8.

**What was built:** a `.hit-24` class that grows the *hit area* via `::after`
while leaving the drawn box exactly as designed. Visual fidelity preserved,
accessibility fixed.

## 7. Icon colour normalisation 🔵

**Why:** digest §8 — three competing icon greys (`#5B6470`, `#8A9099`,
`#4A4C50`) hardcoded across the SVGs.

**What was built:** all 73 SVGs rewritten to `currentColor`; colour comes from
`.icon` / `.icon--secondary` / `.icon--on-accent`. A rebrand is now a token
change, not a sweep through 73 files.

**Also fixed, and the design session should know:** **57 of the 73 SVGs in
`icons.zip` were truncated** — the final element was missing its closing `/>`,
so they failed XML parsing and broke the build. Repaired in place, all 73 now
parse. Worth checking the export step that produced them.

## 8. Select menus use the native control 🟡

**Why:** digest §5 — `Select` is "visual only — menu NOT PRESENT".

**What was built:** the designed trigger wrapping a native `<select>`, with the
browser's chevron suppressed so only the designed one shows. Native gives
correct keyboard and screen-reader behaviour for free.

**Needs design:** the open menu — item, hover, selected, checkmark, separator,
grouped headings, and the scroll behaviour for the catalogue's hundreds of
items. Until it exists we cannot build the combobox-with-search the catalogue
palette actually needs.

## 9. Empty state for the canvas 🟡

**What was built:** centred title, body, and two actions — *Upload venue plan*
(primary) and *Start from a template* (ghost) — using existing `.btn` classes.
This is the first screen a user ever sees, so it does the teaching: it states
that scale must be set and why measurements stay disabled.

**Needs design:** digest §5 marks `empty state` as `NOT PRESENT` as a primitive.
Mine is bespoke. Also needs: the dropzone treatment for drag-and-drop, and the
hover/active states for a drag over the canvas.

## 10. Scroll containers 🔵

**Why:** digest §8 — "reflow below 1728 is asserted in CSS but never designed",
and no scrollbar appears anywhere in the mocks despite 928px panels with far
less content. The catalogue palette will overflow on day one.

**What was built:** a `.scroll-y` class with a hairline `--border-default` thumb
on both panels.

---

## Still owed by design, in the order I need them

This mirrors digest §9's own list, reordered by what blocks the build:

1. **Scale calibration flow + the uncalibrated banner** — blocks slice 3. Highest risk in the project
2. **Table / data grid + the BOQ view**, including the manual-override row treatment — blocks slice 6/7. The entire commercial half of the product has no design
3. **Modal / dialog primitive** — needed by calibration confirm, export, and share
4. **File dropzone** — blocks slice 3
5. **Combobox with search + the open Select menu** — the catalogue is hundreds of items, not six
6. **Toast, loading, error states** — needed the moment anything is saved or exported
7. **Number input with a unit suffix and stepper** — the inspector is entirely made of these
8. **Event-domain icons.** The 73 delivered icons are architectural — Wall, Door, Roof, Stair, Chair, Sofa. We need stage, truss, barricade, generator, cable ramp, food counter, box office, toilet block, green room, marquee, LED wall, speaker array, parking, fire point. Roughly 20–30 icons in the same style. **This is the cheapest high-value thing the design session could do next**, and right now the catalogue palette is borrowing wrong metaphors
9. ~~Projects dashboard~~ → see §12
10. Share / permissions dialog
11. Right-click context menu
12. Dark variant of V2 (never made — currently derived from the token modes, which works, but was not art-directed)

---

## 11. Sign-in screen 🟡

**Why:** slice 1 (Google OIDC). Digest lists sign-in with the projects dashboard as
owed; there is no designed login surface.

**What was built:** centred card on `--bg-app`, product name via `.title` (uses
`--type-title`), one primary `Button` ("Sign in with Google"), error line for
`hd_rejected`. Existing tokens and `Button` only — no new CSS variables.

**Needs design:** brand treatment, illustration/empty atmosphere, and whether the
error copy should name the domain explicitly.

---

## 12. Projects dashboard 🟡

**Why:** slice 2. No Figma screen. Must read as the same app as `EditorShell`.

**What was built:**
- Same `menubar` (40px) + `--bg-app` + `.title` type scale as the editor
- Create form: **name only** → POST then navigate straight to `/projects/:id`
  (dashboard is for *resume*, not a stop on the way to start)
- List rows: open + Archive (no delete, no search, no duplicate)
- Empty state: one orientation line + the create form already on screen as the
  primary action
- Existing tokens / `Button` / `Field` / `Icon` only — no new CSS variables

**Needs design:** row density, archive confirmation pattern (currently
`Modal` invention — was `window.confirm`), and whether archived projects get a
dedicated view.

---

## 13. Base-map upload + calibrate (slice 3) 🟡

**Why:** F3/F4; digest marks scale calibration NOT PRESENT.

**What was built (replaceably, tokens only):**
- Viewbar: Upload plan / Replace plan / Set scale / Recalibrate via existing
  `Button`
- Canvas empty state copy for **no map** (count-only OK)
- Mode-bar confirm: `Field` + `Select` + Confirm / Use anyway / Cancel
- Canvas page note (`.canvas__page-note`) for multipage PDFs
- Replace warning via invented `Modal` (not `window.confirm`)

**Needs design:** dropzone drag states, progress UI, calibration handles,
confirm dialog, and page-picker later (deferred; we only annotate page 1).

---

## 14. Modal / dialog primitive 🟡

**Why:** digest checklist marks modal/dialog **NOT PRESENT**. Native
`window.confirm` was used for replace-plan and archive — unstyleable,
"localhost says", blocks the page.

**What was built:** `Modal` in `primitives.tsx` + `.modal*` in `overrides.css`.
Tokens only (`--bg-panel`, `--shadow-lg`, `--type-title`, panel width sum).
Backdrop dismiss + Escape. Used for replace-plan and archive.

**Needs design:** real dialog chrome, focus trap, sizes, danger emphasis.

---

## 15. Package palette + kit inspector (slice 4) 🟡

**Why:** digest has an Assets panel of *items*, not packages. There is no kit
line list, no blast-radius readout, no unquantifiable quantity mark.

**What was built (replaceably, tokens only):**
- Assets tab lists `GET /api/catalogue/packages` via existing `AssetCard` + `Search`
- Canvas `Rect` placements (selection blue, as canvas-only)
- Inspector: Instance title, "N placements use this kit", flag badges
  (Required / Included / Optional) using existing `Badge`, quantity "—" +
  Unquantifiable badge when uncalibrated PER_AREA / PER_LENGTH
- `.kit-lines` in `overrides.css`

**Needs design:** package tile, kit-line row, blast-radius treatment, the
unquantifiable mark. Do not invest in making these beautiful.

---

## 16. Distance measurement overlay (slice 5) 🟡

**Why:** digest marks dimension / measure interaction NOT PRESENT. Slice 5 is a
live readout on the plan, not a quantity tool.

**What was built (replaceably, tokens only):**
- Rail: Measure distance → `CanvasMode` `{ kind: "measure" }`. Measure area
  stays in the slot, disabled, tooltip *"Area measure follows in a later pass"*
  (or *"Set scale before measuring"* when uncalibrated)
- In-progress stroke uses `--selection` (construction, same as calibrate).
  Committed marks use `--text-primary` (ink), same family as the scale bar —
  so three jobs do not share one blue
- Inspector eyebrow **Measurement**, dual-unit `.numeric` label (cross-check),
  danger **Delete measurement** (plus Backspace). Canvas mark is the
  calibration unit only — dual on the drawing would jump when selected.
  Copy: *"Informational — not a quote line."* No kit, no qty, no amount
- Uncalibrated: tools disabled in place with *"Set scale before measuring"*
  (CSS no longer uses `pointer-events: none`, so the tooltip is reachable)

**Needs design:** committed vs in-progress stroke, label placement on a busy
plan, delete treatment in the inspector.

---

## 17. App menu dropdowns 🟡

**Why:** digest names the nine V2 menus (`File Edit View Modify Model Tools Text
Window Help`) and nothing inside them. Context menu is listed NOT PRESENT;
these dropdowns are the same gap.

**What was built (replaceably, tokens only):** `@radix-ui/react-menubar` with
existing `.menubar__menu` on Trigger. Content/Item in `overrides.css` using
`--bg-panel`, `--border-default`, `--shadow-lg`, `--radius-sm`,
`--text-primary`, `--bg-panel-alt`, `--accent-soft`. Item labels are reserved
placeholders (New / Open… / Export… on File, and two items on every other
menu). `onSelect` is a no-op until a slice owns the command. Capability flag
`appMenus` keeps every trigger and item **rendered and disabled** in the MVP.

**Needs design:** the real menu contents, separators, shortcuts, and whether
the salesperson-facing MVP should keep a CAD menubar at all (`docs/12` said
replace it with a slim project bar — the slots stayed because of the subset
rule).

---

## 18. View-bar dropdown menus 🟡

**Why:** digest draws the select *chip*; the open menu was NOT PRESENT (native
`<select>` was the stopgap). ADR-007 migrates view-bar selects to Radix
DropdownMenu. Calibration unit picker stays native — do not fold it into this.

**What was built:** `DropdownSelect` — `.select` on Trigger, portaled Content
sharing the menubar dropdown tokens. Saved Views has a second reserved item
("None") so keyboard arrowing can be proven on `/_reference`. CAD selects
(View / Zone / Level / Plane) are disabled in the MVP (`cadOrganisation`).
2D/3D and theme use ToggleGroup behind existing `.seg` / `.seg__item`.

**Needs design:** the open-menu treatment (we reused the menubar dropdown),
and whether Saved Views should have a real list or stay a chip.

---

## 19. Catalogue palette split + Show tray 🟡

**Why:** every catalogue item has to be usable. Hand-authored packages stay
under Packages; CANVAS items are auto-packaged and listed under Items grouped
by category; SHOW items are a declared-quantity tray, not a canvas placement.
The digest has one Assets grid of packages and no Show tab.

**What was built:** fourth left-panel tab **Show** (same Tabs row, no width
change). Assets splits into Packages / Items. Radix ScrollArea (ADR-007) on
the left-panel body, tokens from `.scroll-y`. Item cards still use `AssetCard`
+ `Box` until the icons PR.

**Needs design:** the Show tab label and the Items-by-category treatment; 30
category icons plus bespoke high-frequency CANVAS glyphs (icons PR, not this
one).



