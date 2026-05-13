const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-submit-key,x-sotional-key",
};

function ok(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normKey(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const nickname = String(raw.nickname ?? "").trim();
  const deviceId = String(raw.deviceId ?? "").trim();
  const solvedCount = Math.max(0, toInt(raw.solvedCount, 0));
  const elo = Math.max(0, toInt(raw.elo, 0));
  if (elo > 3000) return null;
  const streakCurrent = Math.max(0, toInt(raw.streakCurrent, 0));
  const createdAt = String(raw.createdAt ?? "").trim();
  const lastSubmittedAt = String(raw.lastSubmittedAt ?? raw.sentAt ?? "").trim();
  if (!nickname) return null;
  return {
    nickname,
    solvedCount,
    elo,
    streakCurrent,
    ...(createdAt ? { createdAt } : {}),
    ...(deviceId ? { deviceId } : {}),
    ...(lastSubmittedAt ? { lastSubmittedAt } : {}),
  };
}

function dedupeAndSort(entries) {
  const byDevice = new Map();
  const noDevice = [];
  const ts = (row) => {
    const t = Date.parse(String(row?.lastSubmittedAt || ""));
    return Number.isFinite(t) ? t : 0;
  };
  const createdTs = (row) => {
    const t = Date.parse(String(row?.createdAt || ""));
    return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
  };
  for (const row of entries) {
    const deviceId = String(row.deviceId || "").trim();
    if (!deviceId) {
      noDevice.push(row);
      continue;
    }
    const prev = byDevice.get(deviceId);
    if (!prev) {
      byDevice.set(deviceId, row);
      continue;
    }
    const curTs = ts(row);
    const prevTs = ts(prev);
    const takeCurrent =
      curTs > prevTs ||
      (curTs === prevTs &&
        (row.solvedCount > prev.solvedCount ||
          (row.solvedCount === prev.solvedCount &&
            (row.elo > prev.elo ||
              (row.elo === prev.elo && row.streakCurrent > prev.streakCurrent)))));
    if (takeCurrent) {
      if (prev.createdAt && !row.createdAt) {
        row.createdAt = prev.createdAt;
      }
      byDevice.set(deviceId, row);
    } else if (!prev.createdAt && row.createdAt) {
      byDevice.set(deviceId, { ...prev, createdAt: row.createdAt });
    }
  }
  const out = [...Array.from(byDevice.values()), ...noDevice];
  out.sort(
    (a, b) =>
      b.elo - a.elo ||
      b.solvedCount - a.solvedCount ||
      b.streakCurrent - a.streakCurrent ||
      createdTs(a) - createdTs(b),
  );
  return out;
}

function buildPublicPayload(payload) {
  return {
    updatedAt: payload.updatedAt,
    entries: (payload.entries || []).map((e) => ({
      nickname: e.nickname,
      solvedCount: e.solvedCount,
      elo: e.elo,
      streakCurrent: e.streakCurrent,
      ...(e.createdAt ? { createdAt: e.createdAt } : {}),
    })),
  };
}

function dropStaleEntries(entries, staleMs = 7 * 24 * 60 * 60 * 1000) {
  const now = Date.now();
  return entries.filter((row) => {
    const t = Date.parse(String(row?.lastSubmittedAt || ""));
    if (!Number.isFinite(t)) return true;
    return now - t <= staleMs;
  });
}

function dropBannedEntries(entries, bannedNicknames, bannedDeviceIds) {
  const hardBannedNicknames = new Set(["노무쿤", "노알라"].map(normKey));
  return entries.filter((row) => {
    const nickname = normKey(row?.nickname);
    const deviceId = normKey(row?.deviceId);
    if (hardBannedNicknames.has(nickname)) return false;
    if (bannedNicknames?.has?.(nickname)) return false;
    if (deviceId && bannedDeviceIds?.has?.(deviceId)) return false;
    return true;
  });
}

async function loadBanConfig(env) {
  const banPath = env.RANKING_BAN_JSON_PATH || "ranking/device_ban.json";
  try {
    const file = await githubGetFile(env, banPath);
    const parsed = JSON.parse(file.text);
    const bannedNicknames = Array.isArray(parsed?.bannedNicknames)
      ? parsed.bannedNicknames.map((v) => normKey(v)).filter(Boolean)
      : [];
    const bannedDeviceIds = Array.isArray(parsed?.bannedDeviceIds)
      ? parsed.bannedDeviceIds.map((v) => normKey(v)).filter(Boolean)
      : [];
    return {
      path: banPath,
      sha: file.sha,
      raw: parsed,
      bannedNicknames: new Set(bannedNicknames),
      bannedDeviceIds: new Set(bannedDeviceIds),
    };
  } catch {
    return {
      path: banPath,
      sha: null,
      raw: { updatedAt: "", bannedNicknames: [], bannedDeviceIds: [] },
      bannedNicknames: new Set(),
      bannedDeviceIds: new Set(),
    };
  }
}

function calculateRatingDelta(winnerRating, loserRating, kFactor = 32) {
  const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
  const winnerDelta = Math.max(1, Math.round(kFactor * (1 - expectedWinner)));
  return winnerDelta;
}

async function githubGetFile(env, path) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ranking-submit-worker",
    },
  });
  if (!res.ok) {
    throw new Error(`github_get_failed:${res.status}`);
  }
  const data = await res.json();
  const rawBase64 = String(data.content || "").replace(/\n/g, "");
  const binary = atob(rawBase64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  const content = new TextDecoder("utf-8").decode(bytes);
  return { sha: data.sha, text: content };
}

async function githubPutFile(env, path, contentText, sha, message) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const bytes = new TextEncoder().encode(contentText);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const encoded = btoa(binary);
  const body = {
    message,
    content: encoded,
    branch: env.GITHUB_BRANCH,
    sha,
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "ranking-submit-worker",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`github_put_failed:${res.status}`);
  }
  return res.json();
}

async function updateRanking(env, incoming) {
  const rankingPath = env.RANKING_JSON_PATH || "ranking/ranking.json";
  const publicPath = env.RANKING_PUBLIC_JSON_PATH || "ranking/ranking_public.json";
  const nowIso = new Date().toISOString();

  const banConfig = await loadBanConfig(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const file = await githubGetFile(env, rankingPath);
    let payload;
    try {
      payload = JSON.parse(file.text);
    } catch {
      payload = { updatedAt: "", entries: [] };
    }

    const rows = Array.isArray(payload.entries) ? payload.entries : [];
    const normalized = rows.map(normalizeEntry).filter(Boolean);
    normalized.push(incoming);
    const merged = dedupeAndSort(
      dropBannedEntries(
        dropStaleEntries(normalized),
        banConfig.bannedNicknames,
        banConfig.bannedDeviceIds,
      ),
    );
    const nextPayload = {
      updatedAt: nowIso,
      entries: merged,
    };

    const nextText = `${JSON.stringify(nextPayload, null, 2)}\n`;
    const publicText = `${JSON.stringify(buildPublicPayload(nextPayload), null, 2)}\n`;

    try {
      await githubPutFile(
        env,
        rankingPath,
        nextText,
        file.sha,
        `chore: ranking update (${incoming.nickname})`,
      );

      const publicFile = await githubGetFile(env, publicPath);
      await githubPutFile(
        env,
        publicPath,
        publicText,
        publicFile.sha,
        "chore: refresh ranking_public.json",
      );
      return { ok: true, updatedAt: nowIso, total: merged.length };
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (!msg.includes("409") || attempt === 2) {
        throw e;
      }
    }
  }
  throw new Error("update_retry_exhausted");
}

async function updateSotionalRating(env, payload) {
  const usersPath = env.SOTIONAL_USERS_JSON_PATH || "sotional/data/users.json";
  const matchesPath = env.SOTIONAL_RATING_MATCHES_JSON_PATH || "sotional/data/rating_matches.json";
  const kFactor = Math.max(1, toInt(env.SOTIONAL_RATING_K_FACTOR ?? 32, 32));
  const nowIso = new Date().toISOString();

  const winnerId = toInt(payload?.winner_id, 0);
  const loserId = toInt(payload?.loser_id, 0);
  const memo = String(payload?.memo ?? "").trim().slice(0, 255);
  const recordedBy = toInt(payload?.recorded_by, 0) || winnerId;

  if (!winnerId || !loserId || winnerId === loserId) {
    return { ok: false, status: 400, error: "invalid_players" };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const usersFile = await githubGetFile(env, usersPath);
    const matchesFile = await githubGetFile(env, matchesPath);

    let users = [];
    let matches = [];
    try {
      const parsed = JSON.parse(usersFile.text);
      users = Array.isArray(parsed) ? parsed : [];
    } catch {
      users = [];
    }
    try {
      const parsed = JSON.parse(matchesFile.text);
      matches = Array.isArray(parsed) ? parsed : [];
    } catch {
      matches = [];
    }

    const winner = users.find((u) => toInt(u?.id, 0) === winnerId);
    const loser = users.find((u) => toInt(u?.id, 0) === loserId);
    if (!winner || !loser) {
      return { ok: false, status: 404, error: "user_not_found" };
    }

    const winnerBefore = Math.max(0, toInt(winner.rating, 1000));
    const loserBefore = Math.max(0, toInt(loser.rating, 1000));
    const winnerDelta = calculateRatingDelta(winnerBefore, loserBefore, kFactor);
    const loserDelta = -winnerDelta;
    const winnerAfter = winnerBefore + winnerDelta;
    const loserAfter = Math.max(0, loserBefore + loserDelta);

    winner.rating = winnerAfter;
    loser.rating = loserAfter;

    const nextMatchId = matches.reduce((maxId, row) => Math.max(maxId, toInt(row?.id, 0)), 0) + 1;
    const nextMatch = {
      id: nextMatchId,
      winner_id: winnerId,
      loser_id: loserId,
      winner_before: winnerBefore,
      loser_before: loserBefore,
      winner_after: winnerAfter,
      loser_after: loserAfter,
      winner_delta: winnerDelta,
      loser_delta: loserDelta,
      memo,
      played_at: nowIso,
      recorded_by: recordedBy,
    };
    const nextMatches = [nextMatch, ...matches];
    const nextUsers = [...users].sort(
      (a, b) =>
        toInt(b?.rating, 0) - toInt(a?.rating, 0) ||
        String(a?.username || "").localeCompare(String(b?.username || "")),
    );

    const usersText = `${JSON.stringify(nextUsers, null, 2)}\n`;
    const matchesText = `${JSON.stringify(nextMatches, null, 2)}\n`;

    try {
      await githubPutFile(
        env,
        usersPath,
        usersText,
        usersFile.sha,
        `chore: sotional rating users update (${winnerId} vs ${loserId})`,
      );
      await githubPutFile(
        env,
        matchesPath,
        matchesText,
        matchesFile.sha,
        `chore: sotional rating match added (${winnerId} vs ${loserId})`,
      );
      return { ok: true, status: 200, users: nextUsers, matches: nextMatches, updatedAt: nowIso };
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (!msg.includes("409") || attempt === 2) {
        throw e;
      }
    }
  }
  throw new Error("sotional_update_retry_exhausted");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: jsonHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return ok({ ok: true, service: "ranking-submit-worker" });
    }

    if (request.method === "GET" && path === "/api/sotional/health") {
      return ok({ ok: true, service: "sotional-rating-api" });
    }

    if (request.method === "POST" && path === "/submit") {
      if (!env.GITHUB_TOKEN) {
        return ok({ ok: false, error: "missing_github_token" }, 500);
      }

      if (env.SUBMIT_SHARED_KEY) {
        const key = request.headers.get("x-submit-key") || "";
        if (key !== env.SUBMIT_SHARED_KEY) {
          return ok({ ok: false, error: "unauthorized" }, 401);
        }
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return ok({ ok: false, error: "invalid_json" }, 400);
      }

      const incoming = normalizeEntry(body);
      if (!incoming || !incoming.deviceId) {
        return ok({ ok: false, error: "invalid_payload" }, 400);
      }

      const hardBannedNicknames = new Set(["노무쿤", "노알라"].map(normKey));
      const banConfig = await loadBanConfig(env);
      const incomingNickname = normKey(incoming.nickname);
      const incomingDeviceId = normKey(incoming.deviceId);
      const isNickBanned =
        hardBannedNicknames.has(incomingNickname) || banConfig.bannedNicknames.has(incomingNickname);
      const isDeviceBanned = banConfig.bannedDeviceIds.has(incomingDeviceId);
      if (isNickBanned || isDeviceBanned) {
        return ok(
          {
            ok: false,
            error: "banned",
            reason: isDeviceBanned ? "device_id_banned" : "nickname_banned",
          },
          403,
        );
      }

      if (!incoming.lastSubmittedAt) {
        incoming.lastSubmittedAt = new Date().toISOString();
      }
      if (!incoming.createdAt) {
        incoming.createdAt = incoming.lastSubmittedAt;
      }

      try {
        const result = await updateRanking(env, incoming);
        return ok(result, 200);
      } catch (e) {
        return ok({ ok: false, error: "update_failed", detail: String(e?.message || e) }, 500);
      }
    }

    if (request.method === "POST" && path === "/api/sotional/rating") {
      if (!env.GITHUB_TOKEN) {
        return ok({ ok: false, error: "missing_github_token" }, 500);
      }

      if (env.SOTIONAL_SUBMIT_SHARED_KEY) {
        const key = request.headers.get("x-sotional-key") || "";
        if (key !== env.SOTIONAL_SUBMIT_SHARED_KEY) {
          return ok({ ok: false, error: "unauthorized" }, 401);
        }
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return ok({ ok: false, error: "invalid_json" }, 400);
      }

      try {
        const result = await updateSotionalRating(env, body);
        if (!result.ok) {
          return ok(result, result.status || 400);
        }
        return ok(result, 200);
      } catch (e) {
        return ok({ ok: false, error: "update_failed", detail: String(e?.message || e) }, 500);
      }
    }

    return ok({ ok: false, error: "not_found" }, 404);
  },
};
