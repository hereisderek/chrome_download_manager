import { test } from "node:test";
import assert from "node:assert/strict";

function stubCookiesApi(byDomain: Record<string, chrome.cookies.Cookie[]>) {
  (globalThis as { chrome?: unknown }).chrome = {
    cookies: {
      getAll: async ({ domain }: { domain: string }) => byDomain[domain] ?? [],
    },
  };
}

test("getCookiesForUrl reaches the registrable root, not just the immediate parent", async () => {
  const rootCookie = { name: "SAPISID", value: "root-session", domain: "google.com" } as chrome.cookies.Cookie;
  stubCookiesApi({
    "takeout-download.usercontent.google.com": [],
    "usercontent.google.com": [], // the old one-level-up target - deliberately empty
    "google.com": [rootCookie],
  });

  const { getCookiesForUrl } = await import("./cookies.ts");
  const cookies = await getCookiesForUrl("https://takeout-download.usercontent.google.com/download?id=1");

  assert.deepEqual(cookies, [rootCookie]);
});

test("getCookiesForUrl dedupes cookies seen at both the host and root domain", async () => {
  const cookie = { name: "session", value: "abc", domain: "example.com" } as chrome.cookies.Cookie;
  stubCookiesApi({
    "sub.example.com": [cookie],
    "example.com": [cookie],
  });

  const { getCookiesForUrl } = await import("./cookies.ts");
  const cookies = await getCookiesForUrl("https://sub.example.com/file.zip");

  assert.equal(cookies.length, 1);
});

test("getCookiesForUrl skips the extra lookup for an already-two-label domain", async () => {
  let calls = 0;
  (globalThis as { chrome?: unknown }).chrome = {
    cookies: {
      getAll: async () => {
        calls += 1;
        return [];
      },
    },
  };

  const { getCookiesForUrl } = await import("./cookies.ts");
  await getCookiesForUrl("https://example.com/file.zip");

  assert.equal(calls, 1);
});
