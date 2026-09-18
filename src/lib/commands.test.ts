import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCurlCommand, buildWgetCommand, buildSshCommand, isReauthCheckpoint } from "./commands.ts";
import { shellQuote } from "./shellQuote.ts";
import type { DownloadContext } from "./types.ts";

function ctx(overrides: Partial<DownloadContext> = {}): DownloadContext {
  return {
    url: "https://example.com/file.zip",
    filename: "file.zip",
    cookies: [{ name: "session", value: "abc123" } as chrome.cookies.Cookie],
    referrer: "https://example.com/page",
    ...overrides,
  };
}

test("buildCurlCommand includes cookie header and output flag", () => {
  const cmd = buildCurlCommand(ctx());
  assert.match(cmd, /^'curl' -L -o 'file\.zip'/);
  assert.match(cmd, /-H 'Cookie: session=abc123'/);
  assert.match(cmd, /'https:\/\/example\.com\/file\.zip'$/);
});

test("buildCurlCommand neutralizes a malicious filename instead of breaking out", () => {
  const malicious = "a'; rm -rf ~; echo '.zip";
  const cmd = buildCurlCommand(ctx({ filename: malicious }));
  // The -o argument must be exactly the escaped filename - single-quoted end
  // to end, so the shell never leaves the quoted string to run `rm`.
  assert.equal(cmd, `'curl' -L -o ${shellQuote(malicious)} -H 'Cookie: session=abc123' -H 'Referer: https://example.com/page' 'https://example.com/file.zip'`);
});

test("buildCurlCommand falls back to a filename derived from the URL", () => {
  const cmd = buildCurlCommand(ctx({ filename: null, url: "https://example.com/path/report.pdf" }));
  assert.match(cmd, /-o 'report\.pdf'/);
});

test("buildWgetCommand quotes the cookie header flag", () => {
  const cmd = buildWgetCommand(ctx());
  assert.match(cmd, /--header='Cookie: session=abc123'/);
});

test("mimicBrowserNavigation adds Sec-Fetch headers, off by default", () => {
  assert.doesNotMatch(buildCurlCommand(ctx()), /Sec-Fetch/);

  const cmd = buildCurlCommand(ctx(), { mimicBrowserNavigation: true });
  assert.match(cmd, /-H 'User-Agent: Mozilla/);
  assert.match(cmd, /-H 'Sec-Fetch-Mode: navigate'/);
  assert.match(cmd, /-H 'Sec-Fetch-Dest: document'/);
  assert.match(cmd, /-H 'Upgrade-Insecure-Requests: 1'/);
});

test("mimicBrowserNavigation classifies Sec-Fetch-Site from the referrer's registrable domain", () => {
  const sameSite = buildCurlCommand(
    ctx({ url: "https://download.example.com/f.zip", referrer: "https://example.com/page" }),
    { mimicBrowserNavigation: true },
  );
  assert.match(sameSite, /Sec-Fetch-Site: same-site/);

  const crossSite = buildCurlCommand(
    ctx({ url: "https://download.example.com/f.zip", referrer: "https://other.org/page" }),
    { mimicBrowserNavigation: true },
  );
  assert.match(crossSite, /Sec-Fetch-Site: cross-site/);

  const noReferrer = buildCurlCommand(ctx({ referrer: null }), { mimicBrowserNavigation: true });
  assert.match(noReferrer, /Sec-Fetch-Site: none/);
});

test("wget gets the same browser-navigation headers via --header", () => {
  const cmd = buildWgetCommand(ctx(), { mimicBrowserNavigation: true });
  assert.match(cmd, /--user-agent='Mozilla/);
  assert.match(cmd, /--header='Sec-Fetch-Mode: navigate'/);
});

test("isReauthCheckpoint recognizes Google's sign-in interstitial", () => {
  const interstitial =
    "https://accounts.google.com/v3/signin/interstitial/doritos/forward/success?continue=https://takeout-download.usercontent.google.com/download/f.zip";
  assert.equal(isReauthCheckpoint(interstitial), true);
});

test("isReauthCheckpoint is false for the real download host and other URLs", () => {
  assert.equal(isReauthCheckpoint("https://takeout-download.usercontent.google.com/download/f.zip"), false);
  assert.equal(isReauthCheckpoint("https://accounts.google.com/some/other/path"), false);
  assert.equal(isReauthCheckpoint("not a url"), false);
});

test("buildSshCommand nests an already-quoted inner command safely", () => {
  const inner = buildCurlCommand(ctx());
  const ssh = buildSshCommand("user@host", inner);
  assert.ok(ssh.startsWith("ssh 'user@host' '"));
  // The inner single quotes must have been escaped, not left to close the outer quote early.
  assert.ok(ssh.includes("'\\''"));
});
