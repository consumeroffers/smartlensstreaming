# SmartLensLK Stream

Production-oriented video catalogue and streaming frontend using GitHub Pages, Google Apps Script and Google Sheets.

## Architecture
- GitHub Pages: static public website (`/`) and isolated admin interface (`/admin/`)
- Google Apps Script: API, authentication, authorization, validation and CRUD
- Google Sheets: video records and settings
- Video playback: approved external iframe providers. This project does not host/transcode video files.

## 1. Create the Google Sheet
1. Create a new Google Spreadsheet.
2. Open **Extensions → Apps Script**.
3. Replace the editor contents with `backend/Code.gs` from this project.
4. Save the project.

The `setupDatabase()` function creates the `Videos` and `Settings` tabs and headers. Run it once and authorize the script.

## 2. Configure the admin login
In Apps Script, edit `setInitialAdminCredentials()`:
- Change `ADMIN_USERNAME`
- Change `ADMIN_PASSWORD` to a long unique password (at least 16 characters)

Run `setInitialAdminCredentials()` once. It stores a SHA-256 password hash and a random signing secret in Script Properties. Then remove the plaintext password from the function (or replace it with a throw) and save. Never publish the Apps Script source with a real password in it.

## 3. Deploy the Apps Script API
1. **Deploy → New deployment → Web app**
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Deploy and copy the `/exec` URL.
5. The script owner must keep ownership of the spreadsheet and deployment.

The API is public-facing, but admin mutations require a signed session token. Do not share the admin password. Re-deploy a new version after backend changes.

## 4. Configure the frontend
Edit `assets/config.js` and set `API_URL` to the Apps Script `/exec` URL.

## 5. Publish on GitHub Pages
1. Upload the contents of this project to the root of a GitHub repository.
2. In **Settings → Pages**, publish from the `main` branch and `/ (root)`.
3. Open the generated GitHub Pages URL.
4. Admin URL: `https://YOUR-USERNAME.github.io/YOUR-REPO/admin/`

## UI design
- Public interface uses a YouTube-inspired layout: fixed header, search, collapsible sidebar, category chips and responsive video grid.
- Palette follows the supplied reference: slate/charcoal background tones, white surfaces and vivid orange-red accents.
- Admin login uses a centered white card over a charcoal geometric background; the dashboard follows the same palette.

## Admin functions
- Secure login with signed 6-hour session
- Add, edit, delete, publish and unpublish videos
- Title, thumbnail URL, iframe embed code and optional description
- Server-side validation and provider allowlist
- Public API returns published videos only

## Video embed support
Paste a provider iframe embed snippet. The backend extracts and validates the iframe `src`; it does not store arbitrary HTML. Allowed hosts include YouTube, YouTube-nocookie, Vimeo player and Dailymotion. Add other providers only after reviewing their security model in `isAllowedVideoHost_()`.

## Important production notes
- This project stores video metadata, not video files. Use an approved video platform/CDN for the actual stream.
- Use HTTPS URLs for thumbnails and embeds.
- The Google Apps Script web app has quotas and execution limits. For a large commercial streaming service, a dedicated backend and video CDN would eventually be required.
- GitHub Pages is static hosting. The admin page is not secret because of its URL; security is enforced by the backend.
- The iframe form transport avoids relying on permissive CORS headers from Apps Script.
- Protect the Google account that owns the Sheet and Apps Script with 2-step verification.
- Back up the spreadsheet regularly.


## Login troubleshooting
- Confirm `assets/config.js` contains the deployed Apps Script Web App URL ending in `/exec` (not `/dev`).
- In Apps Script, deploy as **Execute as: Me** and **Who has access: Anyone**.
- After changing `Code.gs`, use **Deploy → Manage deployments → Edit → New version → Deploy**.
- Run `setupDatabase()` once and `setInitialAdminCredentials()` once in the bound Apps Script project.
- The username and password must exactly match the values used when `setInitialAdminCredentials()` was run.
- If login displays a timeout, open the Apps Script deployment URL in a browser and confirm it responds with `SmartLensLK Stream API is running.`
- Browser developer tools → Console can show configuration or network errors. Never share your admin password or session token.


## API URL and admin credentials update
- `assets/config.js` is preconfigured with the Web App URL supplied by the project owner.
- Admin credentials are now stored in the private Google Sheet `Settings` tab as `ADMIN_USERNAME` and `ADMIN_PASSWORD`, exactly as entered. No password hashing or case conversion is performed.
- Run `setupDatabase()` once, then run `setInitialAdminCredentials()` from the bound Apps Script editor and enter the username/password in the prompts.
- Because the password is stored as readable text, restrict the Google Sheet to trusted owners only. Do not share the Settings tab or spreadsheet publicly. This is less secure than salted password hashing.
- After replacing `Code.gs`, deploy a **New version** of the existing Web App deployment. The URL remains the same if you edit the existing deployment.
- The frontend URL configured is: `https://script.google.com/macros/s/AKfycbyoElaxtj0_AFIoJc0u55uAKqwlFse72PXl85KDPoaCo9vQeJklw7LRrJrTu3Zjkqslvw/exec`


## Important: fix the Admin login response timeout
This build changes the Apps Script `doPost()` HTML bridge to call `window.top.postMessage(...)`. Apps Script HtmlService can run inside an intermediate Google sandbox frame, so `parent.postMessage(...)` may send the response to Google's wrapper instead of the GitHub Pages admin page.
After replacing `backend/Code.gs` in the bound Apps Script project:
1. Save the Apps Script project.
2. Open **Deploy → Manage deployments**.
3. Click the pencil icon on the Web App deployment.
4. Select **New version**, then click **Deploy**.
5. Keep **Execute as: Me** and **Who has access: Anyone**.
6. Reload the GitHub Pages Admin page with Ctrl+F5 and try again.
The frontend must use the same `/exec` deployment URL in `assets/config.js`.
