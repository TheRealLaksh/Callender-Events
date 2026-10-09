<p align="center">
  <img src="public/favicon.svg" width="72" height="72" alt="Calibridge logo" />
</p>

<h1 align="center">Calibridge</h1>

<p align="center">
  A fast, private calendar that lives entirely in your browser.<br />
  No account, no server, no tracking. Installable and works offline.
</p>

<p align="center"><a href="https://calibridge.lakshpradhwani.com">calibridge.lakshpradhwani.com</a></p>

## Features

- **Month, week and agenda views**, with a live now-line, overlapping events laid out side by side, and "+N more" overflow.
- **Real time zones.** Events are stored as exact instants plus the zone they were created in, so a 9:00 call in Tokyo shows up at the right time wherever you open it.
- **Repeating events** (daily / weekly / monthly / yearly, every N, on chosen weekdays, until a date or a count) that stay at the same wall-clock time across daylight-saving changes. Edit, move or delete **just one occurrence** or the whole series.
- **All-day and multi-day events**, categories with colour filters, location and notes.
- **Reminders** (at start, minutes, hours, days, weeks) as in-app alerts and system notifications while the app is open.
- **Quick add**: type `Lunch with Sam tomorrow at 1pm for 90 min` and review it before saving.
- **Drag to reschedule** in the month and week views; in the week view also **drag an event's bottom edge to resize it** and **drag across empty space to create one**. A mini calendar jumps between dates. **Undo / redo** for every change (`Ctrl/⌘ Z`) and full keyboard control (`?` lists the shortcuts).
- **`.ics` import and export**, compatible with Google, Apple and Outlook. Re-importing a file updates events instead of duplicating them.
- **Search** across titles, locations and notes (`/`).
- Light, dark and system themes; responsive down to phones; checked against WCAG 2.1 AA with axe in both themes.

## Privacy

Everything is stored in your browser's `localStorage`. The production page ships with a strict Content-Security-Policy (no third-party scripts, fonts or analytics, and no network calls other than loading itself), so your events cannot leave the device. Use **Export** to back up or move your data.

## Development

```bash
npm install
npm run dev         # local dev server
npm test            # unit tests (Vitest)
npm run test:e2e    # browser tests (Playwright, fixed clock) - first run: npx playwright install chromium
npm run test:all    # typecheck + unit + e2e
npm run typecheck   # strict TypeScript
npm run build       # type-check + production build into dist/
npm run preview     # serve the production build
```

Requires Node 20.19 or newer. The output in `dist/` is a static site that can be hosted anywhere; it expects to be served from the domain root.

### Deployment

The site is hosted on Netlify and deploys from `main` (`netlify.toml` sets the build, security headers and caching). Every pull request gets a deploy preview.

To serve it from a custom domain: in Netlify add the domain under *Domain management*, then create a `CNAME` record pointing at the site's `*.netlify.app` address. Browser storage is per origin, so when the address changes, events saved on the old one have to be exported there and imported on the new one. `src/ui/moved.ts` shows a banner that offers this on the old address once the new one is reachable.

## Project layout

```
src/
  core/        Pure, framework-free logic with unit tests
    tz.ts          wall-clock <-> instant conversion for any IANA zone
    occurrences.ts recurrence expansion
    ics.ts         RFC 5545 import / export
    quickparse.ts  natural-language quick add
    reminders.ts   which reminders are due
    layout.ts      overlap layout for the week view
  state/       EventStore (undo/redo + persistence) and preferences
  services/    notifications, reminder scheduler, file helpers
  ui/          DOM components (no framework); views/ holds month, week, agenda
tests/         Vitest suites for core and state
e2e/           Playwright browser tests (including axe accessibility audits)
public/        icons, robots.txt, sitemap.xml
```

### Data format

Timed events store `start` / `end` as UTC ISO strings and `tz` as the authoring zone. All-day events store plain `YYYY-MM-DD` dates (inclusive end). Removed occurrences of a repeating event are kept in `exdates`. Data is versioned under `calibridge:v2`.

Calibridge 1.x data (`calibridge_events`) is migrated automatically on first load. The old key is left untouched as a backup.

### Known limitations

- On import, repeat rules beyond "every N days/weeks/months/years" and plain weekday lists (e.g. "the second Monday of each month") are simplified, and the app tells you when that happens.
- Changing a single occurrence of a repeating event turns it into its own event, so later edits to the series do not affect it.
- Reminders fire only while Calibridge is open (browsers do not allow scheduled background notifications without a server).

## Author

Built by [Laksh Pradhwani](https://github.com/TheRealLaksh).
