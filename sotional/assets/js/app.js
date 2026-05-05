const BOARDS = {
  notice: '공지사항', free: '자유게시판', league: '리그', news: '뉴스', suggestion: '건의게시판'
};
const LEAGUE = { regular: '정기리그', half: '반기리그', tournament: '토너먼트' };

async function loadJson(path) {
  const r = await fetch(path);
  if (!r.ok) return [];
  return r.json();
}
function qs(name) { return new URLSearchParams(location.search).get(name); }

async function getSotionalApiBase() {
  try {
    const config = await loadJson('../ranking/ranking_config.json');
    const submitUrl = String(config?.submitUrl || "").trim();
    if (submitUrl.includes("/submit")) {
      return submitUrl.replace(/\/submit\/?$/, "");
    }
  } catch {}
  return "https://ranking-submit.broryda.workers.dev";
}

async function initDashboard() {
  const schedules = await loadJson('./data/schedules.json');
  const users = await loadJson('./data/users.json');
  const up = document.getElementById('upcoming');
  const ld = document.getElementById('leaders');
  if (!up || !ld) return;

  schedules.sort((a,b)=> (a.event_date+a.start_time).localeCompare(b.event_date+b.start_time));
  const upcoming = schedules.slice(0,5);
  up.innerHTML = upcoming.length ? upcoming.map(i => `<div class="compact-item"><strong>${i.title}</strong><span>${i.event_date}${i.start_time?` ${i.start_time}`:''}${i.location?` ${i.location}`:''}</span></div>`).join('') : '<div class="empty small">일정이 없습니다.</div>';

  users.sort((a,b)=> b.rating-a.rating || a.username.localeCompare(b.username));
  ld.innerHTML = users.slice(0,5).map((u,idx)=>`<div class="rank-item"><span>${idx+1}</span><strong>${u.username}</strong><em>${u.rating}</em></div>`).join('') || '<div class="empty small">회원이 없습니다.</div>';
}

async function initBoard() {
  const listEl = document.getElementById('post-list');
  if (!listEl) return;
  const board = qs('board') || 'notice';
  const leagueType = qs('league_type') || 'regular';
  const q = (qs('q') || '').trim().toLowerCase();

  const title = document.getElementById('board-title');
  const subtitle = document.getElementById('board-subtitle');
  title.textContent = board === 'league' ? LEAGUE[leagueType] || '리그' : BOARDS[board] || '게시판';
  subtitle.textContent = '조회 전용 페이지';

  const tabs = document.getElementById('league-tabs');
  if (tabs) {
    tabs.innerHTML = board === 'league' ? Object.entries(LEAGUE).map(([k,v]) => `<a class="${k===leagueType?'active':''}" href="./board.html?board=league&league_type=${k}">${v}</a>`).join('') : '';
  }

  const form = document.getElementById('search-form');
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    const v = document.getElementById('q').value.trim();
    const p = new URLSearchParams();
    p.set('board', board);
    if (board === 'league') p.set('league_type', leagueType);
    if (v) p.set('q', v);
    location.href = `./board.html?${p.toString()}`;
  };
  const qInput = document.getElementById('q');
  if (qInput) qInput.value = q;

  const posts = await loadJson('./data/posts.json');
  let rows = posts.filter(p => p.board === board);
  if (board === 'league') rows = rows.filter(p => (p.league_type || 'regular') === leagueType);
  if (q) rows = rows.filter(p => `${p.title} ${p.content} ${p.username}`.toLowerCase().includes(q));
  rows.sort((a,b)=> String(b.created_at).localeCompare(String(a.created_at)));

  listEl.innerHTML = rows.length ? rows.map(p=>`<article class="post-card"><a href="./post.html?id=${p.id}"><div><h2>${p.title}</h2><p>${p.content.slice(0,120)}${p.content.length>120?'...':''}</p></div>${p.image_path?`<img src="./assets/img/${p.image_path}" alt="">`:''}</a><footer>${p.username} · ${p.created_at}</footer></article>`).join('') : '<div class="empty">등록된 글이 없습니다.</div>';
}

async function initPostDetail() {
  const title = document.getElementById('post-title');
  if (!title) return;
  const id = Number(qs('id') || 0);
  const posts = await loadJson('./data/posts.json');
  const p = posts.find(x => x.id === id);
  if (!p) {
    title.textContent = '게시글 없음';
    document.getElementById('post-content').textContent = '해당 게시글을 찾을 수 없습니다.';
    return;
  }
  title.textContent = p.title;
  document.getElementById('post-meta').textContent = `${p.username} · ${p.created_at}`;
  document.getElementById('post-content').textContent = p.content;
  document.getElementById('back-link').href = `./board.html?board=${p.board}${p.league_type?`&league_type=${p.league_type}`:''}`;
  const img = document.getElementById('post-image');
  if (p.image_path) { img.style.display = 'block'; img.src = `./assets/img/${p.image_path}`; }
}

async function initSchedule() {
  const tbody = document.getElementById('schedule-table');
  if (!tbody) return;
  const schedules = await loadJson('./data/schedules.json');
  schedules.sort((a,b)=> (a.event_date+a.start_time).localeCompare(b.event_date+b.start_time));
  tbody.innerHTML = schedules.map(s=>`<tr><td>${s.event_date}</td><td>${s.start_time||''}</td><td>${s.title}</td><td>${s.location||''}</td><td>${s.content||''}</td></tr>`).join('') || '<tr><td colspan="5">일정 없음</td></tr>';
}

async function initRating() {
  const userT = document.getElementById('rating-users');
  if (!userT) return;
  let users = await loadJson('./data/users.json');
  let matches = await loadJson('./data/rating_matches.json');

  const draw = () => {
    users.sort((a,b)=> b.rating-a.rating || a.username.localeCompare(b.username));
    userT.innerHTML = users.map((u,i)=>`<tr><td>${i+1}</td><td>${u.username}</td><td>${u.role}</td><td><strong>${u.rating}</strong></td></tr>`).join('');
    const map = new Map(users.map(u=>[u.id,u.username]));
    const mt = document.getElementById('rating-matches');
    matches.sort((a,b)=> String(b.played_at).localeCompare(String(a.played_at)));
    mt.innerHTML = matches.map(m=>`<tr><td>${m.played_at}</td><td>${map.get(m.winner_id)||m.winner_id} ${m.winner_delta>0?`+${m.winner_delta}`:m.winner_delta}</td><td>${map.get(m.loser_id)||m.loser_id} ${m.loser_delta>0?`+${m.loser_delta}`:m.loser_delta}</td><td>${m.winner_before} -> ${m.winner_after}</td></tr>`).join('') || '<tr><td colspan="4">기록 없음</td></tr>';
    const winnerSel = document.getElementById('winner-id');
    const loserSel = document.getElementById('loser-id');
    if (winnerSel && loserSel) {
      const opts = `<option value=\"\">선택</option>${users.map(u=>`<option value=\"${u.id}\">${u.username} · ${u.rating}</option>`).join('')}`;
      winnerSel.innerHTML = opts;
      loserSel.innerHTML = opts;
    }
  };

  draw();

  const form = document.getElementById('rating-form');
  if (!form) return;
  const msg = document.getElementById('rating-message');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const winnerId = Number(document.getElementById('winner-id').value || 0);
    const loserId = Number(document.getElementById('loser-id').value || 0);
    const memo = document.getElementById('rating-memo').value.trim();
    if (!winnerId || !loserId || winnerId === loserId) {
      if (msg) msg.textContent = '승자/패자를 올바르게 선택해 주세요.';
      return;
    }
    if (msg) msg.textContent = '저장 중...';
    try {
      const base = await getSotionalApiBase();
      const res = await fetch(`${base}/api/sotional/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner_id: winnerId, loser_id: loserId, memo })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `http_${res.status}`);
      }
      users = Array.isArray(data.users) ? data.users : users;
      matches = Array.isArray(data.matches) ? data.matches : matches;
      draw();
      form.reset();
      if (msg) msg.textContent = '레이팅이 반영되었습니다.';
    } catch (err) {
      if (msg) msg.textContent = `저장 실패: ${String(err.message || err)}`;
    }
  });
}

initDashboard();
initBoard();
initPostDetail();
initSchedule();
initRating();
