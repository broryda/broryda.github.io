const JOSEKI_SHEET = "Joseki";
const MOVES_SHEET = "Moves";

const JOSEKI_HEADERS = [
  "id",
  "order",
  "title",
  "category",
  "filename",
  "path",
  "boardSize",
  "rootComment",
  "sgf",
  "active",
  "updatedAt",
];

const MOVES_HEADERS = ["josekiId", "moveNo", "color", "x", "y", "comment"];

function setupJosekiSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, JOSEKI_SHEET, JOSEKI_HEADERS);
  ensureSheet_(ss, MOVES_SHEET, MOVES_HEADERS);
}

function doGet(e) {
  try {
    setupJosekiSheets();
    const action = (e.parameter.action || "data").toLowerCase();
    if (action === "health") {
      return output_({ ok: true, message: "ok" }, e.parameter.callback);
    }
    if (action === "saveentry") {
      const body = JSON.parse(e.parameter.payload || "{}");
      saveEntry_(body.entry || body);
      return output_({ ok: true, saved: 1 }, e.parameter.callback);
    }
    if (action === "replaceall") {
      const body = JSON.parse(e.parameter.payload || "{}");
      replaceAll_(body.data || body);
      return output_({ ok: true, saved: body.data && body.data.entries ? body.data.entries.length : 0 }, e.parameter.callback);
    }
    return output_({ ok: true, data: readData_() }, e.parameter.callback);
  } catch (error) {
    return output_({ ok: false, error: String(error && error.message ? error.message : error) }, e && e.parameter && e.parameter.callback);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let requestId = "";
  try {
    setupJosekiSheets();
    const bodyText = e && e.parameter && e.parameter.payload
      ? e.parameter.payload
      : e && e.postData && e.postData.contents
        ? e.postData.contents
        : "{}";
    const body = JSON.parse(bodyText);
    requestId = body.requestId || "";
    if (body.action === "saveEntry") {
      saveEntry_(body.entry);
      return frameOutput_({ ok: true, saved: 1 }, requestId);
    }

    if (body.action === "replaceAll") {
      replaceAll_(body.data);
      return frameOutput_({ ok: true, saved: body.data && body.data.entries ? body.data.entries.length : 0 }, requestId);
    }

    throw new Error("Unknown action: " + body.action);
  } catch (error) {
    return frameOutput_({ ok: false, error: String(error && error.message ? error.message : error) }, requestId);
  } finally {
    lock.releaseLock();
  }
}

function readData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const josekiRows = rowsAsObjects_(ss.getSheetByName(JOSEKI_SHEET));
  const moveRows = rowsAsObjects_(ss.getSheetByName(MOVES_SHEET));
  const movesById = {};

  moveRows.forEach((row) => {
    const id = String(row.josekiId || "");
    if (!id) return;
    if (!movesById[id]) movesById[id] = [];
    movesById[id].push({
      moveNo: Number(row.moveNo) || 0,
      color: String(row.color || "B"),
      x: Number(row.x),
      y: Number(row.y),
      comment: String(row.comment || ""),
    });
  });

  Object.keys(movesById).forEach((id) => {
    movesById[id] = movesById[id]
      .sort((a, b) => a.moveNo - b.moveNo)
      .map((move) => ({
        color: move.color,
        x: move.x,
        y: move.y,
        comment: move.comment,
      }));
  });

  const entries = josekiRows
    .filter((row) => String(row.active).toUpperCase() !== "FALSE")
    .map((row) => ({
      id: String(row.id || ""),
      order: Number(row.order) || 0,
      title: String(row.title || ""),
      category: String(row.category || ""),
      filename: String(row.filename || ""),
      path: String(row.path || ""),
      boardSize: Number(row.boardSize) || 19,
      rootComment: String(row.rootComment || ""),
      sgf: String(row.sgf || ""),
      moves: movesById[String(row.id || "")] || [],
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return {
    version: 1,
    name: "Google Sheets 정석 데이터",
    skipped: [],
    entries,
  };
}

function saveEntry_(entry) {
  if (!entry || !entry.id) throw new Error("entry.id is required");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const josekiSheet = ss.getSheetByName(JOSEKI_SHEET);
  const movesSheet = ss.getSheetByName(MOVES_SHEET);

  upsertJosekiRow_(josekiSheet, entry);
  replaceMoveRows_(movesSheet, entry.id, entry.moves || []);
}

function replaceAll_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const josekiSheet = ss.getSheetByName(JOSEKI_SHEET);
  const movesSheet = ss.getSheetByName(MOVES_SHEET);
  const entries = data && data.entries ? data.entries : [];

  josekiSheet.clearContents();
  movesSheet.clearContents();
  josekiSheet.getRange(1, 1, 1, JOSEKI_HEADERS.length).setValues([JOSEKI_HEADERS]);
  movesSheet.getRange(1, 1, 1, MOVES_HEADERS.length).setValues([MOVES_HEADERS]);

  if (entries.length) {
    josekiSheet.getRange(2, 1, entries.length, JOSEKI_HEADERS.length).setValues(entries.map(josekiRow_));
    const moveRows = [];
    entries.forEach((entry) => {
      (entry.moves || []).forEach((move, index) => {
        moveRows.push(moveRow_(entry.id, move, index + 1));
      });
    });
    if (moveRows.length) {
      movesSheet.getRange(2, 1, moveRows.length, MOVES_HEADERS.length).setValues(moveRows);
    }
  }
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = headers.some((header, index) => current[index] !== header);
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowsAsObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = row[index];
    });
    return object;
  });
}

function upsertJosekiRow_(sheet, entry) {
  const values = sheet.getDataRange().getValues();
  const foundIndex = values.findIndex((row, index) => index > 0 && String(row[0]) === String(entry.id));
  const rowNumber = foundIndex >= 1 ? foundIndex + 1 : sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, JOSEKI_HEADERS.length).setValues([josekiRow_(entry)]);
}

function replaceMoveRows_(sheet, josekiId, moves) {
  const values = sheet.getDataRange().getValues();
  const header = values.length ? values[0] : MOVES_HEADERS;
  const remaining = values.slice(1).filter((row) => String(row[0]) !== String(josekiId));
  const nextRows = [header].concat(remaining);

  sheet.clearContents();
  sheet.getRange(1, 1, nextRows.length, MOVES_HEADERS.length).setValues(nextRows);

  const rows = moves.map((move, index) => moveRow_(josekiId, move, index + 1));
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, MOVES_HEADERS.length).setValues(rows);
  }
}

function josekiRow_(entry) {
  return [
    String(entry.id || ""),
    Number(entry.order) || "",
    String(entry.title || ""),
    String(entry.category || ""),
    String(entry.filename || ""),
    String(entry.path || ""),
    Number(entry.boardSize) || 19,
    String(entry.rootComment || ""),
    String(entry.sgf || ""),
    true,
    new Date(),
  ];
}

function moveRow_(josekiId, move, moveNo) {
  return [
    String(josekiId || ""),
    moveNo,
    String(move.color || "B"),
    Number(move.x),
    Number(move.y),
    String(move.comment || ""),
  ];
}

function output_(payload, callback) {
  const json = JSON.stringify(payload);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + json + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function frameOutput_(payload, requestId) {
  payload.requestId = requestId || "";
  const html = "<!doctype html><html><body><script>" +
    "window.parent.postMessage(" + JSON.stringify(payload) + ", '*');" +
    "</script></body></html>";
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
