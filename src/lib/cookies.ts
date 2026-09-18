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
        if (domain.endsWith("googleusercontent.com")) {
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

    const seen = new Set<string>();
    return cookies.filter((c) => {
      const key = `${c.name}@${c.domain}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
