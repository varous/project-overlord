# Front-end Reference Review — the Figma file

> **Date:** 12 Aug 2026 · **File:** `0FYxJfKDzG1vujIVx62mEl` — titled *"Web App UI Kit
> (Community)"*, but that title is wrong about its contents
> **Inspected:** full node tree (1,550 named nodes), bound variables, rendered screens
> Companion to `01-prd.md` (what the screens must do) and `02-architecture-and-stack.md`

---

## What's actually in the file

The single canvas is named **`2D3D Editor`**. It contains **four top-level frames, all
1728 × 1080, and all four are finished screens**:

| Node | Name (verbatim) | What it shows |
|---|---|---|
| `104:25` | `Editor / Light / 3D` | V1 chrome, light theme, perspective viewport |
| `114:147` | `Editor / Dark / 3D` | structurally identical twin of the above, dark theme |
| `114:607` | `Editor / Light / 2D Plan` | **the one that matters to us** — orthographic plan viewport |
| `117:2` | `Editor V2 / Light / 3D` | a redesign: adds a Tool Mode Bar, Quick Search (`⌘K`), Attributes section, and a floating Data Bar |

**Two corrections to how the file was described to me, both worth knowing before we
build against it:**

1. **There is no design-system section and no component library.** Zero component
   sets, zero variants, zero `Components` page, no typography or spacing or radius or
   shadow token frames, and no icon library. Every control is a one-off frame drawn
   inline inside a screen. The ~187 icons exist only as anonymous 9–22 px child frames
   named `Frame`; their meaning lives in the *parent's* name (`Select`, `Pan`,
   `Snap Tangent`, `QP Rulers`). So there is a **visual** vocabulary to work from, but
   nothing to import, and no second state for anything — every control exists in
   exactly one visual state. No hover, focus, active, disabled, error, loading or empty
   state exists anywhere in the file.

2. **Colour tokens *do* exist, as bound Figma variables** — this is the one piece of
   real design-system infrastructure, and it's genuinely useful. All sixteen, verbatim:

   ```
   bg/app            #f7f8fa      text/primary      #1a1d21
   bg/panel          #ffffff      text/secondary    #8a9099
   bg/panel-alt      #f2f4f6      accent/default    #24c6e0
   bg/menubar        #ffffff      accent/soft       #e1f7fb
   bg/canvas         #edf0f3      accent/text-on    #ffffff
   border/default    #e8eaed      chip/blue         #e4e9fd
   border/subtle     #f0f2f4      chip/pink         #fde7f1
                                  chip/purple       #e9e4fd
                                  chip/orange       #fdeedc
   ```

   Those map one-to-one onto Tailwind CSS custom properties on day one. **Themes are
   done by whole-screen duplication, not by variable modes**, so the dark values aren't
   recoverable from the file — the dark screen will have to be derived, and honestly
   dark mode is a Phase 1 nicety, not an MVP requirement.

3. **It is a Vectorworks mockup, not an event-layout app.** The document title layer
   reads `Coastal House — Studio.vwx`, and the resource footer reads
   `Libraries: Vectorworks · User · Workgroup · Online`. The tool sets are `Wall`,
   `Door`, `Window`, `Slab`, `Roof`, `Stair`, `Column`, `Extrude`. That is a good
   reference for *how a professional CAD editor is laid out* and a poor reference for
   *what our salesperson does on a call.* More on that tension below, because it is the
   most important thing in this document.

---

## The shell — take this, almost as-is

The four-band, three-column structure is well-judged and we should adopt it:

```
┌────────────────────────────────────────────────────────────┐
│ Menu Bar        44px   logo · menus · doc title · avatars · share · theme
├────────────────────────────────────────────────────────────┤
│ View Bar        48px   undo/redo · layer · class · 2D|3D · view · zoom · fit
├──────────┬───────────────────────────────────┬─────────────┤
│ Left     │ Canvas                            │ Object Info │
│ 292px    │ 1136px                            │ 300px       │
│ (48 rail │  grid, model, floating toolbar     │ tabs, fields│
│  + 244)  │                                   │             │
├──────────┴───────────────────────────────────┴─────────────┤
│ Status Bar      30px   coords · contextual hint · selection count · units
└────────────────────────────────────────────────────────────┘
```

Measurements worth copying verbatim, since they're already balanced: left rail 48,
left panel 244 (total 292), inspector 300, bars 44/48/30, inputs 26 high, icon buttons
22/26/28/32/34, tool tile 49 × 46, asset tile 66 × 61, gutters 8/12/14.

Four patterns in here are directly reusable and save real design time:

- **`Object Info Panel`** (`104:31`) — header with object name and a type badge, three
  tabs (`Shape` / `Data` / `Render`), then `Transform` field rows for X / Y / Z /
  Width / Depth / Height / Rotation / Scale, then `Placement` (Layer + Class selects),
  then `Appearance`. Our element inspector is the same shape: position, dimensions,
  rotation, then which zone and level it belongs to, then its catalogue item. The
  `Data` tab is where per-element BOQ overrides belong.
- **`Layers`** (`108:2`) — eye toggle, colour swatch, label, overflow glyph. That is
  our zones-and-levels panel with no changes.
- **`Assets`** grid (`108:43`) — 66 × 61 tiles with icon and label. That is our
  catalogue palette. V2's `Resource Manager` adds a search field and a category filter
  (`117:337`), which we need from day one because the catalogue is hundreds of items,
  not six.
- **`Status Bar`** — live cursor coordinates, a contextual hint for the active tool
  (`Wall tool — click to place vertices · press Esc to finish`), selection count and
  units. This is the cheapest usability feature in the whole design and it should be in
  slice 4.

The **`2D3D Toggle`** (`106:24`) is architecturally interesting: it's exactly where our
**Plan ↔ BOQ** toggle should live. Same position, same affordance, and it re-uses a
control the reference already sanctions. In V2 that toggle moved onto the canvas as a
floating chip (`117:482`) — I prefer V1's placement in the View Bar for us, because the
BOQ is a mode, not a viewport overlay.

---

## The tension — and my recommendation

The reference is a **CAD application**: eight top-level menus
(`File Edit View Modify Model Tools Window Help`), a ten-tool drawing rail, and in V2
an entire **Tool Mode Bar** with `Screen Plane / Layer Plane / Auto Plane`,
`Add Solid / Subtract Solid`, `Symmetric / From Face`, a hint reading
`U · I · O · P cycle modes`, and a status bar carrying **six** independent snapping
toggles plus Smart Points.

That is a tool for a draughtsman who uses it forty hours a week. Our primary user is a
salesperson who opens it a few times a week, live, while a client waits — and
principle 4 in `README.md` says plainly that a feature she can't reach in two clicks is
a feature she won't use. Reproducing this chrome would produce something that *looks*
professional and *feels* like software she needs training for. That would be the most
expensive possible mistake, because it fails quietly: everyone admires the demo and
nobody opens it on a call.

**So: adopt the skeleton, reject the density.** Concretely, for the MVP:

| Reference element | Decision |
|---|---|
| Four-band, three-column shell | **Take.** With the exact measurements above |
| Colour variables | **Take.** All sixteen, as CSS custom properties |
| Object Info Panel structure | **Take.** Retitle `Element` / `Data` / `Notes` |
| Layers panel | **Take.** Becomes Zones & Levels |
| Assets grid + V2 search and filter | **Take.** Search is mandatory, not optional |
| Status bar (coords, hint, selection, units) | **Take.** Cheapest usability win here |
| 2D↔3D toggle position | **Take,** repurposed as Plan ↔ BOQ |
| Light/dark theme toggle | **Defer** to Phase 1 — dark values aren't in the file |
| 8-item menu bar | **Replace** with a slim project bar: project name, save state, share, avatar |
| 10-tool drawing rail | **Cut to 5**: select, pan, measure-distance, measure-area, place |
| V2 Tool Mode Bar | **Cut entirely.** Modal plane/solid semantics have no meaning in a 2D site plan |
| Six snapping toggles + Smart Points | **Cut to one** snap toggle. Snap sensibly by default |
| Data Bar (floating numeric entry) | **Defer** to Phase 2. Powerful, and precisely the kind of thing that intimidates a first-time user |
| View Cube, Primitives Toolbar, 3D tool grid, `Extrude / Sweep / Loft / NURBS / Deform` | **Cut.** ADR-004 — no 3D until Phase 6 |
| Quick Search `⌘K` | **Keep the idea, defer the implementation.** It's the right escape hatch once the catalogue is large |

One small defect in the reference, noted so we don't faithfully reproduce it: the
`Primitives Toolbar` (Box / Sphere / Cylinder / Cone / Plane / Extrude / Boolean) is
**still present on the 2D Plan screen** (`114:920`) — 3D-only controls left behind in
the 2D layout. Ignore it there. Our equivalent floating bottom toolbar should carry
**measurement tools**, which is a much better use of that position.

---

## What is missing and must be designed — this is the real finding

The file covers the editor and nothing else. Every screen below has **zero** nodes in
the reference, and several of them are on the MVP's critical path:

**Blocking the MVP (must exist before slice 3 and slice 7):**

1. **Base-map upload and dropzone.** No upload, dropzone, file picker or import dialog
   exists anywhere in the file.
2. **Scale calibration.** *The highest-risk missing screen in the project.* Nothing in
   the reference resembles it: pick two points on the map, type the real-world distance
   between them, confirm, and see the derived scale. Everything downstream — every
   quantity, every rupee — is wrong if this interaction is wrong, and the design has
   to make an un-calibrated state visibly, unmistakably different from a calibrated one
   because `README.md` principle 2 forbids showing an approximate number. Design this
   first, on paper, before any code.
3. **The BOQ panel or view.** The entire commercial half of the product — the derived
   line items, quantities, units, section grouping, provenance markers on overridden
   lines — has no design at all. There are **no tables or data grids anywhere in the
   file**, so there is no row, header, sort, or cell-edit pattern to borrow.
4. **Projects dashboard.** No file cards, no recent-projects screen, no thumbnails.
5. **Export dialog and share-with-roles UI.** No modals or dialogs exist in the file at
   all. The `Share Button` is drawn; what it opens is not.

**Needed shortly after, and cheap to add if planned now:**

6. **Save and sync state.** The reference has a static text `Saved` and nothing else.
   We need a real indicator — saved / saving / offline-with-local-draft — because
   `06-stack-review.md` finding #5 makes IndexedDB drafts an MVP requirement and the
   worst failure mode in this product is silent data loss on a call.
7. **Toasts, empty states, loading and error states.** None exist.
8. **Tooltips.** None exist, despite roughly 120 icon-only buttons that would each need
   one. If we cut the tool rail to five labelled tools this problem mostly evaporates —
   another reason to cut.
9. **Interaction states for every control** — hover, focus-visible, active, disabled.
   Each control in the file has exactly one state. Focus-visible is not optional;
   keyboard access on a shared laptop matters.
10. **Selection UI** — no bounding-box, handles or multi-select state is designed. A
    static selected wall is drawn, but not the affordance.
11. **Scrollbars and overflow.** Panels are 928–958 px tall with far less content, so
    overflow was never confronted. Our catalogue palette will overflow immediately.
12. **Right-click context menu.** Zero nodes, and no open menu is drawn anywhere in the
    file, so there's no menu-item / shortcut / separator pattern either.
13. **Resizable panels.** Panels are fixed-width frames with no splitter or collapse
    affordance. The inspector at a fixed 300 px will feel tight next to a BOQ table.
14. **Any breakpoint other than 1728 × 1080.** Every screen is that one size. Worth
    deciding now: I'd target 1366 × 768 as the *minimum* supported, because that's a
    real laptop a salesperson will have on a call, and 1728 is not.

**Deliberately not needed:** minimap, projection picker, legend, geocoder. We are
calibrating an uploaded image, not rendering a GIS basemap.

---

## How this changes the build slices

No change to the count or the estimate — but slice ordering gains a dependency, and one
slice absorbs more design work than `09-phased-plan.md` implied:

- **Before slice 3**, sketch the calibration interaction. Paper is fine. Twenty minutes
  of thinking beats a day of rework, and this is the interaction the whole product's
  correctness rests on.
- **Slice 4** fills the left catalogue column and the canvas object layer. The
  shell (bands, panels, status bar) already exists from slice 0 / the reference
  route; do not rebuild it. Tokens and primitives only.
- **Slice 6 or 7** must design the BOQ table from scratch. Budget for it — there is no
  reference. `shadcn/ui`'s table primitives plus TanStack Table cover the mechanics; the
  layout and the provenance markers are ours to invent.
- **Everything visual should be built against the sixteen CSS custom properties from
  hour one,** never hard-coded hexes. It costs nothing now and it is what makes a later
  Clockwork-branded restyle a one-file change rather than a sweep.

---

## What I'd ask the designer for, in priority order

If there is any design time available, this is where it converts to the most value:

1. Scale calibration — the full flow, including the un-calibrated warning state
2. The BOQ view — table, section grouping, override/provenance markers
3. Interaction states for the shared controls: button, input, select, tab, tool tile
4. Base-map upload and the projects dashboard
5. Toast, empty and error states
6. Dark theme values, if dark mode is actually wanted

Everything else we can build faithfully from what's already in the file.
