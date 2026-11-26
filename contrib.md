# Contributing

Quick guide for humans and coding agents working on `pi-emoji-complete`.

## Repository layout

```text
pi-emoji-complete/
├── package.json                  # Pi package manifest ("pi" + "pi-package" keyword) & scripts
├── extensions/
│   ├── emoji-complete.js         # Extension entry point & autocomplete provider
│   └── name-to-emoji.js          # Generated slug -> emoji map (do not edit by hand)
├── scripts/
│   └── extract-emoji.js          # Extracts nameToEmoji from gemoji into extensions/name-to-emoji.js
├── test/
│   ├── e2e.test.js               # End-to-end manifest + lifecycle test
│   └── emoji-complete.test.js    # Unit tests for query extraction, ranking, completion, delegation
├── README.md
├── CHANGELOG.md
└── contrib.md
```

## Architecture

### Pi integration
`extensions/emoji-complete.js` exports a default Pi extension factory that registers on `session_start` and stacks a provider via `ctx.ui.addAutocompleteProvider((current) => ...)`:

- **`triggerCharacters`**: preserves `current.triggerCharacters` and appends `":"`. Pi's `Editor` uses this to auto-trigger autocomplete at token boundaries.
- **`async getSuggestions(lines, cursorLine, cursorCol, options)`**: `async` because Pi's `AutocompleteProvider` contract in `@earendil-works/pi-tui` returns `Promise<AutocompleteSuggestions | null>` (built-in file completion is async and `Editor` awaits it).
  - If the text before the cursor does not match a valid `:<query>` (2+ chars at start of line or after whitespace/opening punctuation), it delegates to `current.getSuggestions(...)` so `/` commands and `@` file paths work unchanged.
  - If a valid shortcode has no matches, it returns `null` to close the menu instead of falling through to file completion.
- **`applyCompletion(...)`**: replaces `:query` with the selected emoji (appending a trailing space unless the text after the cursor already starts with whitespace) and delegates non-`:` prefixes to `current.applyCompletion(...)`.

### Matching & zero runtime dependencies
- `EMOJI_ITEMS` is built once at module load directly in the TUI `AutocompleteItem` shape (`{ name, value, label }`) — no per-keystroke formatting or normalization.
- `filterEmoji(query, limit)` runs a **single pass** over `EMOJI_ITEMS`, sorting matches into 4 bags (`exact`, `prefix`, `substring`, `fuzzy`), breaking early if `exact` hits `limit`, and skipping lower-priority checks once higher tiers already fill `limit`.
- `fuzzy` (subsequence match) is a fallback only when `exact + prefix + substring` return nothing, so typos like `:thnk` still find `🤔 :thinking:` without polluting narrow queries like `:thi` with unrelated subsequence matches.
- Because subsequence matching is inlined and the emoji table is pre-extracted, the extension has **zero runtime dependencies** and does not import `@earendil-works/pi-tui` at runtime.

## Build-time emoji extraction (important gotcha)

`gemoji` is a **`devDependency`**, not a runtime dependency.

- `scripts/extract-emoji.js` imports `nameToEmoji` from `gemoji`, ensures lowercase keys, and writes only `export const nameToEmoji = { ... };` to `extensions/name-to-emoji.js`.
- `extensions/name-to-emoji.js` **is committed to git** (and shipped in the npm tarball) so that both `pi install npm:pi-emoji-complete` and `pi install git:...` work with zero runtime dependencies and no install-time build step.
- `package.json` wires `"prepack": "npm run build:emoji"`, so `npm pack` and `npm publish` automatically regenerate `extensions/name-to-emoji.js` before packing.
- **Do not edit `extensions/name-to-emoji.js` by hand** — bump `gemoji` and run `npm run build:emoji` instead.

## Setup & commands

```bash
npm install
npm run build:emoji   # regenerate extensions/name-to-emoji.js from gemoji
npm test              # runs test:e2e && test:unit (Mocha)
npm run test:e2e      # manifest + provider lifecycle test
npm run test:unit     # query parsing, ranking, completion, delegation
npm pack --dry-run    # verify tarball contents (~6 files, no dev files)
```

## Testing live in Pi

Run Pi with only this package loaded (ignores other extensions in `~/.pi/agent/extensions/`):

```bash
pi --no-extensions -e .
```

Or install it locally as a user package:

```bash
pi install .
pi list
```

Verify in the editor:
1. `:th` opens the menu; Up/Down arrows move selection.
2. Typing `i` (`:thi`) narrows to `🤔 :thinking:` and `🇪🇹 :ethiopia:`.
3. `Enter` or `Tab` inserts the emoji without submitting; `Esc` dismisses.
4. `:thnk` falls back to fuzzy matching; `https://...` and `12:30` do not trigger; `/mo` slash commands still work.
