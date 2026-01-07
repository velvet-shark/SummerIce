![SummerIce Icon](/images/icon-128.png)

# ☀️🧊 SummerIce

A browser extension to summarize articles. Quickly.

Current version: 2.2.0

Extension on Chrome Web Store: [SummerIce ☀️🧊 - Page Summarizer](https://chromewebstore.google.com/detail/summerice-%E2%98%80%EF%B8%8F%F0%9F%A7%8A-page-summa/loaeklmefjdnkdgcgmeoopoajfbemffe?hl=en&authuser=0)

Works on any website. Just click the icon and get a summary.

If you don't want to use your mouse, just press `Ctrl + Shift + Y` (on Windows) or `Cmd + Shift + Y` (on a Mac) to get a summary.

_Note: You need an API key from your chosen provider (OpenAI, Anthropic, Google Gemini, or xAI Grok). You can add or change providers in the Settings page._

## Maintenance Checklist
- When updating or validating model IDs, confirm each provider's latest models first:
  - https://platform.openai.com/docs/models
  - https://platform.claude.com/docs/en/about-claude/models/overview
  - https://ai.google.dev/gemini-api/docs/models
  - https://docs.x.ai/docs/models
- Run `npm run test:models` with `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and `GROK_API_KEY` set.
  - The test runner loads `.env` automatically if present.

## Build Chrome Web Store ZIP
1. Install dependencies so vendor files are available: `npm install`
2. Build the release zip: `npm run build:zip`
3. Upload `build/summerice-<version>.zip` to the Chrome Web Store

## Version Update Notes
When bumping versions, update all of the following:
- `manifest.json` `version`
- `package.json` `version`
- `README.md` "Current version" line
- Chrome Web Store listing release notes/version text
