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

### Automatic Publishing

1. Update version in `manifest.json`:
```json
{
  "version": "1.0.1"
}
```

2. Commit changes to `publish` branch:
```bash
git add manifest.json
git commit -m "Bump version to 1.0.1"
git push origin main:publish
```

3. GitHub Actions will:
   - ✅ Create a zip file
   - ✅ Create a GitHub release with tag `v1.0.1`
   - ✅ Upload the zip to the release
   - ✅ Publish to Chrome Web Store

### Manual Trigger (Alternative)

You can also tag a release:
```bash
git tag v1.0.1
git push origin v1.0.1
```

## Workflow Details

The workflow runs when:
- Code is pushed to `publish` branch
- A tag matching `v*` is pushed (e.g., `v1.0.0`)

Steps:
1. Checkout code
2. Extract version from `manifest.json`
3. Create extension zip file (excludes git files, node_modules, etc.)
4. Create GitHub release with the version tag
5. Upload zip to GitHub release
6. Publish to Chrome Web Store
7. Show success notification

## Troubleshooting

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
- Check that you're pushing to the `publish` branch
- Or create a tag starting with `v`

## Security Notes

- Never commit API credentials to the repository
- Store all secrets in GitHub Secrets
- Refresh tokens have long expiration but can be revoked
- Limit access to the `publish` branch to trusted contributors

## Testing Without Publishing

To test the workflow without actually publishing:

1. Comment out the "Publish to Chrome Web Store" step in `.github/workflows/publish.yml`
2. Or use `publish: false` in that step
3. The workflow will still create releases and zip files

## Manual Publishing Fallback

If GitHub Actions fails, you can always publish manually:

1. Download the `chrome_download_manager.zip` from the GitHub release
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Upload the new version
4. Submit for review

---

For questions or issues, see the [GitHub Actions logs](../../actions) for detailed error messages.
