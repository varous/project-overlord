/**
 * Typed React wrappers over the classes in design-system.css.
 *
 * These add no styling of their own. The CSS from the handoff is the system;
 * these exist so a component name and its variants are checked by the compiler
 * and so the digest's fixes (24px hit areas, focus rings, disabled reasons)
 * are applied in exactly one place rather than remembered at each call site.
 *
 * Node ids from handoff-digest.md §5 are cited so a designer can trace back.
 */
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import { useEffect } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { Icon } from "./Icon.js";
import type { IconName } from "./icon-registry.js";

type Div = { className?: string; children?: ReactNode };

/* Button — 128:39 · Style = Primary|Secondary|Ghost|Danger, Size = Small|Medium */
export function Button({
  variant = "secondary",
  size = "md",
  children,
  className = "",
  ...rest
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`btn btn--${variant}${size === "sm" ? " btn--sm" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

/* IconButton — 128:46 · State = Default|Active. 32x32; hit-24 guarantees the
   WCAG 2.5.8 minimum even where the mock drew 18-22px (digest §8). */
export function IconButton({
  icon,
  label,
  active = false,
  size = "md",
  requiresScale = false,
  className = "",
  ...rest
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  size?: "sm" | "md";
  requiresScale?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-requires-scale={requiresScale || undefined}
      className={`icon-btn${size === "sm" ? " icon-btn--sm" : ""}${active ? " is-active" : ""} hit-24 ${className}`.trim()}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? 14 : 18} />
    </button>
  );
}

/* Tab — 128:53 · State = Active|Inactive */
export function Tabs({ children, className = "" }: Div) {
  return <div className={`tabs ${className}`.trim()} role="tablist">{children}</div>;
}
export function Tab({
  label, active = false, onSelect,
}: { label: string; active?: boolean; onSelect?: () => void }) {
  return (
    <button
      type="button" role="tab" aria-selected={active}
      className={`tab${active ? " is-active" : ""}`}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

/* SegmentedControl — 130:2 · Radix ToggleGroup; visuals stay `.seg` / `.seg__item`. */
export interface Segment { id: string; label: string; disabled?: boolean; title?: string }
export function Segmented({
  segments, value, onChange, className = "",
}: { segments: readonly Segment[]; value: string; onChange?: (id: string) => void; className?: string }) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange?.(next);
      }}
      className={`seg ${className}`.trim()}
      rovingFocus
    >
      {segments.map((s) => (
        <ToggleGroup.Item
          key={s.id}
          value={s.id}
          disabled={s.disabled}
          title={s.title ?? s.label}
          className={`seg__item${s.id === value ? " is-active" : ""}`}
        >
          {s.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/* Badge — 128:64 · Color = Neutral|Blue|Pink|Orange|Ink */
export function Badge({
  children, tone = "neutral",
}: { children: ReactNode; tone?: "neutral" | "blue" | "pink" | "orange" | "ink" }) {
  return <span className={`badge${tone === "neutral" ? "" : ` badge--${tone}`}`}>{children}</span>;
}

/* Input — 128:73 · the only component with a designed focus state */
export function Field({
  label, className = "", numeric = false, ...rest
}: { label?: string; numeric?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`field ${className}`.trim()}>
      {label ? <span className="field__label">{label}</span> : null}
      <input className={`field__input${numeric ? " numeric" : ""}`} {...rest} />
    </label>
  );
}

/* Select — 128:74 · trigger only; the open menu was NOT PRESENT in the design.
   Using a native <select> deliberately: it is keyboard- and screen-reader
   correct for free, and the menu we would otherwise have to invent is logged
   in design-inventions.md as still owed by design. */
export function Select({
  label, prefix, value, onChange, options,
}: {
  label?: string; prefix?: string; value: string;
  onChange?: (v: string) => void; options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="select">
      {prefix ? <span className="select__prefix">{prefix}</span> : null}
      <select
        aria-label={label ?? prefix ?? "Select"}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="Chevron-Down" size={10} className="select__chevron" />
    </label>
  );
}

/* SearchField — 128:78 */
export function Search({
  placeholder = "Search", pill = false, ...rest
}: { pill?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`search${pill ? " search--pill" : ""}`}>
      <Icon name="Search" size={13} tone="secondary" />
      <input placeholder={placeholder} {...rest} />
    </div>
  );
}

/* Switch — 128:87 · State = On|Off */
export function Switch({
  on, onToggle, label,
}: { on: boolean; onToggle?: () => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label}
      className={`switch${on ? " is-on" : ""} hit-24`} onClick={onToggle}
    />
  );
}

/* Checkbox — 128:92 · State = Checked|Unchecked */
export function Checkbox({
  checked, onToggle, label,
}: { checked: boolean; onToggle?: () => void; label: string }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} aria-label={label}
      className={`checkbox${checked ? " is-checked" : ""} hit-24`} onClick={onToggle}
    >
      {checked ? <Icon name="Check" size={11} tone="onAccent" /> : null}
    </button>
  );
}

/* ToolChip — 129:12 · State = Default|Active */
export function ToolChip({
  icon, label, active = false, requiresScale = false, onSelect, disabled, title,
}: {
  icon: IconName; label: string; active?: boolean; requiresScale?: boolean;
  onSelect?: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? label}
      aria-pressed={active}
      data-requires-scale={requiresScale || undefined}
      className={`tool-chip${active ? " is-active" : ""}`}
      onClick={onSelect}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </button>
  );
}

/* LayerRow — 129:31 · State = Default|Active */
export function LayerRow({
  name, colour = "blue", visible = true, locked = false, ordinal, active = false,
  onSelect, onToggleVisible,
}: {
  name: string; colour?: "blue" | "pink" | "orange" | "purple";
  visible?: boolean; locked?: boolean; ordinal?: number; active?: boolean;
  onSelect?: () => void; onToggleVisible?: () => void;
}) {
  return (
    <div
      className={`layer-row${active ? " is-active" : ""}${visible ? "" : " is-hidden"}`}
      onClick={onSelect}
      role="option"
      aria-selected={active}
      tabIndex={0}
    >
      {ordinal !== undefined ? <span className="layer-row__ordinal">{ordinal}</span> : null}
      <button
        type="button"
        className="layer-row__eye hit-24"
        aria-label={visible ? `Hide ${name}` : `Show ${name}`}
        onClick={(e) => { e.stopPropagation(); onToggleVisible?.(); }}
      >
        <Icon name="Eye" size={13} tone="secondary" />
      </button>
      <span className="layer-row__dot" style={{ background: `var(--chip-${colour})` }} />
      <span className="layer-row__name">{name}</span>
      {locked ? <Icon name="Lock" size={12} tone="secondary" /> : null}
    </div>
  );
}

/* AssetCard — 129:32 */
export function AssetCard({
  icon, label, onSelect,
}: { icon: IconName; label: string; onSelect?: () => void }) {
  return (
    <button type="button" className="asset-card" onClick={onSelect} title={label}>
      <Icon name={icon} size={22} tone="secondary" />
      <span>{label}</span>
    </button>
  );
}

/* DataField — 130:12 · active field uses --selection per digest §8 */
export function DataField({
  label, value, active = false, onChange,
}: { label: string; value: string; active?: boolean; onChange?: (v: string) => void }) {
  return (
    <label className={`data-field${active ? " is-active" : ""}`}>
      <span className="data-field__label">{label}</span>
      <input
        className="data-field__value numeric"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label={label}
      />
    </label>
  );
}

/* SectionHeader — 130:9 · Divider — 130:11 */
export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="section__header">
      <span>{title}</span>
      {children}
    </div>
  );
}
export function Section({ children, className = "" }: Div) {
  return <div className={`section ${className}`.trim()}>{children}</div>;
}
export function DividerV() { return <span className="divider-v" />; }
export function DividerH() { return <span className="divider-h" />; }

/**
 * ADR-007 ScrollArea — behaviour from Radix, visuals from tokens.
 * Replaces hand-rolled .scroll-y on the left-panel body.
 */
export function ScrollArea({ children, className = "" }: Div) {
  return (
    <ScrollAreaPrimitive.Root className={`scroll-area ${className}`.trim()}>
      <ScrollAreaPrimitive.Viewport className="scroll-area__viewport">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar className="scroll-area__bar" orientation="vertical">
        <ScrollAreaPrimitive.Thumb className="scroll-area__thumb" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  );
}

/* Avatar — 130:7 */
export function Avatar({ initials, colour = "pink" }: { initials: string; colour?: string }) {
  return <span className="avatar" style={{ background: `var(--chip-${colour})` }}>{initials}</span>;
}

/* FloatingToolbar — 130:16 */
export function FloatingToolbar({
  position = "bottom", children,
}: { position?: "bottom" | "top"; children: ReactNode }) {
  return <div className={`floating-toolbar floating-toolbar--${position}`}>{children}</div>;
}

/**
 * Modal — NOT PRESENT in the design handoff (digest checklist).
 * Plainest dialog from tokens + Button. Logged in design-inventions.md.
 * Escape / backdrop click = cancel. Does not use window.confirm.
 */
export function Modal({
  open,
  title,
  children,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="modal-root" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Dismiss" onClick={onCancel} />
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h2 id="modal-title" className="modal__title">{title}</h2>
        <div className="modal__body">{children}</div>
        <div className="modal__actions">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
