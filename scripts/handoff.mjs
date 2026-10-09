#!/usr/bin/env node
// Keeps HANDOFF.md current.
//
//   node scripts/handoff.mjs auto    Rewrite the auto block (recent commits, working-tree changes).
//                                    Run by the git pre-commit hook (.githooks/pre-commit).
//   node scripts/handoff.mjs check   Claude Code Stop hook (.claude/settings.json). If project files
//                                    changed after HANDOFF.md was last edited by hand, block the stop
//                                    and ask Claude to update the handoff first.
//
// The auto block keeps the file's modification time unchanged, so the mtime always means
// "last hand edit" and the check can't be satisfied by the auto refresh alone.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "HANDOFF.md");
const START = "<!-- handoff:auto:start -->";
const END = "<!-- handoff:auto:end -->";
// Changes to these never need a handoff update on their own.
const IGNORE = [/^HANDOFF\.md$/, /^\.claude\//, /^package-lock\.json$/, /^next-env\.d\.ts$/, /^AGENTS\.md$/, /^CLAUDE\.md$/];

const git = (args) => {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

function autoBlock() {
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const commits = git('log -15 --date=format:"%Y-%m-%d %H:%M" --format="- `%h` %ad %s"') || "- (no commits yet)";
  const status = git("status --short") || "(clean)";
  return [
    START,
    "## Auto: repo state",
    "",
    `_Refreshed ${now} IST by \`scripts/handoff.mjs\` (runs on every commit). Don't edit inside this block._`,
    "",
    `Branch: \`${git("rev-parse --abbrev-ref HEAD") || "?"}\` · remote: ${git("remote get-url origin") || "none"}`,
    "",
    "### Last 15 commits",
    "",
    commits,
    "",
    "### Uncommitted changes at refresh time",
    "",
    "```",
    status,
    "```",
    END,
  ].join("\n");
}

function refresh() {
  if (!existsSync(file)) return;
  const { atime, mtime } = statSync(file);
  const text = readFileSync(file, "utf8");
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  const next = s >= 0 && e > s ? text.slice(0, s) + autoBlock() + text.slice(e + END.length) : `${text.trimEnd()}\n\n${autoBlock()}\n`;
  if (next === text) return;
  writeFileSync(file, next, "utf8");
  utimesSync(file, atime, mtime); // keep "last hand edit" time
}

function newestProjectChange() {
  const files = git("ls-files --cached --others --exclude-standard").split("\n").filter(Boolean);
  let newest = 0;
  let which = "";
  for (const f of files) {
    if (IGNORE.some((re) => re.test(f))) continue;
    try {
      const t = statSync(join(root, f)).mtimeMs;
      if (t > newest) [newest, which] = [t, f];
    } catch {
      /* deleted in the working tree */
    }
  }
  return { newest, which };
}

async function check() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let payload = {};
  try {
    payload = JSON.parse(input || "{}");
  } catch {
    /* no payload */
  }
  // Already blocked once this turn: let Claude stop rather than loop.
  if (payload.stop_hook_active) return;

  const handoffTime = existsSync(file) ? statSync(file).mtimeMs : 0;
  const { newest, which } = newestProjectChange();
  if (newest > handoffTime + 1000) {
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          `Project files changed after HANDOFF.md was last updated (latest: ${which}). ` +
          "Before finishing, update HANDOFF.md: Status, Next steps, Open questions, Decisions if any, " +
          "and add a dated line to the Session log describing what changed this session. " +
          "Leave the auto block at the bottom alone.",
      }),
    );
    return;
  }
  refresh();
}

const mode = process.argv[2];
if (mode === "auto") refresh();
else if (mode === "check") await check();
else {
  console.error("usage: node scripts/handoff.mjs auto|check");
  process.exit(1);
}
