import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatCookieHeader } from "../lib/cookies.ts";

describe("FDM Integration", () => {
  it("formats cookies and parameters according to FDM create_downloads task format", () => {
    const fakeCookies = [
      {
        name: "session_token",
        value: "xyz123",
        domain: "example.com",
        path: "/",
        secure: true,
        httpOnly: true,
        hostOnly: true,
        session: false,
        storeId: "0",
        sameSite: "lax" as chrome.cookies.SameSiteStatus,
      },
    ];

    const cookieStr = formatCookieHeader(fakeCookies);
    assert.equal(cookieStr, "session_token=xyz123");

    const downloads = [
      {
        url: "https://example.com/archive.zip",
        originalUrl: "https://example.com/archive.zip",
        httpReferer: "https://example.com/downloads",
        httpCookies: cookieStr,
        userAgent: "Mozilla/5.0",
        suggestedName: "archive.zip",
      },
    ];
    const payload = {
      id: "1",
      task: "create_downloads",
      downloads,
    };

    assert.equal(payload.task, "create_downloads");
    assert.equal(payload.downloads.length, 1);
    const first = downloads[0]!;
    assert.equal(first.httpCookies, "session_token=xyz123");
    assert.equal(first.suggestedName, "archive.zip");
  });
});
