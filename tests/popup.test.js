import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let runtimeMessageListener;

const buildPopupDom = () => {
  document.body.innerHTML = `
    <div id="header">
      <a href="#" id="settingsLink">Settings</a>
    </div>
    <div id="summary-area"></div>
    <div id="spinner" style="display: none;"></div>
    <div id="timeout-message" style="display: none;"></div>
  `;
};

const setupChromeMock = () => {
  global.chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener) => {
          runtimeMessageListener = listener;
        }),
      },
      openOptionsPage: vi.fn(),
      sendMessage: vi.fn((message, cb) => cb?.({ started: true })),
    },
    tabs: {
      query: vi.fn((_, cb) => cb([{ id: 7 }])),
    },
  };
};

describe("popup rendering", () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeMessageListener = null;
    buildPopupDom();
    setupChromeMock();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        randomUUID: () => "request-1",
      },
    });
  });

  afterEach(() => {
    delete global.chrome;
    delete globalThis.crypto;
  });

  it("renders summaries as text instead of HTML", async () => {
    const { displaySummary } = await import("../popup.js");

    displaySummary('<img src=x onerror="alert(1)">summary', true);

    const summaryArea = document.getElementById("summary-area");
    expect(summaryArea.querySelector("img")).toBeNull();
    expect(summaryArea.textContent).toContain(
      '<img src=x onerror="alert(1)">summary',
    );
    expect(summaryArea.textContent).toContain("From cache");
  });

  it("only accepts messages for the active request id", async () => {
    const { initializePopup } = await import("../popup.js");

    initializePopup();

    runtimeMessageListener({
      type: "summarizationResult",
      requestId: "request-2",
      summary: "wrong summary",
      fromCache: false,
    });
    expect(document.getElementById("summary-area").textContent).toBe("");

    runtimeMessageListener({
      type: "summarizationResult",
      requestId: "request-1",
      summary: "right summary",
      fromCache: false,
    });

    expect(document.getElementById("summary-area").textContent).toContain(
      "right summary",
    );
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "startSummary",
        requestId: "request-1",
        tabId: 7,
      }),
      expect.any(Function),
    );
  });

  it("registers runtime listeners before querying the active tab", async () => {
    vi.resetModules();

    const callOrder = [];
    global.chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((listener) => {
            runtimeMessageListener = listener;
            callOrder.push("listener");
          }),
        },
        openOptionsPage: vi.fn(),
        sendMessage: vi.fn((message, cb) => cb?.({ started: true })),
      },
      tabs: {
        query: vi.fn((_, cb) => {
          callOrder.push("query");
          cb([]);
        }),
      },
    };

    const { initializePopup } = await import("../popup.js");
    initializePopup();

    expect(callOrder).toEqual(["listener", "query"]);
  });
});
