/**
 * QA-24 must be able to fail. A check that only greps live source and has never
 * been shown a broken Radix item is blind the day the first Item lands.
 *
 *   node --test scripts/qa-no-handler.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanSource } from "./qa-no-handler.mjs";

describe("QA-24 understands the Radix shape", () => {
  it("FAILS an enabled Menubar.Item with no onSelect", () => {
    const hits = scanSource(
      `<Menubar.Item className="menubar__item">New</Menubar.Item>`,
      "broken.tsx",
    );
    assert.equal(hits.length, 1);
    assert.match(hits[0], /Menubar\.Item/);
  });

  it("FAILS an enabled DropdownMenu.Item with no onSelect", () => {
    const hits = scanSource(`<DropdownMenu.Item>Copy</DropdownMenu.Item>`, "broken.tsx");
    assert.equal(hits.length, 1);
  });

  it("passes Menubar.Item with onSelect", () => {
    const hits = scanSource(
      `<Menubar.Item onSelect={() => {}}>New</Menubar.Item>`,
      "ok.tsx",
    );
    assert.equal(hits.length, 0);
  });

  it("passes a disabled Menubar.Item without onSelect", () => {
    const hits = scanSource(
      `<Menubar.Item disabled={!caps.appMenus}>New</Menubar.Item>`,
      "ok.tsx",
    );
    assert.equal(hits.length, 0);
  });

  it("does not require a handler on Menubar.Trigger (open is implicit)", () => {
    const hits = scanSource(
      `<Menubar.Trigger className="menubar__menu">File</Menubar.Trigger>`,
      "ok.tsx",
    );
    assert.equal(hits.length, 0);
  });

  it("still FAILS an enabled Button with no onClick", () => {
    const hits = scanSource(`<Button variant="primary">Share</Button>`, "broken.tsx");
    assert.equal(hits.length, 1);
  });

  it("passes Button with disabled={!caps.x} (QA-16 reserved slot)", () => {
    const hits = scanSource(
      `<Button disabled={!caps.sharing}>Share</Button>`,
      "ok.tsx",
    );
    assert.equal(hits.length, 0);
  });

  it("FAILS a ToggleGroup.Root with no onValueChange", () => {
    const hits = scanSource(
      `<ToggleGroup.Root type="single" value="plan">`,
      "broken.tsx",
    );
    assert.equal(hits.length, 1);
    assert.match(hits[0], /ToggleGroup\.Root/);
  });

  it("passes ToggleGroup.Root with onValueChange", () => {
    const hits = scanSource(
      `<ToggleGroup.Root type="single" value={mode} onValueChange={setMode}>`,
      "ok.tsx",
    );
    assert.equal(hits.length, 0);
  });

  it("does not require a handler on DropdownMenu.Trigger", () => {
    const hits = scanSource(
      `<DropdownMenu.Trigger className="select">View:</DropdownMenu.Trigger>`,
      "ok.tsx",
    );
    assert.equal(hits.length, 0);
  });
});
