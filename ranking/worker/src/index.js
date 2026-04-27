const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-submit-key",
};

function ok(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const nickname = String(raw.nickname ?? "").trim();
  const deviceId = String(raw.deviceId ?? "").trim();
  const solvedCount = Math.max(0, toInt(raw.solvedCount, 0));
  const elo = Math.max(0, toInt(raw.elo, 0));
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
    const merged = dedupeAndSort(normalized);
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

    return ok({ ok: false, error: "not_found" }, 404);
  },
};
