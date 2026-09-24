import { ICONS, type IconName } from "./icon-registry.js";

/**
 * The single way an icon reaches the screen.
 *
 * The handoff (§6) delivered 73 loose SVGs, not Figma icon components, and
 * (§8) three competing greys were hardcoded across them. Every file has been
 * rewritten to `currentColor` and colour now comes from `.icon` in
 * overrides.css — so a rebrand is a token change, not a sweep through 73 files.
 *
 * Stroke widths per §6: 2 for 13-18px use, 1.8 for 20-22px.
 */
export interface IconProps {
  name: IconName;
  size?: number;
  tone?: "default" | "secondary" | "onAccent";
  className?: string;
  title?: string;
}

export function Icon({ name, size = 16, tone = "default", className, title }: IconProps) {
  const Svg = ICONS[name];
  const toneClass =
    tone === "secondary" ? " icon--secondary" : tone === "onAccent" ? " icon--on-accent" : "";
  return (
    <Svg
      width={size}
      height={size}
      strokeWidth={size >= 20 ? 1.8 : 2}
      className={`icon${toneClass}${className ? ` ${className}` : ""}`}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      focusable="false"
    />
  );
}
