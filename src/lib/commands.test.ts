import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCurlCommand, buildWgetCommand, buildSshCommand, compressShellCommand, isReauthCheckpoint, renderCommandTemplate, validateCommandTemplate, resolveRemotePath } from "./commands.ts";
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
  assert.match(cmd, /^'curl' -L --location-trusted -o 'file\.zip'/);
  assert.match(cmd, /-b 'session=abc123'/);
  assert.match(cmd, /'https:\/\/example\.com\/file\.zip'$/);
});

test("buildCurlCommand neutralizes a malicious filename instead of breaking out", () => {
  const malicious = "a'; rm -rf ~; echo '.zip";
  const cmd = buildCurlCommand(ctx({ filename: malicious }));
  // The -o argument must be exactly the escaped filename - single-quoted end
  // to end, so the shell never leaves the quoted string to run `rm`.
  assert.equal(cmd, `'curl' -L --location-trusted -o ${shellQuote(malicious)} -b 'session=abc123' -H 'Referer: https://example.com/page' 'https://example.com/file.zip'`);
});

test("buildCurlCommand falls back to a filename derived from the URL", () => {
  const cmd = buildCurlCommand(ctx({ filename: null, url: "https://example.com/path/report.pdf" }));
  assert.match(cmd, /-o 'report\.pdf'/);
});

test("buildWgetCommand quotes the cookie header flag", () => {
  const cmd = buildWgetCommand(ctx());
  assert.match(cmd, /--header='Cookie: session=abc123'/);
});

test("buildCurlCommand includes browser navigation headers when requested", () => {
  const cmd = buildCurlCommand(ctx(), { mimicBrowserNavigation: true });
  assert.ok(cmd.includes("-H 'Sec-Fetch-Mode: navigate'"));
  assert.ok(cmd.includes("-H 'Sec-Fetch-Dest: document'"));
  assert.ok(cmd.includes("-H 'Upgrade-Insecure-Requests: 1'"));
});

test("buildWgetCommand includes browser navigation headers when requested", () => {
  const cmd = buildWgetCommand(ctx(), { mimicBrowserNavigation: true });
  assert.ok(cmd.includes("--header='Sec-Fetch-Mode: navigate'"));
  assert.ok(cmd.includes("--header='Sec-Fetch-Dest: document'"));
});

test("buildCurlCommand supports custom outputFilename and creates dirs when needed", () => {
  const cmd = buildCurlCommand(ctx(), { outputFilename: "/var/downloads/custom.zip" });
  assert.ok(cmd.includes("--create-dirs -o '/var/downloads/custom.zip'"));
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

test("buildSshCommand supports port, key file, key content, and password options", () => {
  const inner = "curl example.com";
  const withPort = buildSshCommand("user@host", inner, { port: 2222 });
  assert.ok(withPort.startsWith("ssh -p 2222 'user@host' 'curl example.com'"));

  const withKey = buildSshCommand("user@host", inner, { keyFile: "~/.ssh/id_rsa" });
  assert.ok(withKey.includes("-i '~/.ssh/id_rsa'"));

  const withKeyContent = buildSshCommand("user@host", inner, { keyContent: "KEY_DATA" });
  assert.ok(withKeyContent.includes("-i <(printf '%s\\n' 'KEY_DATA')"));

  const withPass = buildSshCommand("user@host", inner, { password: "secret'pass" });
  assert.ok(withPass.startsWith("sshpass -p 'secret'\\''pass' ssh 'user@host'"));
});

test("resolveRemotePath resolves directories and file paths", () => {
  assert.equal(resolveRemotePath(undefined, "file.zip"), undefined);
  assert.equal(resolveRemotePath("", "file.zip"), undefined);
  assert.equal(resolveRemotePath("/var/downloads/", "file.zip"), "/var/downloads/file.zip");
  assert.equal(resolveRemotePath("/var/downloads", "file.zip"), "/var/downloads/file.zip");
  assert.equal(resolveRemotePath("/var/downloads/archive.tar.gz", "file.zip"), "/var/downloads/archive.tar.gz");
});

test("renderCommandTemplate replaces core placeholders with auto-quoting", async () => {
  const template = "aria2c -x 16 -o <filename> --header=\"Cookie: <cookie>\" <url>";
  const result = await renderCommandTemplate(template, ctx({ filename: "My Archive (1).zip" }));
  assert.equal(
    result,
    "aria2c -x 16 -o 'My Archive (1).zip' --header=\"Cookie: session=abc123\" 'https://example.com/file.zip'",
  );
});

test("renderCommandTemplate supports flexible matching and all placeholder types", async () => {
  const template = "custom-tool --url={download link} --file={output file name} --host=<host> --ref=<referer> <browser_headers>";
  const result = await renderCommandTemplate(template, ctx({ url: "https://dl.example.com/item.bin", filename: "item.bin" }));
  assert.ok(result.includes("--url='https://dl.example.com/item.bin'"));
  assert.ok(result.includes("--file='item.bin'"));
  assert.ok(result.includes("--host='dl.example.com'"));
  assert.ok(result.includes("--ref='https://example.com/page'"));
  assert.ok(result.includes("-H 'Sec-Fetch-Mode: navigate'"));
});

test("renderCommandTemplate compresses cookies when compressCookies option is true", async () => {
  const template = "curl -o <filename> -b <cookie> <url>";
  const result = await renderCommandTemplate(template, ctx(), { compressCookies: true });
  assert.match(result, /-b "\$\(printf '%s' '[A-Za-z0-9+/=]+' \| base64 -d \| gzip -dc\)"/);
});

test("validateCommandTemplate accepts valid placeholders and formats", () => {
  assert.deepEqual(validateCommandTemplate("aria2c -o <filename> <url>"), { valid: true });
  assert.deepEqual(validateCommandTemplate("curl -b {cookie} -H {user_agent} {download link}"), { valid: true });
  assert.deepEqual(validateCommandTemplate("wget --header='Cookie: <cookie>' <browser_headers> <host>"), { valid: true });
});

test("validateCommandTemplate rejects empty or malformed templates", () => {
  assert.equal(validateCommandTemplate("   ").valid, false);
  assert.equal(validateCommandTemplate("curl -o <filename <url>").valid, false);
  assert.equal(validateCommandTemplate("curl -o {filename <url>").valid, false);
});

test("validateCommandTemplate rejects unknown placeholders", () => {
  const res = validateCommandTemplate("curl -o <output> --token=<auth_token> <url>");
  assert.equal(res.valid, false);
  assert.ok(res.error?.includes("<output>"));
  assert.ok(res.error?.includes("<auth_token>"));
});

test("compressShellCommand compresses an entire command into an eval one-liner", async () => {
  const fullCmd = "curl -L -o 'file.zip' -b 'session=12345' 'https://example.com/file.zip'";
  const compressed = await compressShellCommand(fullCmd);
  assert.match(compressed, /^eval "\$\(printf '%s' '[A-Za-z0-9+/=]+' \| base64 -d \| gzip -dc\)"$/);
});


