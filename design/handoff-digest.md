# 2D/3D Editor — Design System Handoff (verbatim export)

Generated 2026-08-12 by the originating Cowork session. Rule followed throughout: quoted values are exact; anything that does not exist is marked `NOT PRESENT`.

**Export failures to know about (not gaps in the design — gaps in this export):**
- **2× PNG screen exports: FAILED in this session.** This sandbox's network proxy returns `403` on `www.figma.com/api/mcp/asset/*`, so rendered PNGs could not be downloaded to attach. Recovery: your session has the Figma MCP — call `get_screenshot` with the node ids in §3 (they work across pages even if page enumeration is limited).
- **Component sheet PNG: FAILED**, same cause. Use `get_screenshot` on any component node id in §5, or on page `128:22` nodes.
- Everything else requested is delivered.

---

## 2. Figma file identity

- File key: `0FYxJfKDzG1vujIVx62mEl`
- File name: `Web App UI Kit (Community)`
- URL: `https://www.figma.com/design/0FYxJfKDzG1vujIVx62mEl/Web-App-UI-Kit--Community-`
- Pages (name → node id):
  - `Thumb` → `0:1` (original kit thumbnail art; not part of this project)
  - `Library` → `3:135` (original kit's flattened marketing images — rasters only, no components; not part of this project)
  - `2D3D Editor` → `104:2` (**all four UI screens**)
  - `DS Components` → `128:22` (**component library**)
- Tokens live in **Figma variables**, not on a page. Collections:
  - `Theme` (`VariableCollectionId:104:3`) — modes: `Light` (`104:0`), `Dark` (`104:1`). 21 color variables. **Dark theme is fully recoverable by switching mode.**
  - `Metrics` (`VariableCollectionId:128:2`) — single mode. 9 float variables (spacing/radius).
- Local text styles: `Type/Display`, `Type/Heading`, `Type/Title`, `Type/Body`, `Type/Label`, `Type/Caption`, `Type/Micro`. Local effect styles: `Shadow/sm`, `Shadow/md`, `Shadow/lg`.

## 3. Screen inventory

All four screens are fixed `1728 × 1080` frames on page `104:2`, built with Auto Layout (vertical stack of bars; horizontal workspace row; side panels fixed width; canvas fills). Reflow below 1728 px was **not explicitly designed**; the intended behavior (implemented in `design-system.css`) is: bars and side panels keep fixed sizes, canvas flexes. At the 1366×768 minimum, canvas ≈ 770×546 px in the V1 layout. No screen states beyond "populated with a selection" exist — **empty / loading / error / offline / permission states: NOT PRESENT on every screen.**

### 3.1 `Editor / Light / 3D` — node `104:25`
User is modeling in a 3D perspective view with one object (a cube) selected.
Regions (px): Menu Bar `1728×44`; View Bar `1728×48`; Left Panel `292×958` (= Basic Tools Rail `48` + tabbed panel `244`); Canvas `1136×958`; Object Info Panel `300×958`; Status Bar `1728×30`.
Interactive elements: menus (File Edit View Modify Model Tools Window Help), doc title, 3 avatars, `Share` button, sun/moon theme toggle; undo/redo, `Design Layer 1` + `Class: Walls` dropdowns, `2D Plan | 3D` segmented toggle (3D active), `Perspective` + `Shaded` dropdowns, snap + grid toggles, `82%` zoom, fit; rail tools (Select active, Pan, Zoom, Line, Rectangle, Circle, Polygon, Text, Dimension, Eyedropper); tabs `Tool Sets | Layers | Assets`; 8 Building-Shell tool chips; 4 layer rows (eye/dot/name/lock, row 2 active); 6 asset cards; floating primitives toolbar (11 buttons + 2 dividers, Box active); view cube (top-right); Object Info tabs `Shape | Data | Render` (Shape active), 8 transform inputs, Layer/Class selects, material row, opacity slider; status-bar X/Y/Z + hint + selection/snap/units.

### 3.2 `Editor / Dark / 3D` — node `114:147`
Same screen with `Theme` collection explicitly set to `Dark` mode; moon segment active; 3D scene manually recolored for dark.

### 3.3 `Editor / Light / 2D Plan` — node `114:607`
Top/Plan drafting state: `2D Plan` segment active, `Top/Plan` + `Wireframe` dropdowns, canvas shows orthogonal grid + floor plan (double-line walls, door swings, window symbols, dimension lines `28′ 0″` / `20′ 0″`, room labels, selected right wall with blue handles), OIP shows `Wall 06 — Wall`.

### 3.4 `Editor V2 / Light / 3D` — node `117:2` (Vectorworks-faithful alternative)
Regions (px): Menu Bar `1728×40` (adds centered Quick Search `320` wide, `Text` menu); View Bar `1728×44` (order: Saved Views, Class, Layer, Plane, ‖, View `Right Isometric`, Rotation `0.00°`, Render `Shaded`, ‖, Zoom, Flyover, Fit); Tool Mode Bar `1728×36` (working-plane modes, `Push/Pull:` mode groups, `U · I · O · P cycle modes` hint, Quick Preferences right); Left Panel `296` (rail `48` + sections `TOOL SETS` incl. `3D Modeling`, `NAVIGATION` with sub-tabs `Classes | Design Layers | Saved Views` + numbered rows with visibility column, `RESOURCE MANAGER` with search/filter/view-toggle/grid/libraries footer); Canvas `1132×928` (primitives toolbar top-center, view cube lower-left + `2D | 3D` chip, floating Data Bar `H ∠ X Y` near selection); Object Info `300` (adds `Name` input, `ATTRIBUTES` section: Fill, Pen `0.35 mm`, dashed Style preview, Drop shadow toggle, `by class` link, `RENDER — TEXTURE` section); Status Bar `1728×32` (snapping set: Grid/Object/Angle active, Intersection/Tangent off, Smart Points active; hint; `1 selected` + X/Y/Z).

### 3.5 Requested-screen checklist

| Screen | Exists? |
|---|---|
| Sign-in / Google OAuth | NOT PRESENT |
| Projects dashboard / recent projects | NOT PRESENT |
| New project / project settings | NOT PRESENT |
| Base map upload with dropzone | NOT PRESENT |
| **Scale calibration** | **NOT PRESENT** |
| **Uncalibrated warning state** | **NOT PRESENT** |
| Main editor with canvas | YES — 4 variants (§3.1–3.4) |
| Catalogue / item palette with search + category filter | PARTIAL — `RESOURCE MANAGER` section in V2 left panel (search field, one `Symbols` filter dropdown, thumb/list toggle, 6 cards). Not a standalone screen; no category tree. |
| Element inspector / properties panel | YES — Object Info panel, both versions |
| Zones & levels panel | PARTIAL — `Layers` / `NAVIGATION (Design Layers)` list only; no zones concept |
| Measurement tools + live readout | PARTIAL — Dimension tool icon, floating Data Bar (`H 3′ 6″ ∠ 30.0° X Y`), status-bar X/Y/Z. No measure-tool interaction states. |
| **BOQ view** | **NOT PRESENT** |
| **BOQ line with manual override** | **NOT PRESENT** |
| Export dialog (Excel / PDF) | NOT PRESENT |
| Share link + roles/permissions | NOT PRESENT (a `Share` button exists; no dialog behind it) |
| Save / sync / offline indicator | PARTIAL — static `Saved` text next to doc title in §3.1–3.3. No syncing/offline/error states. |
| Toast, empty, error, loading states | NOT PRESENT |
| Right-click context menu | NOT PRESENT |
| Settings / profile | NOT PRESENT |

## 4. Design tokens, exhaustively

Sources: **Figma variables** (`Theme` + `Metrics`), **CSS custom properties** in `design-system.css`, and **`tokens.json`**. The three were generated together and **agree on every shared value**, with these structural exceptions:
- `--selection` / `--selection-soft` (`#2F7CFF` / `#E8F0FB` light; `#5E96FF` / `#263346` dark) exist in **CSS + tokens.json only — NOT a Figma variable**; in Figma the selection color is hardcoded into canvas artwork.
- Axis colors `--axis-x #FF6B57`, `--axis-y #3DBE68`, `--axis-z #4A79FF`: CSS + tokens.json only; hardcoded in Figma artwork.
- Typography / shadows / layout constants: CSS + tokens.json + Figma **styles** (not variables).
- There is **no raw-palette ramp layer** (no `gray-100…900`). All color tokens are single-level semantic. Figma `Theme` variables carry WEB code syntax `var(--token-name)`.

**Color (Theme — Light / Dark):** `bg/app` `#F4F4F2`/`#1B1C1E` · `bg/panel` `#FFFFFF`/`#242628` · `bg/panel-alt` `#F1F1EF`/`#2E3033` · `bg/canvas` `#EDEDEA`/`#171819` · `bg/menubar` `#FFFFFF`/`#202224` · `border/default` `#E6E6E2`/`#37393C` · `border/subtle` `#EFEFEC`/`#2C2E30` · `text/primary` `#17181A`/`#F4F4F3` · `text/secondary` `#83858A`/`#9C9EA3` · `text/tertiary` `#B3B5B8`/`#6A6C70` · `icon/default` `#4A4C50`/`#C6C7C9` · `accent/default` `#17181A`/`#F2F2F1` (ink; the only chrome emphasis) · `accent/soft` `#EAEAE7`/`#35373A` · `accent/text-on` `#FFFFFF`/`#17181A` · `danger/default` `#D93A2F`/`#E5766D` · `chip/pink` `#F6E3E1`/`#453230` · `chip/blue` `#E3EBF8`/`#2C3442` · `chip/orange` `#F3ECDD`/`#42392B` · `chip/purple` `#E9E6F5`/`#363044` · `canvas/grid` `#DDDDD9`/`#2A2C2E` · `shadow/ambient` `#141414`/`#000000` (utility, unused directly).

**Typography:** `Inter` (Google Fonts, OFL licence). Fallback stack: `'Inter', -apple-system, 'Segoe UI', sans-serif`. Scale (weight size/line-height): `Display` 700 24/30 · `Heading` 600 16/22 · `Title` 600 13/18 · `Body` 400 12.5/18 · `Label` 500 11.5/16 · `Caption` 500 10/14 · `Micro` 600 9/12 + letter-spacing 0.04em uppercase. Letter-spacing elsewhere: none. (Screens also use ad-hoc sizes 8.5px/9.5px/10.5px — see §8.)

**Spacing:** base unit **4 px**. `xs 4` · `sm 8` · `md 12` · `lg 16` · `xl 24`.
**Radii:** `sm 6` · `md 8` · `lg 12` · `full 999`. **Border widths:** hairline `1px` (dividers, ghost buttons, floating chrome), `1.5px` (input focus ring, checkbox, avatar ring), `2px` (selection outlines, slider knob ring). No border-width tokens — literals.
**Shadows:** `Shadow/sm` = `0 1px 2px rgba(20,20,20,.08)` · `Shadow/md` = `0 3px 10px rgba(20,20,20,.10)` · `Shadow/lg` = `0 8px 24px rgba(20,20,20,.12), 0 2px 6px rgba(20,20,20,.06)`; dark overrides in CSS use `rgba(0,0,0,.3/.35/.45,.25)`.
**Z-index scale:** NOT PRESENT. **Motion:** no token scale; literals in CSS: `transition: filter .12s ease` (.btn), `transform .15s ease` (.switch). **Breakpoints:** NOT PRESENT (fixed desktop shell; min target 1366×768 honored by flexing canvas only).

## 5. Component inventory (page `DS Components`, `128:22`)

All bind fills/strokes/radii to `Theme`/`Metrics` variables (exceptions in §8). None map to shadcn/Radix/Headless/MUI — hand-rolled; nearest primitives noted. **Designed states are exactly what is listed — hover / focus-visible / active / disabled / loading / error / read-only are NOT PRESENT in Figma for every component** (CSS adds `:hover` and `:focus` for some — code-only).

| Component | Node id | Variants/props | Dimensions & padding | Tokens consumed | Nearest lib primitive |
|---|---|---|---|---|---|
| `Button` | `128:39` | `Style` = Primary·Secondary·Ghost·Danger; `Size` = Small·Medium; TEXT prop `Label` | Sm pad 5×14, 11.5px text; Md pad 7×18, 12.5px; radius `radius/sm` | accent/default, accent/text-on, bg/panel-alt, border/default, danger/default | shadcn `Button` |
| `IconButton` | `128:46` | `State` = Default·Active | 32×32, radius sm, 18px icon | accent/soft | shadcn `Button variant=ghost size=icon` |
| `Tab` | `128:53` | `State` = Active·Inactive; TEXT `Label` | pad 10×4 + 2px underline | text/primary, text/secondary, accent/default | Radix `Tabs.Trigger` |
| `Badge` | `128:64` | `Color` = Neutral·Blue·Pink·Orange·Ink; TEXT `Label` | pad 8×3, radius full, 10px 600 | chips, bg/panel-alt, accent/* | shadcn `Badge` |
| `Input` | `128:73` | `State` = Default·Focus; TEXT `Label`,`Value` | 180 wide; label 10px; box pad 8×6 radius 7; focus = 1.5px accent stroke | bg/panel-alt, text/*, accent/default | shadcn `Input` + label |
| `Select` | `128:74` | TEXT `Label`; single | pad 10/8×6, radius sm, chevron 10px | bg/panel-alt, text/primary | Radix `Select.Trigger` (visual only — menu NOT PRESENT) |
| `SearchField` | `128:78` | single | 220 wide, pad 10×6, radius sm | bg/panel-alt, text/tertiary | — |
| `Switch` | `128:87` | `State` = On·Off | 32×18 track r9, 14px knob | accent/default, accent/text-on, bg/panel-alt, bg/panel, border/default | Radix `Switch` |
| `Checkbox` | `128:92` | `State` = Checked·Unchecked | 16×16 r4; check = white 3.4 stroke | accent/default, bg/panel, border/default | Radix `Checkbox` |
| `Slider` | `128:93` | single (60% shown) | 180×12; 4px track r2; 12px knob, 2px accent ring | bg/panel-alt, accent/default, bg/panel | Radix `Slider` |
| `Tooltip` | `128:97` | TEXT `Label` | pad 8×5 r6, 10px 500 | accent/default, accent/text-on | Radix `Tooltip` |
| `ToolChip` | `129:12` | `State` = Default·Active; TEXT `Label` | 52 wide, pad top 8 bottom 6, r `radius/md`, 18px icon + 8.5px label | bg/panel-alt, accent/soft, text/* | — (domain) |
| `LayerRow` | `129:31` | `State` = Default·Active; TEXT `Name` | 240×~26, pad 8×6 r `radius/md` | accent/soft, chip/blue, text/primary | — (domain) |
| `AssetCard` | `129:32` | TEXT `Label`; single | 66 wide, pad 12/8, r md, 22px icon + 9px label | bg/panel-alt, text/secondary | — (domain) |
| `SegmentedControl` | `130:2` | single (2 fixed segments `2D`/`3D`) | outer pad 3 r md; segment pad 12×4 r sm, 11.5px 600 | bg/panel-alt, accent/default, accent/text-on, text/secondary | — |
| `Avatar` | `130:7` | TEXT `Initials` | 24×24 r12, 1.5px panel ring, 8px 600 | chip/pink, bg/panel, text/primary | shadcn `Avatar` |
| `SectionHeader` | `130:9` | TEXT `Title` | 240 wide, 9.5px 600 +4% tracking | text/secondary | — |
| `Divider` | `130:11` | single | 120×1 | border/default | shadcn `Separator` |
| `DataField` | `130:12` | TEXT `Label`,`Value` | label 9.5px; value box pad 6×2 r `radius/sm`, 10.5px 600 | bg/panel-alt, text/* | — (domain) |
| `FloatingToolbar` | `130:16` | single (composes 5 IconButton instances + divider) | pad 8×6, r `radius/lg`, 1px border, `Shadow/lg` | bg/panel, border/default | — |

**Requested-component checklist:** button ✓ · icon button ✓ · text input ✓ (`Input`) · number input NOT PRESENT (no stepper; `Input` shows numeric strings) · select/dropdown ✓ trigger only (open menu NOT PRESENT) · combobox with search NOT PRESENT · checkbox ✓ · radio NOT PRESENT · switch ✓ · segmented control ✓ · slider ✓ · tabs ✓ (trigger only; no tab-bar container component) · accordion NOT PRESENT · **table / data grid NOT PRESENT** · **modal / dialog NOT PRESENT** · drawer/sheet NOT PRESENT · popover NOT PRESENT · tooltip ✓ · toast NOT PRESENT · alert/banner NOT PRESENT · badge/chip ✓ · avatar ✓ · breadcrumb NOT PRESENT · pagination NOT PRESENT · progress NOT PRESENT · spinner NOT PRESENT · skeleton NOT PRESENT · empty state NOT PRESENT · card PARTIAL (`AssetCard` only; no generic card) · **file dropzone NOT PRESENT** · tree/nested list NOT PRESENT · context menu NOT PRESENT · command palette NOT PRESENT (V2 has a Quick Search *field* visual, `⌘K`, no palette) · split pane / resizable divider NOT PRESENT.

## 6. Icons

- Set: **custom, hand-drawn in this project** in a Lucide-like style (24×24 viewBox, `stroke-width 2` for 13–18px use, `1.8` for 20–22px, round caps/joins, `fill="none"`). Licence: created in this session — yours; no third-party licence attached. Not Lucide/Phosphor/Heroicons.
- Delivered: `icons.zip` — **73 SVGs**, filenames matching the Figma layer/button names, colors matching current file state.
- Names in use: Select, Pan, Zoom, Line, Rectangle, Circle, Polygon, Text, Dimension, Eyedropper, Undo, Redo, Layers, Perspective, Shaded, Snap, Grid, Fit, Chevron-Down, Search, Saved-Views, Flyover, Sun, Moon, Wall, Door, Window, Slab, Roof, Stair, Column, Extrude, Sweep, Loft, Solids, NURBS, Deform, Eye, Lock, Plus, Chair, Table, Sofa, Tree, Lamp, Stairs, Box, Sphere, Cylinder, Cone, Plane, Line-Points, Arc, Extrude-Plus, Boolean, Screen-Plane, Layer-Plane, Auto-Plane, PushPull-Add, PushPull-Subtract, Symmetric, From-Face, QP-Rulers, QP-Page-Boundary, View-Thumbnails, View-List, Snap-Grid, Snap-Object, Snap-Angle, Snap-Intersection, Snap-Tangent, Snap-Smart-Points, Check (+ the logo glyph inside `Logo`).
- Rendered sizes on screens: 9–22px (typ. 13/14/15/16/18/22). In Figma they are **loose vectors inside button frames, NOT icon components** — no INSTANCE_SWAP icon system exists.

## 7. How it's meant to be implemented

- `design-system.css` is **plain CSS with custom properties — it does NOT assume Tailwind** (no `@tailwind`, no utility classes, no preflight dependency). Konva canvas colors should read the same custom properties (`--bg-canvas`, `--canvas-grid`, `--selection`, `--axis-*`) at draw time and re-read on theme change.
- Convention: BEM-ish blocks with element (`__`) and modifier (`--`) plus `is-*` state classes. Real examples: `.btn--primary`, `.seg__item.is-active`, `.layer-row.is-hidden .layer-row__eye`, `.field__input:focus`, `.floating-toolbar--bottom`, `.data-field.is-active .data-field__value`.
- Theme switch: set `data-theme="dark"` on `<html>`/`<body>`; everything cascades.
- Shell layout classes and constants: `.app-shell`, `.menubar` (`--menubar-h: 40px`), `.viewbar` (`44px`), `.modebar` (`36px`), `.statusbar` (`32px`), `.panel-left` (`296px`), `.tool-rail` (`48px`), `.panel-right` (`300px`), `.canvas` (flex fill). Note: the V1 screens use 44/48/—/30 and left `292`; **CSS encodes the V2 shell — treat V2 as canonical**.
- Grid: 4px baseline; no documented column grid. Container widths: none beyond the shell constants.
- Code Connect mappings: NOT PRESENT. React component code from this session: NOT PRESENT (no JSX exists; CSS classes only).

## 8. Accessibility and known problems

- **Contrast was not formally audited.** Likely WCAG AA failures (light theme): `--text-tertiary #B3B5B8` on `#FFFFFF`/`#F1F1EF` (~2.2:1 — placeholders, hints); `--text-secondary #83858A` on `#FFFFFF` (~3.9:1 — fails AA for the 10–12px sizes it's used at); 8.5–9.5px micro labels are below any comfortable floor regardless of contrast. Ink-on-white and white-on-ink pairs pass comfortably. Dark theme pairs were not measured.
- **Focus states: only `Input` has a designed focus (1.5px ink ring).** All other interactive components have no focus-visible design; CSS defines `:focus` only for `.field__input`. Keyboard navigation design: NOT PRESENT.
- Touch/click targets: rail/toolbar buttons 32–34px, mode-bar buttons 26px, snapping buttons 22px, RM view toggle 18px — the last three are **below the 24px WCAG 2.5.8 minimum**.
- **Hardcoded values bypassing tokens** (rebrand will silently break these):
  - Icon strokes: V1 screens + most delivered SVGs use `#5B6470`; `#8A9099` for eye/lock/chevrons — neither equals `icon/default #4A4C50` (used in V2/DS icons). Three competing icon grays exist.
  - Sun icon stroke `#1A1D21` (pre-retheme ink), avatar initials in V1 dark clone, dark theme-toggle active pill `#4A5056`.
  - White (`#FFFFFF`) hardcoded: active pill of V2 `Nav Tabs` and RM view toggle, theme-toggle active seg (light screens), V1 slider knob, checkbox check stroke.
  - Entire canvas scenes (3D model, 2D plan, view cube, grid in V2 clone, selection `#2F7CFF`/`#5E96FF`, gizmo `#4A79FF/#FF6B57/#3DBE68`) — intentional artwork, but selection/axis colors have no Figma variable (CSS/JSON only).
  - `Data Bar` active field uses `accent/soft` in Figma but `--selection-soft/--selection` in CSS — pick one (recommend CSS's).
- Duplicates / conflicts: V1 vs V2 screens implement the same controls as separate non-component frames (screens predate the library — **no screen uses library instances**); V1 shell dimensions (44/48/30, left 292) vs V2/CSS (40/44/36/32, left 296); `Theme` still contains unused `shadow/ambient`; ad-hoc type sizes (8.5/9.5/10.5/12/13) exist on screens outside the 7-step ramp.
- Left mid-edit / unresolved: `Select` has no open-menu design; `Slider` value is static art; V1 `Assets` tab and V2 `RESOURCE MANAGER` are two different treatments of the same feature; dark variant of V2 was never made.

## 9. Honest assessment

**Production-ready:** the token system (three synchronized sources, true Light/Dark, CSS ready to paste), the shell layout with exact dimensions, and the 20 DS components as *visual* specs — Button, Badge, Switch, Checkbox, Tab, SegmentedControl, ToolChip, LayerRow, AssetCard, DataField, FloatingToolbar are complete enough to build today, and the four screens give an unambiguous target for the editor chrome in both themes and both 2D/3D modes.

**A sketch:** everything interactive-beyond-rest — no hover/focus/disabled states, no open dropdown/menu, no keyboard model; the canvas content is illustration, not a Konva spec (selection, snapping, handles will raise constant questions); the Resource Manager/catalogue exists in two inconsistent versions; reflow below 1728 is asserted in CSS but never designed; the three icon grays and the screens-not-using-components gap mean visual drift is guaranteed unless someone reconciles them first.

**Missing, in the order I'd design it:** (1) modal/dialog primitive + the Export dialog, (2) table/data grid + the BOQ view with the manual-override row treatment, (3) file dropzone + base-map upload, (4) scale calibration flow and the uncalibrated warning banner (this is a systemic state, so design the alert/banner primitive with it), (5) toast + empty/loading/error states, (6) context menu, (7) sign-in and projects dashboard, (8) share/permissions, (9) number input with units + stepper (the OIP is full of them), (10) focus-visible states across the board.
