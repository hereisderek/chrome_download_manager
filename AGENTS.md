# AGENTS.md

This file provides guidance to agents (Claude Code and others) when working with code in this repository.

## What this is

A Chrome Manifest V3 extension ("Advanced Download Manager") that intercepts every download, extracts cookies for the download's domain, and lets the user route the file to Chrome's built-in downloader, a local tool (FDM, IDM, cURL, wget), a remote service (qBittorrent Web UI, aria2 RPC, SSH+cURL), or export it as a standalone cURL script.

Source is TypeScript under `src/`, bundled by esbuild into a self-contained `dist/` tree (see `build.js`). There is no runtime framework — everything talks to `chrome.*` APIs directly.

## Commands

```bash
npm install
npm run build      # bundle src/ -> dist/ (load dist/ as the unpacked extension)
npm run watch       # rebuild JS bundles on change (static files are only copied at startup)
npm run typecheck   # tsc --noEmit
npm test            # node --test against src/**/*.test.ts (no build needed - Node strips types natively)
npm run check       # typecheck + test + build, in that order
```

Load `dist/`, not the repo root, via `chrome://extensions/` → Developer mode → Load unpacked. Reload from that page after editing `background/*` or `content/*`; popup/options changes just need the page reopened.

## Architecture

### Layout

```
src/
├── manifest.json      # copied to dist/ verbatim; references the bundled *.js paths below
├── background/         # service worker — the only place with side effects (chrome.downloads, notifications)
│   ├── index.ts          # entry point: imports the others for their listener side effects, nothing else
│   ├── downloadInterceptor.ts  # chrome.downloads.onCreated -> cancel + build a PendingDownload -> open popup
│   ├── messageRouter.ts        # chrome.runtime.onMessage -> routes to a downloader, replies to popup
│   ├── popupWindow.ts           # opens/closes the popup; POPUP_MODE toggles window vs. in-page overlay
│   ├── effects.ts                # downloadTextFile() (data: URL) + notify(), shared by several routes
│   └── state.ts                   # the service worker's in-memory state (pendingDownload, bypass flag, allow-list)
├── content/            # injected at document_start; tracks modifier-key-held clicks to bypass interception
├── popup/              # the per-download choice UI (opened by background as a popup window)
├── options/            # downloader CRUD UI, opened via chrome.runtime.openOptionsPage()
├── downloaders/         # pure(ish) builders, one file per downloader family
│   ├── local.ts            # fdm/idm/curl/wget -> a shell command string (background then exports it as a file)
│   └── remote.ts             # ssh-curl -> a command string; qbittorrent/aria2 -> a live fetch() call
├── shared/              # theme.css - design tokens shared by popup + options
└── lib/                 # no chrome.* side effects beyond the APIs each file is named for
    ├── types.ts             # PendingDownload, DownloaderConfig, DownloadChoice — the shared vocabulary
    ├── messages.ts            # the chrome.runtime message/response union + a typed sendMessage() wrapper
    ├── cookies.ts               # getCookiesForUrl(), cookie header/Netscape formatting
    ├── commands.ts               # curl/wget/ssh command string builders
    ├── shellQuote.ts               # POSIX single-quote escaping — see Security below
    ├── icons.ts                     # the handful of inline SVG icons used in popup/options
    └── storage.ts                    # chrome.storage.sync read/write for downloader configs
```

### Data flow

```
chrome.downloads.onDeterminingFilename (background/downloadInterceptor.ts)
  → cancel() + erase() the original download immediately, call suggest()
  → item.finalUrl (Chrome's post-redirect URL after all HTTP redirects) as the real target
  → item.filename (Content-Disposition resolved filename)
  → getCookiesForUrl() for that URL's domain + registrable root domain + referrer
  → state.setPendingDownload() + popupWindow.openDownloadPopup()

popup (src/popup) reads the pending download and the user's saved downloaders via storage.ts,
renders one button per enabled downloader, and on click sends a `handleDownload` message.

messageRouter.ts dispatches on choice.kind:
  chrome        -> allow-list the URL, then chrome.downloads.download() for real
  local         -> downloaders/local.ts builds a command -> saved as a .txt file + notification
  remote        -> ssh-curl: same as local, saved as .sh
                   qbittorrent/aria2: downloaders/remote.ts makes the API call directly
(curl/wget "export command" is a separate `exportCommand` message so the popup gets the command
 text back to show in an inline copy panel, rather than a fire-and-forget route through
 handleDownload)
```

**Do not reintroduce a `chrome.webRequest`-based redirect tracker.** An earlier version of this
extension (both the original and an early rewrite pass) hand-rolled redirect-chain tracking via
`onBeforeRequest`/`onBeforeRedirect`/`onCompleted` to guess the "real" download URL, including a
fallback that scanned every redirect seen anywhere in the browser for one that merely looked like
a download. That heuristic was a race condition, not a fix — proven by it grabbing a Google
sign-in interstitial's URL instead of a Takeout export's real file. `chrome.downloads.DownloadItem`
already exposes `finalUrl` ("after all redirects", since Chrome 54) for free, correctly, with no
extension-side guessing.

**Intercept at `chrome.downloads.onDeterminingFilename`, not `onCreated`:** `onCreated` fires
before the HTTP request has been sent or any redirects followed, so `item.finalUrl` at `onCreated`
is still the pre-redirect URL, and cancelling immediately in `onCreated` prevents Chrome from
ever resolving the redirect. By intercepting at `onDeterminingFilename`, Chrome's native network
stack completes the authenticated redirect chain (e.g. `takeout.google.com` →
`takeout-download.usercontent.google.com`), resolves the `Content-Disposition` filename, and
provides the genuine destination URL before the file is saved to disk.

### Popup presentation: window vs. overlay

`popupWindow.ts`'s `POPUP_MODE` constant picks how the download-choice UI is shown:
- **`"window"`** (default) — a `chrome.windows.create` popup. The original, reliable behavior.
- **`"overlay"`** — injects the same `popup/index.html` as an iframe into the tab that triggered the
  download (`content/index.ts` handles `showDownloadOverlay`/`hideDownloadOverlay` messages), so it's
  an ordinary part of that page's DOM instead of a separate window type most tab-based tooling
  (including other extensions) can't see into. Tried this specifically to make the popup
  automatable for debugging. Real downsides found in practice: the host page's own
  Permissions-Policy can veto `navigator.clipboard` inside the iframe (worked around with an
  `execCommand('copy')` fallback in `popup/index.ts`, but that's not guaranteed everywhere either),
  and it does nothing about — arguably makes more confusing — an unrelated race against Chrome's
  own "ask where to save each file" dialog (see below). Kept both implementations so this is a
  one-line flip to revisit, not a rewrite.

### Known Chrome-level constraints (not bugs to "fix")

- **"Ask where to save each file before downloading" races our interception.** With that Chrome
  setting on, Chrome's native save-location picker is part of creating the download and isn't
  guaranteed to wait for an extension's `chrome.downloads.cancel()` — especially after the service
  worker was idle and needs to wake up first. If interception seems to randomly not happen, check
  this setting before assuming a code regression.
- **`chrome.downloads.download()` rejects "unsafe" headers.** `Referer`, `Cookie`, `Origin`, `Host`,
  and others from the forbidden-header list throw `Unsafe request header name` if passed in
  `headers`. The "chrome" routing choice never needs them anyway — it's a real browser request with
  real cookies attached automatically.
- **Some Google endpoints intermittently require a real browser, not just correct cookies.**
  Google Takeout's bulk-export host sometimes (not always — it's a per-request risk decision on
  Google's side) interposes a re-authentication interstitial
  (`accounts.google.com/.../interstitial/...`) that a plain `curl`/`wget` process cannot pass,
  while Chrome's own downloader can. `lib/commands.ts`'s `isReauthCheckpoint()` detects this and
  surfaces a warning in the popup rather than silently handing over a command that can't work for
  that specific attempt.

### Security: shell-command generation

Downloader commands are built from data a remote site controls (URL, filename via Content-Disposition, cookies) and are written out as a `.sh`/`.txt` file the user later executes. Every value interpolated into a generated command goes through `lib/shellQuote.ts` (POSIX single-quote escaping) — never bare `"${value}"` interpolation, which would let a crafted filename break out of the quotes and run arbitrary shell code. `lib/commands.test.ts` and `lib/shellQuote.test.ts` exist specifically to guard this.

### Adding a new downloader type

Touches: the type in `lib/types.ts` (`LocalDownloaderType`/`RemoteDownloaderType`), a case in `downloaders/local.ts` or `downloaders/remote.ts`, the icon/description maps in `popup/index.ts`, and the type-specific form fields + `<option>` in `options/index.html` (+ the branch in `options/index.ts` that reads/writes those fields).

### Storage schema (`chrome.storage.sync`)

```ts
{
  localDownloaders: LocalDownloaderConfig[],   // { name, type, path, description?, enabled }
  remoteDownloaders: RemoteDownloaderConfig[], // { name, type, description?, enabled, ...type-specific fields }
}
```
`chrome.storage.sync` has a ~100KB quota, capping how many downloaders a user can configure. Remote credentials (e.g. qBittorrent password) sync across devices unencrypted — this is a known, documented limitation, not a bug to fix quietly.

## Conventions

- Async/await, not promise chains.
- No `innerHTML` with interpolated data anywhere in `popup/` or `options/` — build DOM nodes and set `.textContent`, since downloader names/descriptions are user-editable and would otherwise be a stored-XSS vector.
- Background-only state (pending download, bypass flag, allow-list) lives in `background/state.ts`; don't reintroduce module-level `let` globals scattered across other background files.
