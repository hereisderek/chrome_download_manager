/**
 * Cookies for a URL's domain, plus its registrable root domain, deduped by name+domain.
 *
 * Chrome's `cookies.getAll({ domain })` already matches every subdomain of the
 * given value, so one extra call at the root picks up everything in between -
 * e.g. a Google download host like `takeout-download.usercontent.google.com`
 * needs the session cookies Google sets on `google.com`, two levels up, not
 * just its immediate parent (`usercontent.google.com`). Going one level up
 * only worked for exactly-3-label hosts; this reaches any depth in one call.
 *
 * The last-two-labels heuristic for "root domain" is wrong for compound
 * suffixes like `.co.uk` (would stop at `example.co.uk`... which is actually
 * still correct there, but `www.example.co.uk` would stop one label short of
 * where it should for a site keying cookies off `co.uk` itself - vanishingly
 * rare). Upgrade path if that ever bites: resolve the real registrable domain
 * with a public-suffix-list package instead of assuming two labels.
 */
/**
 * Checks if a cookie is valid to send to targetUrl based on domain, path, and security rules.
 * Sibling subdomains (e.g. mail.google.com, drive.google.com) are strictly excluded from
 * being sent to other hosts (e.g. takeout-download.usercontent.google.com).
 */
export function cookieMatchesUrl(cookie: chrome.cookies.Cookie, targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname.toLowerCase();
    const cookieDomain = (cookie.domain || "").toLowerCase().replace(/^\./, "");

    // Path check: cookie path must match URL path prefix
    const pathname = parsed.pathname || "/";
    const cookiePath = cookie.path || "/";
    if (!pathname.startsWith(cookiePath) && cookiePath !== "/") {
      return false;
    }

    // Secure check: secure cookies should only be sent over HTTPS
    if (cookie.secure && parsed.protocol !== "https:") {
      return false;
    }

    // Host-only cookie must match exact hostname
    if (cookie.hostOnly) {
      return hostname === cookieDomain;
    }

    // Domain cookie: hostname must match or be a subdomain of cookieDomain
    if (hostname === cookieDomain || hostname.endsWith("." + cookieDomain)) {
      return true;
    }

    // Special case for Google UserContent:
    // takeout-download.usercontent.google.com / *.googleusercontent.com
    // accepts root .google.com cookies (e.g. SID, HSID, SSID, APISID, etc.)
    // but MUST NOT receive sibling subdomain cookies (e.g. mail.google.com, drive.google.com)
    if (
      (hostname.endsWith("googleusercontent.com") || hostname.endsWith("usercontent.google.com")) &&
      cookieDomain === "google.com"
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function getCookiesForUrl(
  url: string,
  extraUrls: (string | null | undefined)[] = [],
): Promise<chrome.cookies.Cookie[]> {
  try {
    const urls = [url, ...extraUrls.filter((u): u is string => Boolean(u))];
    const domainsToQuery = new Set<string>();

    for (const u of urls) {
      try {
        const domain = new URL(u).hostname;
        domainsToQuery.add(domain);

        const domainParts = domain.split(".");
        if (domainParts.length > 2) {
          domainsToQuery.add(domainParts.slice(-2).join("."));
        }
        if (domain.endsWith("googleusercontent.com") || domain.endsWith("usercontent.google.com")) {
          domainsToQuery.add("google.com");
        }
      } catch {
        // ignore invalid URL
      }
    }

    const cookies: chrome.cookies.Cookie[] = [];
    for (const domain of domainsToQuery) {
      const found = await chrome.cookies.getAll({ domain });
      if (found) cookies.push(...found);
    }

    // Filter to cookies that actually match target URL (excludes unrelated subdomains)
    const validCookies = cookies.filter((c) => cookieMatchesUrl(c, url));

    // Deduplicate by cookie name, preferring more specific domain matches
    const byName = new Map<string, chrome.cookies.Cookie>();
    for (const c of validCookies) {
      const existing = byName.get(c.name);
      if (!existing) {
        byName.set(c.name, c);
      } else {
        const existingLen = (existing.domain || "").length;
        const newLen = (c.domain || "").length;
        if (newLen > existingLen) {
          byName.set(c.name, c);
        }
      }
    }

    return Array.from(byName.values());
  } catch (error) {
    console.error("Error getting cookies:", error);
    return [];
  }
}

/** `name=value; name=value` — for a Cookie header or a local tool's --cookies flag. */
export function formatCookieHeader(cookies: chrome.cookies.Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Netscape cookies.txt format, understood by curl/wget's --cookie-jar and most local downloaders. */
export function formatCookiesNetscape(cookies: chrome.cookies.Cookie[]): string {
  return cookies
    .map((c) => {
      const includeSubdomains = c.hostOnly ? "FALSE" : "TRUE";
      const secure = c.secure ? "TRUE" : "FALSE";
      const expires = Math.floor(c.expirationDate ?? 0);
      return `${c.domain}\t${includeSubdomains}\t${c.path}\t${secure}\t${expires}\t${c.name}\t${c.value}`;
    })
    .join("\n");
}

/**
 * Compresses a text string with gzip and returns a standard Base64 string.
 * Uses native Web Streams CompressionStream available in modern browsers and Node 18+.
 */
export async function compressText(text: string): Promise<string> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.length;
    }
  }
  const concatenated = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    concatenated.set(chunk, offset);
    offset += chunk.length;
  }
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < concatenated.length; i += chunkSize) {
    binary += String.fromCharCode(...concatenated.subarray(i, i + chunkSize));
  }
  return typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(concatenated).toString("base64");
}

export async function compressCookieHeader(cookieHeader: string): Promise<string> {
  return compressText(cookieHeader);
}

