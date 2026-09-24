#!/usr/bin/env node
/**
 * Writes .agent/STATUS.md — one file that tells any agent (or human) the exact state
 * of this repo without crawling it.
 *
 * Why this exists: the Cowork/strategy session reaches this machine through a file
 * bridge. Reading 183 files to work out what changed is slow and lossy. Reading ONE
 * generated file is instant and complete. So we generate it.
 *
 *   npm run status          # write .agent/STATUS.md
 *   npm run status -- --print   # also print it
 *
 * Run it after any meaningful change — and always before asking the strategy session
 * for a plan. It captures failures VERBATIM, because a paraphrased error is useless
 * for diagnosis.
 */
import { execSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";

const sh = (cmd, limit = 8000) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 240_000 })
      .trim().slice(0, limit);
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    return `[exit ${err.status ?? "?"}]\n${out.slice(0, limit)}`;
  }
};
const ok = (cmd) => {
  try { execSync(cmd, { stdio: "ignore", timeout: 240_000 }); return true; } catch { return false; }
};

const isGit = existsSync(".git");
const now = new Date().toISOString();

/* ---- git ---- */
const git = isGit ? {
  branch: sh("git rev-parse --abbrev-ref HEAD", 100),
  head: sh("git log -1 --format='%h %s (%ar)'", 300),
  log: sh("git log --oneline -15", 2000),
  dirty: sh("git status --porcelain", 3000),
  diffstat: sh("git diff --stat HEAD", 3000),
  staged: sh("git diff --cached --stat", 2000),
} : null;

/* ---- checks. Order matters: cheapest and most diagnostic first. ---- */
const checks = [];
const run = (name, cmd) => {
  const started = Date.now();
  const passed = ok(cmd);
  const output = passed ? "" : sh(cmd, 6000);
  checks.push({ name, cmd, passed, seconds: ((Date.now() - started) / 1000).toFixed(1), output });
};
run("domain tests", "npx vitest run --root packages/domain --reporter=dot");
run("typecheck: domain", "npx tsc -p packages/domain/tsconfig.json --noEmit");
run("typecheck: web", "npx tsc -p packages/web/tsconfig.json --noEmit");
run("build: web", "npm run build --workspace @showplan/web");
run("web bundle gzip (ceiling 400000 B)", "node scripts/gzip-web-bundle.mjs");
run("lint", "npm run lint");
/* Hardcoded hex / font-size px in components bypasses tokens.json. */
run(
  "token hygiene: components",
  `bash -c 'hits=$(rg -n --glob "*.tsx" -e "#[0-9A-Fa-f]{3,8}\\\\b" -e "fontSize:[[:space:]]*[0-9]" -e "font-size:[[:space:]]*[0-9]+px" packages/web/src/components || true); if [ -n "$hits" ]; then echo "$hits"; exit 1; fi'`,
);
/* QA-24: IconButton/Button that can render enabled must have a handler. */
run("QA-24: no enabled chrome without a handler", "node scripts/qa-no-handler.mjs");
run("QA-24: scanner fails a broken Radix Item", "node --test scripts/qa-no-handler.test.mjs");
run("section terms: Venue Construction / Operations / Power", "node scripts/qa-section-terms.mjs");

/* ---- inventory ---- */
const count = (glob) => sh(`ls ${glob} 2>/dev/null | wc -l`, 20).trim();
const inventory = {
  domainModules: count("packages/domain/src/*.ts"),
  domainTests: count("packages/domain/test/*.ts"),
  webComponents: count("packages/web/src/components/*.tsx"),
  icons: count("packages/web/src/icons/*.svg"),
  docs: count("docs/*.md"),
  cursorRules: count(".cursor/rules/*.mdc"),
};
const todos = sh(
  `grep -rn --include='*.ts' --include='*.tsx' -E '(TODO|FIXME|HACK|XXX|@ts-expect-error|@ts-ignore)' packages | head -40`,
  4000,
);
const journal = existsSync(".agent/JOURNAL.md")
  ? readFileSync(".agent/JOURNAL.md", "utf8").split(/^## /m).slice(1, 4).map((s) => "## " + s.trim()).join("\n\n")
  : "_no journal entries yet_";

const failing = checks.filter((c) => !c.passed);
const md = `# STATUS — auto-generated, do not edit

Generated **${now}** by \`npm run status\`.
This file is how another agent gets current without reading the repo. Regenerate it
after any meaningful change, and always before asking for a plan.

## Verdict

**${failing.length === 0 ? "✅ All checks pass." : `❌ ${failing.length} of ${checks.length} checks FAILING: ${failing.map((c) => c.name).join(", ")}`}**

| Check | Result | Time |
|---|---|---|
${checks.map((c) => `| ${c.name} | ${c.passed ? "✅ pass" : "❌ **FAIL**"} | ${c.seconds}s |`).join("\n")}

${failing.length ? `## Failure output — verbatim\n\n${failing.map((c) => `### ${c.name}\n\`\`\`\n$ ${c.cmd}\n${c.output}\n\`\`\``).join("\n\n")}` : ""}

## Git

${git ? `**Branch:** \`${git.branch}\` · **HEAD:** ${git.head}

Recent commits:
\`\`\`
${git.log}
\`\`\`

${git.dirty ? `Uncommitted changes:\n\`\`\`\n${git.dirty}\n\`\`\`\n\n${git.diffstat ? `\`\`\`\n${git.diffstat}\n\`\`\`` : ""}` : "Working tree clean."}` : "⚠️ **This is not a git repository yet.** Run `git init && git add -A && git commit -m \"initial\"` in a native terminal. Without git there is no history, and no agent can tell you what changed."}

## Inventory

${Object.entries(inventory).map(([k, v]) => `- ${k}: **${v}**`).join("\n")}

## Open markers in code

${todos ? `\`\`\`\n${todos}\n\`\`\`` : "_none_"}

## Latest journal entries

${journal}
`;

mkdirSync(".agent", { recursive: true });
writeFileSync(".agent/STATUS.md", md);
console.log(`[status] wrote .agent/STATUS.md — ${failing.length ? `${failing.length} FAILING: ${failing.map((c) => c.name).join(", ")}` : "all checks pass"}`);
if (process.argv.includes("--print")) console.log("\n" + md);
