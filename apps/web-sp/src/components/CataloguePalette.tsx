/**
 * Assets palette: hand-authored Packages vs auto-generated CANVAS Items.
 * Show-level tray lives on its own tab — not placeable on the canvas.
 */
import { AssetCard, Button, Field, Search, Section, SectionHeader } from "./primitives.js";
import type { CataloguePackage, CatalogueShowItem, LayoutShowItem } from "../lib/api.js";

function matches(q: string, ...parts: (string | null | undefined)[]) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return parts.some((p) => (p ?? "").toLowerCase().includes(needle));
}

export function AssetsPalette({
  packages,
  query,
  onQuery,
  onPlace,
}: {
  packages: CataloguePackage[];
  query: string;
  onQuery: (q: string) => void;
  onPlace: (packageId: string) => void;
}) {
  const hand = packages.filter((p) => !p.auto && matches(query, p.name));
  const auto = packages.filter((p) => p.auto && matches(query, p.name, p.category));
  const byCategory = new Map<string, CataloguePackage[]>();
  for (const p of auto) {
    const cat = p.category || "Other";
    const list = byCategory.get(cat) ?? [];
    list.push(p);
    byCategory.set(cat, list);
  }
  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <>
      <Section>
        <SectionHeader title="Packages" />
        <Search
          placeholder="Search packages and items"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <div className="tool-grid">
          {hand.map((p) => (
            <AssetCard
              key={p.packageId}
              icon="Box"
              label={p.name}
              onSelect={() => onPlace(p.packageId)}
            />
          ))}
        </div>
        {packages.filter((p) => !p.auto).length === 0 ? (
          <p className="panel-hint">Catalogue is empty. Import the seed bundle.</p>
        ) : null}
      </Section>
      <Section>
        <SectionHeader title="Items" />
        {categories.map((cat) => (
          <div key={cat} className="palette-category">
            <p className="palette-category__title">{cat}</p>
            <div className="tool-grid">
              {(byCategory.get(cat) ?? []).map((p) => (
                <AssetCard
                  key={p.packageId}
                  icon="Box"
                  label={p.name}
                  onSelect={() => onPlace(p.packageId)}
                />
              ))}
            </div>
          </div>
        ))}
        {auto.length === 0 && packages.some((p) => p.auto) ? (
          <p className="panel-hint">No items match.</p>
        ) : null}
      </Section>
    </>
  );
}

export function ShowItemTray({
  catalog,
  placed,
  query,
  onQuery,
  onAdd,
  onQty,
  onRemove,
}: {
  catalog: CatalogueShowItem[];
  placed: LayoutShowItem[];
  query: string;
  onQuery: (q: string) => void;
  onAdd: (itemCode: string) => void;
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  const byCode = new Map(placed.map((s) => [s.itemCode, s]));
  const visible = catalog.filter((i) => matches(query, i.name, i.category, i.code));
  const categories = [...new Set(visible.map((i) => i.category))].sort((a, b) => a.localeCompare(b));

  return (
    <Section>
      <SectionHeader title="Show" />
      <Search
        placeholder="Search show items"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      <p className="panel-hint">Not placed on the plan. Quantity is declared.</p>
      {categories.map((cat) => (
        <div key={cat} className="palette-category">
          <p className="palette-category__title">{cat}</p>
          {visible.filter((i) => i.category === cat).map((item) => {
            const row = byCode.get(item.code);
            return (
              <div key={item.code} className="show-row">
                <span className="show-row__name">{item.name}</span>
                {row ? (
                  <>
                    <Field
                      className="show-row__qty"
                      label="Qty"
                      numeric
                      type="number"
                      min={0.01}
                      step="any"
                      value={String(row.qty)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n > 0) onQty(row.id, n);
                      }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => onRemove(row.id)}>
                      Remove
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => onAdd(item.code)}>
                    Add
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {catalog.length === 0 ? (
        <p className="panel-hint">No show-level items in the catalogue.</p>
      ) : null}
    </Section>
  );
}
