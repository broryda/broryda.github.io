# 정석 Secret Editor - Google Sheets CMS

이 폴더는 `joseki/secret-sgf-comment-editor-8f4c2a9.html`에서 사용할 Google Sheets 저장소용 Apps Script 코드입니다.

## 의도

- secret 페이지에서만 정석 수순/코멘트를 수정합니다.
- 앱/웹 학습 화면은 빌드 시 포함된 SGF/JS 데이터를 사용합니다.
- Google Sheets는 관리자 편집용 저장소이며, GitHub 커밋/Pages 배포를 기다리지 않습니다.

## 설정 순서

1. Google Sheets에서 새 스프레드시트를 만듭니다.
2. `확장 프로그램 > Apps Script`를 엽니다.
3. `Code.gs` 내용을 붙여넣습니다.
4. `setAdminKey()` 함수 안의 `CHANGE_ME_TO_RANDOM_SECRET`을 원하는 긴 랜덤 문자열로 바꿉니다.
5. Apps Script에서 `setupJosekiSheets()`를 한 번 실행해 `Joseki`, `Moves` 시트를 만듭니다.
6. Apps Script에서 `setAdminKey()`를 한 번 실행합니다.
7. `배포 > 새 배포 > 웹 앱`으로 배포합니다.
   - 실행 사용자: 나
   - 액세스 권한: 링크가 있는 모든 사용자 또는 모든 사용자
8. 배포된 `/exec` URL과 관리자 키를 secret 페이지에 입력합니다.
9. 최초 1회 `전체 업로드`를 눌러 현재 내장 데이터를 스프레드시트로 이관합니다.

## 시트 구조

### Joseki

정석 단위 메타데이터와 SGF 문자열을 저장합니다.

### Moves

정석별 수순과 수순별 코멘트를 저장합니다.

## 주의

- 관리자 키는 앱이나 공개 학습 화면에는 넣지 않습니다.
- secret 페이지의 URL과 관리자 키가 노출되면 쓰기 권한이 노출됩니다.
- Google Sheets 데이터는 앱 빌드에 자동 반영되지 않습니다. 앱 빌드 시에는 별도 변환/동기화 단계로 SGF 파일을 포함해야 합니다.
