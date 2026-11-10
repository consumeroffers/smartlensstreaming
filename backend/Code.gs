/**
 * SmartLensLK Stream API
 * Google Apps Script + Google Sheets
 */
const APP = {
  VIDEO_SHEET: "Videos",
  SETTINGS_SHEET: "Settings",
  SESSION_SECONDS: 6 * 60 * 60,
  MAX_TITLE: 180,
  MAX_DESCRIPTION: 5000,
  MAX_EMBED_LENGTH: 2000
};

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Bind this Apps Script project to your Google Spreadsheet first.");
  let videos = ss.getSheetByName(APP.VIDEO_SHEET);
  if (!videos) videos = ss.insertSheet(APP.VIDEO_SHEET);
  if (videos.getLastRow() === 0) {
    videos.appendRow(["id","title","thumbnail","embedUrl","description","published","createdAt","updatedAt"]);
    videos.setFrozenRows(1);
  }
  let settings = ss.getSheetByName(APP.SETTINGS_SHEET);
  if (!settings) settings = ss.insertSheet(APP.SETTINGS_SHEET);
  if (settings.getLastRow() === 0) {
    settings.appendRow(["key","value"]);
    settings.setFrozenRows(1);
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty("SHEET_ID", ss.getId());
  return "Database initialized.";
}

/**
 * Run this manually from the bound spreadsheet's Apps Script editor.
 * It prompts for credentials and stores them in the private Settings sheet.
 * NOTE: this stores the password as readable text in the spreadsheet.
 */
function setInitialAdminCredentials() {
  const ui = SpreadsheetApp.getUi();
  const userPrompt = ui.prompt("Set admin username", "Enter the admin username:", ui.ButtonSet.OK_CANCEL);
  if (userPrompt.getSelectedButton() !== ui.Button.OK) return "Cancelled.";
  const username = userPrompt.getResponseText().trim();
  if (!username) throw new Error("Username cannot be empty.");
  const passPrompt = ui.prompt("Set admin password", "Enter the admin password (at least 12 characters):", ui.ButtonSet.OK_CANCEL);
  if (passPrompt.getSelectedButton() !== ui.Button.OK) return "Cancelled.";
  const password = passPrompt.getResponseText();
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  const sh = getSettingsSheet_();
  writeSetting_(sh, "ADMIN_USERNAME", username);
  writeSetting_(sh, "ADMIN_PASSWORD", password);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("TOKEN_SECRET")) {
    props.setProperty("TOKEN_SECRET", Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  }
  return "Admin credentials saved in the Settings sheet.";
}

function getSettingsSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!id) throw new Error("Database is not initialized. Run setupDatabase() first.");
  const ss = SpreadsheetApp.openById(id);
  let sh = ss.getSheetByName(APP.SETTINGS_SHEET);
  if (!sh) sh = ss.insertSheet(APP.SETTINGS_SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(["key", "value"]);
  return sh;
}

function readSetting_(sh, key) {
  const values = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) return String(values[i][1]);
  }
  return "";
}

function writeSetting_(sh, key, value) {
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) {
      sh.getRange(i + 1, 2).setNumberFormat("@").setValue(String(value));
      return;
    }
  }
  sh.appendRow([key, String(value)]);
  sh.getRange(sh.getLastRow(), 2).setNumberFormat("@");
}

function doGet(e) {
  // Health check only. API operations are POST-only.
  return ContentService.createTextOutput("SmartLensLK Stream API is running.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let result;
  let nonce = "";
  try {
    const raw = e && e.parameter && e.parameter.payload ? e.parameter.payload : "";
    if (!raw) throw new Error("Missing API payload. Check the frontend API request.");
    const data = JSON.parse(raw);
    nonce = String(data.nonce || "");
    result = route_(data);
  } catch (err) {
    result = { ok: false, error: safeError_(err) };
  }
  const response = JSON.stringify({ nonce: nonce, result: result }).replace(/</g, "\\u003c");
  // HtmlService runs inside Google's sandboxed iframe. `parent` may be
  // Google's intermediate frame, not the GitHub Pages admin page. Send the
  // one-time response nonce directly to the top-level page instead.
  const html = '<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body><script>(function(){var message=' + response + ';try{window.top.postMessage(message,"*");}catch(e){try{window.parent.postMessage(message,"*");}catch(ignore){}}})();</script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function route_(data) {
  const action = String(data.action || "");
  if (action === "publicList") return { ok: true, videos: listVideos_(true) };
  if (action === "login") return login_(data);
  if (action === "adminList") {
    requireSession_(data.token);
    return { ok: true, videos: listVideos_(false) };
  }
  requireSession_(data.token);
  if (action === "create") return saveVideo_(data.video, false);
  if (action === "update") return saveVideo_(data.video, true);
  if (action === "delete") return deleteVideo_(data.id);
  if (action === "setPublished") return setPublished_(data.id, !!data.published);
  return { ok: false, error: "Unknown action." };
}

function getSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!id) throw new Error("Database is not initialized. Run setupDatabase().");
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheetByName(APP.VIDEO_SHEET);
  if (!sh) throw new Error("Videos sheet is missing.");
  return sh;
}

function listVideos_(publishedOnly) {
  const sh = getSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  const rows = values.slice(1);
  return rows.filter(r => r[0]).map(r => rowToVideo_(headers, r))
    .filter(v => !publishedOnly || v.published)
    .sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function rowToVideo_(headers, row) {
  const o = {};
  headers.forEach((h,i) => o[h] = row[i]);
  return {
    id: String(o.id || ""),
    title: String(o.title || ""),
    thumbnail: String(o.thumbnail || ""),
    embedUrl: String(o.embedUrl || ""),
    description: String(o.description || ""),
    published: o.published === true || String(o.published).toLowerCase() === "true",
    createdAt: String(o.createdAt || ""),
    updatedAt: String(o.updatedAt || "")
  };
}

function login_(data) {
  const props = PropertiesService.getScriptProperties();
  const settings = getSettingsSheet_();
  const username = readSetting_(settings, "ADMIN_USERNAME");
  const password = readSetting_(settings, "ADMIN_PASSWORD");
  if (!username || !password || !props.getProperty("TOKEN_SECRET")) {
    throw new Error("Admin credentials are not configured. Run setInitialAdminCredentials() from Apps Script.");
  }
  const suppliedUser = String(data.username || "").trim();
  const suppliedPassword = String(data.password || "");
  // Password is compared directly and exactly as entered; no hashing or case conversion.
  if (username !== suppliedUser || password !== suppliedPassword) {
    Utilities.sleep(500);
    return { ok: false, error: "Invalid username or password. Check the credentials in the Settings sheet." };
  }
  const now = Date.now();
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ sub: username, exp: now + APP.SESSION_SECONDS * 1000 }));
  const signature = sign_(payload);
  return { ok: true, token: payload + "." + signature, expiresAt: now + APP.SESSION_SECONDS * 1000 };
}

function requireSession_(token) {
  if (!token) throw new Error("Admin login required.");
  const parts = String(token).split(".");
  if (parts.length !== 2 || !constantTimeEqual_(sign_(parts[0]), parts[1])) throw new Error("Invalid admin session.");
  let payload;
  try { payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); }
  catch (_) { throw new Error("Invalid admin session."); }
  const settings = getSettingsSheet_();
  const currentUsername = readSetting_(settings, "ADMIN_USERNAME");
  if (!payload.sub || payload.sub !== currentUsername || Number(payload.exp) < Date.now()) {
    throw new Error("Admin session expired. Please log in again.");
  }
}

function saveVideo_(v, isUpdate) {
  if (!v || typeof v !== "object") throw new Error("Video data is missing.");
  const title = String(v.title || "").trim();
  const thumbnail = validateHttpsUrl_(String(v.thumbnail || "").trim(), "Thumbnail");
  const embedUrl = extractEmbedUrl_(String(v.embedCode || v.embedUrl || "").trim());
  const description = String(v.description || "").trim();
  if (!title || title.length > APP.MAX_TITLE) throw new Error("Title is required and must be under 180 characters.");
  if (description.length > APP.MAX_DESCRIPTION) throw new Error("Description is too long.");
  const sh = getSheet_();
  const now = new Date().toISOString();
  const data = sh.getDataRange().getValues();
  let rowIndex = -1;
  let id = String(v.id || "");
  if (isUpdate) {
    if (!id) throw new Error("Video ID is required.");
    for (let i=1;i<data.length;i++) if (String(data[i][0]) === id) { rowIndex = i+1; break; }
    if (rowIndex < 0) throw new Error("Video not found.");
  } else {
    id = Utilities.getUuid();
  }
  let createdAt = now;
  if (isUpdate) createdAt = String(data[rowIndex-1][6] || now);
  const row = [id, title, thumbnail, embedUrl, description, !!v.published, createdAt, now];
  if (isUpdate) sh.getRange(rowIndex,1,1,row.length).setValues([row]);
  else sh.appendRow(row);
  return { ok: true, video: rowToVideo_(["id","title","thumbnail","embedUrl","description","published","createdAt","updatedAt"], row) };
}

function deleteVideo_(id) {
  if (!id) throw new Error("Video ID is required.");
  const sh = getSheet_();
  const data = sh.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0]) === String(id)) {
      sh.deleteRow(i+1);
      return { ok: true };
    }
  }
  throw new Error("Video not found.");
}

function setPublished_(id, published) {
  const sh = getSheet_();
  const data = sh.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0]) === String(id)) {
      sh.getRange(i+1,6).setValue(!!published);
      sh.getRange(i+1,8).setValue(new Date().toISOString());
      return { ok: true };
    }
  }
  throw new Error("Video not found.");
}

function extractEmbedUrl_(code) {
  if (!code || code.length > APP.MAX_EMBED_LENGTH) throw new Error("Enter a valid video iframe embed code.");
  const match = code.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i);
  const candidate = match ? match[1] : code;
  const url = validateHttpsUrl_(candidate, "Video embed");
  // Apps Script V8 does not consistently expose the browser URL constructor.
  // Parse the hostname using a strict HTTPS URL pattern instead.
  const parsed = url.match(/^https:\/\/([^\/?#:@]+)(?::[0-9]+)?(?:[\/?#]|$)/i);
  if (!parsed) throw new Error("Video embed must be a valid HTTPS URL.");
  const host = parsed[1].toLowerCase().replace(/\.$/, "");
  if (!isAllowedVideoHost_(host)) throw new Error("This video provider is not allowed: " + host);
  return url;
}

function isAllowedVideoHost_(host) {
  const allowed = ["youtube.com","www.youtube.com","www.youtube-nocookie.com","youtube-nocookie.com",
    "player.vimeo.com","vimeo.com","www.dailymotion.com","dailymotion.com","geo.dailymotion.com",
    "playmogo.com","www.playmogo.com"];
  return allowed.indexOf(host) >= 0;
}

function validateHttpsUrl_(url, label) {
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) throw new Error(label + " must be a valid HTTPS URL.");
  return url;
}

function sign_(value) {
  const secret = PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");
  const sig = Utilities.computeHmacSha256Signature(value, secret);
  return Utilities.base64EncodeWebSafe(sig);
}
function constantTimeEqual_(a,b) {
  a=String(a); b=String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length,b.length);
  for(let i=0;i<n;i++) diff |= (a.charCodeAt(i%Math.max(1,a.length))||0) ^ (b.charCodeAt(i%Math.max(1,b.length))||0);
  return diff === 0;
}
function safeError_(err) {
  const msg = err && err.message ? err.message : "Unexpected server error.";
  return String(msg).slice(0,300);
}
