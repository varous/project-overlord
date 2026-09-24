/**
 * View-bar dropdown — Radix DropdownMenu mapped onto `.select`.
 * Native `<select>` stays in primitives for the calibration unit picker
 * (ADR-007 (e) — do not touch that dialog here).
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "./Icon.js";

export function DropdownSelect({
  label,
  prefix,
  value,
  onChange,
  options,
  disabled = false,
  title,
}: {
  label?: string;
  prefix?: string;
  value: string;
  onChange?: (v: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  title?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="select"
        disabled={disabled}
        title={title}
        aria-label={label ?? prefix ?? "Select"}
      >
        {prefix ? <span className="select__prefix">{prefix}</span> : null}
        <span className="select__value">{current}</span>
        <Icon name="Chevron-Down" size={10} className="select__chevron" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="select__content" align="start" sideOffset={4}>
          {options.map((o) => (
            <DropdownMenu.Item
              key={o.value}
              className="select__item"
              disabled={disabled}
              onSelect={() => onChange?.(o.value)}
            >
              {o.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
