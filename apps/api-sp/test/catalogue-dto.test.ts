import { describe, expect, it } from "vitest";
import { toPackageDto } from "../src/lib/catalogue-dto.js";

describe("toPackageDto", () => {
  it("copies named fields only, so nothing rate-shaped can serialise", () => {
    const dto = toPackageDto({
      packageId: "PKG_X",
      name: "X",
      description: null,
      params: ["lanes"],
      version: 1,
      lines: [{
        itemCode: "TEST_LIGHT",
        qtyRule: "PER_COUNT_PARAM:lanes",
        qtyValue: 1,
        flag: "DEFAULT_ON",
        item: { name: "Wash fixture", category: "lighting" },
      }],
    });
    expect(JSON.stringify(dto)).not.toMatch(/valuePaise|rates|litresPerHour|amountPaise/i);
    expect(dto.lines[0]!.itemName).toBe("Wash fixture");
    expect(dto.auto).toBe(false);
    expect(dto.category).toBe("lighting");
  });
});
