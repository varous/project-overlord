/**
 * Application menu bar — Radix Menubar, visuals from existing `.menubar__*`
 * classes. Dropdown contents are not in the handoff (design-inventions.md §17);
 * every item is a reserved slot: rendered always, disabled when `appMenus` is
 * off, `onSelect` present so QA-24 can see a handler.
 */
import * as Menubar from "@radix-ui/react-menubar";
import { NOT_YET } from "../lib/capabilities.js";

export const APP_MENUS = [
  { label: "File", items: ["New", "Open…", "Export…"] },
  { label: "Edit", items: ["Cut", "Copy", "Paste"] },
  { label: "View", items: ["Zoom In", "Zoom Out"] },
  { label: "Modify", items: ["Move", "Rotate"] },
  { label: "Model", items: ["Extrude", "Push/Pull"] },
  { label: "Tools", items: ["Calibrate Scale", "Measure"] },
  { label: "Text", items: ["Font", "Size"] },
  { label: "Window", items: ["Object Info", "Layers"] },
  { label: "Help", items: ["Keyboard Shortcuts", "About"] },
] as const;

/** Commands are not built. The function exists so QA-24 sees `onSelect`. */
function onReservedSelect() {
  /* reserved */
}

export function AppMenubar({ enabled }: { enabled: boolean }) {
  return (
    <Menubar.Root className="menubar__menus" loop>
      {APP_MENUS.map((menu) => (
        <Menubar.Menu key={menu.label}>
          <Menubar.Trigger
            className="menubar__menu"
            disabled={!enabled}
            title={enabled ? menu.label : NOT_YET}
          >
            {menu.label}
          </Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content className="menubar__content" align="start" sideOffset={4}>
              {menu.items.map((item) => (
                <Menubar.Item
                  key={item}
                  className="menubar__item"
                  disabled={!enabled}
                  onSelect={onReservedSelect}
                >
                  {item}
                </Menubar.Item>
              ))}
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      ))}
    </Menubar.Root>
  );
}
