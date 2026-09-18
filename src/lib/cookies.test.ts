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

test("getCookiesForUrl reaches google.com root domain for googleusercontent.com", async () => {
  const googleCookie = { name: "SID", value: "google-session", domain: "google.com" } as chrome.cookies.Cookie;
  const userContentCookie = { name: "download_token", value: "xyz", domain: "storage.googleusercontent.com" } as chrome.cookies.Cookie;
  stubCookiesApi({
    "storage.googleusercontent.com": [userContentCookie],
    "googleusercontent.com": [],
    "google.com": [googleCookie],
  });

  const { getCookiesForUrl } = await import("./cookies.ts");
  const cookies = await getCookiesForUrl("https://storage.googleusercontent.com/file.zip");

  assert.equal(cookies.length, 2);
  assert.ok(cookies.some((c) => c.name === "SID"));
  assert.ok(cookies.some((c) => c.name === "download_token"));
});

test("getCookiesForUrl includes cookies from extraUrls (such as referrer)", async () => {
  const referrerCookie = { name: "takeout_auth", value: "valid", domain: "takeout.google.com" } as chrome.cookies.Cookie;
  const downloadCookie = { name: "dl", value: "1", domain: "takeout-download.usercontent.google.com" } as chrome.cookies.Cookie;
  stubCookiesApi({
    "takeout-download.usercontent.google.com": [downloadCookie],
    "takeout.google.com": [referrerCookie],
    "google.com": [],
  });

  const { getCookiesForUrl } = await import("./cookies.ts");
  const cookies = await getCookiesForUrl("https://takeout-download.usercontent.google.com/dl", [
    "https://takeout.google.com/takeout/downloads",
  ]);

  assert.ok(cookies.some((c) => c.name === "takeout_auth"));
  assert.ok(cookies.some((c) => c.name === "dl"));
});
