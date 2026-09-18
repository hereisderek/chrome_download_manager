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

test("getCookiesForUrl excludes sibling subdomain cookies and deduplicates by name", async () => {
  const mailOsid = { name: "OSID", value: "mail-osid", domain: "mail.google.com" } as chrome.cookies.Cookie;
  const rootOsid = { name: "OSID", value: "root-osid", domain: ".google.com" } as chrome.cookies.Cookie;
  const takeoutOsid = { name: "OSID", value: "takeout-osid", domain: "takeout-download.usercontent.google.com" } as chrome.cookies.Cookie;
  const gmailCookie = { name: "GMAIL_AT", value: "abc", domain: "mail.google.com" } as chrome.cookies.Cookie;
  const sidCookie = { name: "SID", value: "session-sid", domain: ".google.com" } as chrome.cookies.Cookie;

  stubCookiesApi({
    "takeout-download.usercontent.google.com": [takeoutOsid],
    "google.com": [mailOsid, rootOsid, gmailCookie, sidCookie],
  });

  const { getCookiesForUrl } = await import("./cookies.ts");
  const cookies = await getCookiesForUrl("https://takeout-download.usercontent.google.com/dl");

  // mail.google.com cookies (mailOsid, gmailCookie) must NOT be included
  assert.ok(!cookies.some((c) => c.name === "GMAIL_AT"));
  // Only one OSID must remain, and it must be the more specific takeoutOsid
  const osids = cookies.filter((c) => c.name === "OSID");
  assert.equal(osids.length, 1);
  assert.equal(osids[0]?.value, "takeout-osid");
  // root SID must be present
  assert.ok(cookies.some((c) => c.name === "SID"));
});
