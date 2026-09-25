import { defineConfig } from "vitest/config";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  // Components import icons as `*.svg?react`; the svgr transform must be present
  // for any test that renders a component using the shell primitives.
  plugins: [svgr({ include: "**/*.svg?react" })],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
