# Repository Guidelines

## Project Structure & Module Organization
SummerIce is a Chrome extension built with vanilla ES modules. Core runtime logic lives in `background.js`, orchestrating API calls through `api-client.js` and caching via `cache.js`. User-facing scripts sit in `popup.js`, `settings.js`, `setup.js`, and `content.js`, while shared constants stay in `constants.js`. Static entry points (`popup.html`, `settings.html`, `setup.html`, `offscreen.html`) load from the project root; assets remain in `images/`, and styling is centralized in `style.css`. Shared helpers live in `modules/` (e.g., `modules/youtube-transcript.js`, `modules/settings-store.js`, `modules/provider-ui.js`, `modules/text-utils.js`, `modules/prompts.js`). Add new modules alongside these files, or group reusable helpers under `modules/`.

## Build, Test, and Development Commands
- `npm install` installs extension dependencies; run after pulling new changes.
- `npm run build` revalidates dependency installation and surfaces install failures in CI.
- `npm run test` runs the Vitest suite.
For local iteration, load the unpacked folder in Chrome: open `chrome://extensions`, enable Developer Mode, choose *Load unpacked*, and select this repository root.

## Coding Style & Naming Conventions
Use modern ES2020 syntax with explicit `import`/`export`. Follow the prevailing two-space indentation, retain trailing semicolons, and prefer double quotes for DOM-facing strings. Keep filenames in `kebab-case.js` and export classes in `PascalCase`. DOM IDs and CSS classes stay kebab-cased, while handler functions follow `handleEventName` patterns. Run `npx prettier --write "*.js"` before submitting; the default profile matches current formatting.

## Testing Guidelines
Automated tests run with Vitest via `npm run test`. Add coverage under `tests/feature-name.test.js`, and keep the runner consistent with the existing Vitest setup. Document manual QA in PRs—verify summarization flows via `setup.html`, error states in `background.js`, and keyboard shortcuts on Chrome 121+.

## Commit & Pull Request Guidelines
Recent history favors short, sentence-case subjects (e.g., `Improved content extraction method`); keep summaries under 72 characters and omit trailing punctuation. Group related changes per commit and add bodies when behaviour needs context. Pull requests should provide a concise description, testing notes (manual or automated), linked issues, and screenshots or recordings when UI updates touch `popup.html` or `settings.html`.

## Security & Configuration Tips
Never commit API keys; users store them via `settings.html`, and values persist in `chrome.storage.local`. When introducing providers, extend `CONFIG.LLM_PROVIDERS` in `constants.js` and validate key prefixes before saving. Sanitize any new DOM output with `dompurify` as demonstrated in existing views.

## Provider Model References
Check these official model lists first whenever you need to verify whether a model exists or is up to date:
- https://platform.openai.com/docs/models
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://ai.google.dev/gemini-api/docs/models
- https://docs.x.ai/docs/models
