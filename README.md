![SummerIce Icon](/images/icon-128.png)

# ☀️🧊 SummerIce

A browser extension to summarize articles. Quickly.

Current version: 2.1.0

Extension on Chrome Web Store: [SummerIce ☀️🧊 - Page Summarizer](https://chromewebstore.google.com/detail/summerice-%E2%98%80%EF%B8%8F%F0%9F%A7%8A-page-summa/loaeklmefjdnkdgcgmeoopoajfbemffe?hl=en&authuser=0)

Works on any website. Just click the icon and get a summary.

If you don't want to use your mouse, just press `Ctrl + Shift + Y` (on Windows) or `Cmd + Shift + Y` (on a Mac) to get a summary.

_Note: You need an OpenAI API key to use this extension. You can get one from [OpenAI](https://platform.openai.com/signup)._

## Maintenance Checklist
- When updating or validating model IDs, confirm each provider's latest models first:
  - https://platform.openai.com/docs/models
  - https://platform.claude.com/docs/en/about-claude/models/overview
  - https://ai.google.dev/gemini-api/docs/models
  - https://docs.x.ai/docs/models
- Run `npm run test:models` with `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and `GROK_API_KEY` set.
  - The test runner loads `.env` automatically if present.
