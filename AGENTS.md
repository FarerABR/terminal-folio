# AGENTS.md

Terminal-style personal portfolio built with TanStack Start. The entire site is a single route (`/`) that renders an interactive terminal; every portfolio section is a command.

## Architecture

```
content/                  # Markdown collections (jobs, education, projects, blog, certificates)
content-collections.ts    # Zod schemas → exports allJobs, allEducations, allProjects, allBlogs, allCertificates
src/data/profile.ts       # THE config file: owner profile + site metadata
src/lib/terminal/
  commands.tsx            # Command registry + all section renderers + tab completion helpers
  banner.ts               # 5-row block font that renders the ASCII name banner
  themes.ts               # Theme names/descriptions (colors live in styles.css)
src/components/Terminal.tsx  # Terminal UI: input, history, completion, contact flow, theme state
src/routes/index.tsx      # Renders <Terminal />
src/routes/__root.tsx     # HTML shell, SEO meta (reads `site`), JetBrains Mono font
src/styles.css            # All terminal styling, `t-` prefixed classes, theme CSS variables
src/client.tsx            # Client entry
src/server.ts             # Server entry
src/start.ts              # TanStack Start instance
```

### Config lives in one place

`src/data/profile.ts` is the single source for anything site-wide — the owner profile and
the `<title>`/SEO tags.

Two rules for that file, because it is bundled into the **public client**:

- Keep it plain data — no React, no browser globals, no `process.env`. It is also imported by
  `vite.config.ts`, which runs in Node.
- Put no secrets in it.

## Adding a command

Append an object to `commands` in `src/lib/terminal/commands.tsx`:
`{ name, aliases?, usage?, description, hidden?, complete?, run(args, api) => ReactNode }`.
Return JSX for output. Use `<Cmd>name</Cmd>` for clickable command links (it reads `TerminalContext`). `api` exposes `run`, `clear`, `setTheme`, `theme`, `history`, `startContact`. Hidden commands are excluded from `help` and completion.

## Conventions / non-obvious decisions

- Styling uses plain CSS classes prefixed `t-` driven by CSS variables (`--t-fg`, `--t-accent`, …) so themes swap via `data-theme` on `.t-root`. Tailwind is available but used only for small spacing utilities.
- The contact flow is a multi-step prompt state machine in `Terminal.tsx` (`name → email → message → confirm`). On confirm it posts `name`, `email`, and `message` to the hidden Netlify Forms detector page at `public/__forms.html`; field names must stay in sync.
- Theme preference is stored in `localStorage` (UI preference only, not app data).
- The initial screen (welcome banner) is deterministic so SSR and hydration match; theme and `?cmd=` deep links apply in an effect after mount.
- The banner ships **two** `<pre>`s — the full name and the initials — and CSS picks one with a `@container` query on `.t-banner-wrap` (≤480px of column → initials at 24px plus the name as text). 84 glyph columns can only be solved to ~6px on a phone, so a `matchMedia` check in JS would be the wrong tool twice: it desyncs the first paint _and_ it keys off the viewport instead of the actual column width.
- Never put a bare `overflow-x: hidden` on `.t-banner`. `visible` on the other axis is coerced to `auto`, and the block font's ink is 1.25em tall in a 1em line box (line-height must stay `1` or the rows tear), so five rows overrun the box and the banner grows its own scrollbar — which then steals ~15px of width and clips the art. It uses `overflow: hidden` with an `@supports (overflow-x: clip)` upgrade to `clip` + `visible`.
- Touch devices skip programmatic focus (`isTouchPrimary()`), so tapping a command to read its output does not pop the keyboard; `api.ask` passes `force` because a command blocked on an answer does want it. The "tap to type" placeholder hides via `:has(.t-input:focus)` rather than React state, so it tracks the real active element and needs no re-render.
- Content Collections pluralizes names: the `education` collection exports `allEducations`.
