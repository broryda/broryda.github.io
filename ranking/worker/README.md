# Ranking Submit Worker

`https://broryda.github.io/ranking/submit`는 정적 GitHub Pages라 쓰기(POST 저장)가 불가능합니다.  
이 Worker는 앱의 랭킹 제출을 받아 `ranking/ranking.json` + `ranking/ranking_public.json`을 GitHub API로 갱신합니다.

## 1) 준비

1. Cloudflare Workers 사용 가능 계정
2. GitHub Personal Access Token (repo contents write 권한)
3. 로컬에서:
```bash
cd ranking/worker
npm install
```

## 2) 시크릿 설정

```bash
npx wrangler secret put GITHUB_TOKEN
```

선택(보안 강화):
```bash
npx wrangler secret put SUBMIT_SHARED_KEY
```

앱에서 이 키를 `x-submit-key` 헤더로 보내야 합니다.

## 3) 배포

```bash
npx wrangler deploy
```

배포 후 endpoint:
- health: `GET https://<your-worker>.workers.dev/health`
- submit: `POST https://<your-worker>.workers.dev/submit`

## 4) 앱 연동

앱의 submit URL을 Worker URL로 변경하세요.

현재 앱 파일:
- `C:/flutter/SahwalReact/src/data/rankingStore.ts`

`RANKING_SUBMIT_URL`를 Worker URL로 교체하면 됩니다.

## 5) payload 형식

```json
{
  "deviceId": "dev_xxxx",
  "nickname": "사용자",
  "solvedCount": 123,
  "elo": 1450,
  "sentAt": "2026-04-26T12:00:00.000Z"
}
```

## 6) 처리 규칙

- deviceId 기준 중복 제거
- solvedCount 높은 기록 우선
- 동률이면 elo 높은 기록 우선
- 공개 파일(`ranking_public.json`)에는 deviceId 미포함

