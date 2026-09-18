# Chrome Web Store Publishing Setup

This document explains how to set up automatic publishing to the Chrome Web Store using GitHub Actions.

## Prerequisites

1. **Chrome Web Store Developer Account** ($5 one-time fee)
2. **Extension published at least once manually** to get the Extension ID
3. **Google Cloud Project** for API access

## Setup Steps

### 1. Get Chrome Web Store API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable **Chrome Web Store API**:
   - Search for "Chrome Web Store API"
   - Click "Enable"

4. Create OAuth 2.0 Credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: **Desktop app**
   - Name it (e.g., "Chrome Extension Publisher")
   - Save the **Client ID** and **Client Secret**

### 2. Get Refresh Token

Run this command (replace with your Client ID and Client Secret):

```bash
# Install required tool
npm install -g chrome-webstore-upload-cli

# Get refresh token (interactive)
chrome-webstore-upload init
```

Or manually:

1. Visit this URL (replace `YOUR_CLIENT_ID`):
```
https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob
```

2. Authorize and copy the authorization code

3. Exchange code for refresh token:
```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=AUTHORIZATION_CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"
```

4. Save the `refresh_token` from the response

### 3. Get Extension ID

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click on your extension
3. Copy the **Extension ID** from the URL or dashboard

### 4. Add Secrets to GitHub

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:

   - `CHROME_EXTENSION_ID`: Your extension ID (e.g., `abcdefghijklmnopqrstuvwxyz123456`)
   - `CHROME_CLIENT_ID`: OAuth Client ID
   - `CHROME_CLIENT_SECRET`: OAuth Client Secret  
   - `CHROME_REFRESH_TOKEN`: The refresh token from step 2

## Usage

Releases are triggered **only** by pushing a `v<major>.<minor>.<patch>` tag — there's no branch-based trigger. Only push a release tag once the target commit has passed CI and you've decided to actually ship it; pushing the tag is what starts the release, so treat it as the real "go" action, not a checkpoint.

1. Update the version in `src/manifest.json`:
```json
{
  "version": "1.0.1"
}
```
2. Commit that change normally (to `main`, via a PR, however this repo usually merges).
3. Once it's merged and CI is green, tag and push:
```bash
git tag v1.0.1
git push origin v1.0.1
```

The tag's version **must exactly match** `src/manifest.json`'s `version` — the workflow fails fast if they don't match, so bump the manifest first.

GitHub Actions will then:
- ✅ Validate the tag format and that it matches the manifest version
- ✅ Typecheck, test, and build (`npm run check`)
- ✅ Zip `dist/` and upload it both as a workflow artifact and a release asset
- ✅ Create a GitHub Release with auto-generated notes (from merged PRs/commits since the last release)
- ✅ Publish to the Chrome Web Store — **only if** all four store secrets are configured; otherwise it creates a **draft** release and tells you what's missing, instead of failing or silently skipping

## Workflow Details

The workflow runs only when a tag matching `v<major>.<minor>.<patch>` is pushed (e.g. `v1.0.0`). Anything else (`v1.0`, `1.0.0`, `release_1.0.0`) is rejected immediately with a clear error rather than being guessed at.

Steps:
1. Checkout code
2. Validate the tag format
3. Install dependencies, typecheck, test, and build (`npm run check`)
4. Verify the tag's version matches `dist/manifest.json`
5. Zip the contents of `dist/`
6. Upload the zip as a workflow artifact (kept regardless of what happens next)
7. Check whether Chrome Web Store secrets are configured
8. Create a GitHub Release — a **draft** if the secrets aren't configured, published otherwise — with auto-generated release notes and the zip attached
9. If secrets are configured, publish to the Chrome Web Store
10. Report what happened, and what manual step (if any) is still needed

## Troubleshooting

### "Tag doesn't match the required format" error
- Tags must be exactly `v<major>.<minor>.<patch>`, e.g. `v1.2.3` — no `release_`, no missing patch number

### "Tag doesn't match dist/manifest.json version" error
- Bump `version` in `src/manifest.json` to match the tag (or vice versa) before tagging

### "Extension not found" error
- Ensure you've published the extension manually at least once
- Double-check the Extension ID in GitHub secrets

### "Invalid refresh token" error
- Regenerate the refresh token using the steps above
- Update the `CHROME_REFRESH_TOKEN` secret in GitHub

### "Unauthorized" error
- Verify Client ID and Client Secret are correct
- Ensure Chrome Web Store API is enabled in Google Cloud Console

### Workflow not triggering
- Check that you pushed a tag matching `v<major>.<minor>.<patch>`, not just a commit

### Got a draft release instead of a publish
- This is expected when the four `CHROME_*` secrets aren't all configured yet — see Prerequisites above. Add them, then either re-run the workflow or publish the draft and upload the zip to the Chrome Web Store dashboard yourself.

## Security Notes

- Never commit API credentials to the repository
- Store all secrets in GitHub Secrets
- Refresh tokens have long expiration but can be revoked
- Only push release tags once a commit is on `main` and CI is green — a pushed tag immediately triggers this pipeline

## Testing Without Publishing

Simplest option: don't configure the four `CHROME_*` secrets in a fork or test repo. The workflow will still build, test, zip, and create a (draft) GitHub Release — it just skips the actual Chrome Web Store upload and tells you why.

To test on the real repo without publishing, temporarily comment out the "Publish to Chrome Web Store" step in `.github/workflows/publish.yml`.

## Manual Publishing Fallback

If GitHub Actions fails, or produced a draft release, you can always finish publishing manually:

1. Download `chrome_download_manager.zip` from the GitHub Release (or the workflow run's artifacts)
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Upload the new version
4. Submit for review

---

For questions or issues, see the [GitHub Actions logs](../../actions) for detailed error messages.
