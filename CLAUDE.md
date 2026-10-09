@HANDOFF.md

# Working on Calibridge

- `HANDOFF.md` (imported above) is the project's memory across sessions. Start from it.
- **After every change, update `HANDOFF.md` before replying**: Status, Next steps, Open questions, Decisions, and a dated
  line in the Session log. Never edit inside the `handoff:auto` block; `scripts/handoff.mjs` rewrites it on each commit.
- A Stop hook (`.claude/settings.json`) blocks finishing a turn if project files are newer than `HANDOFF.md`.
- Git hooks live in `.githooks/` (`git config core.hooksPath .githooks`, already set in this clone; re-run after a fresh clone).
- Deploy = push to `main` (Netlify auto-deploys). Check `npm run test:all` first for code changes.
- Laksh's vault note for this project: `C:\Users\laksh\OneDrive\Documents\Obsidian Vault\02 Projects\Past Projects (2025).md`.
- Logo: `public/favicon.svg` is the source. The PNG icons are rendered from the same shapes (see HANDOFF.md, "Logo").
