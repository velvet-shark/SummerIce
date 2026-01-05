import { describe, expect, it } from "vitest";
import { extractContent } from "../offscreen.js";

const buildLongText = () => {
  const paragraph =
    "Important content about the article that should be captured by the extractor. ";
  return Array.from({ length: 40 }).map(() => paragraph).join("");
};

describe("offscreen extraction", () => {
  it("extracts main content when Readability is unavailable", async () => {
    const html = `
      <html>
        <head><title>Test Article</title></head>
        <body>
          <nav>Navigation links</nav>
          <main>
            <h1>Test Article</h1>
            <p>${buildLongText()}</p>
          </main>
        </body>
      </html>
    `;

    const result = await extractContent(html, "https://example.com");

    expect(result.success).toBe(true);
    expect(result.title).toBe("Test Article");
    expect(result.content).toContain("Important content about the article");
  });
});
