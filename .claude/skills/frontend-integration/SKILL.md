---
name: frontend-integration
description: "플레이약속 prototype/ 화면(HTML·CSS·바닐라 JS) 구현과 /api 연결법. 화면 추가·수정, localStorage 데모를 실제 서버 데이터로 교체, Supabase 세션 토큰 전달, 오류 코드별 안내 문구, 모바일 레이아웃 작업 시 사용한다."
---

# 화면 구현과 API 연결

## 현재 구조
- 빌드 도구 없음. `prototype/`이 그대로 Worker 정적 자산으로 배포된다.
- `index.html` + `app.js` + `styles.css`: localStorage 기반 예약 데모(`readState`/`save`).
- `auth.html` + `auth.js` + `auth.css`: 실제 Supabase 이메일 가입·로그인. `/api/auth/config`에서 공개 키를 받아 클라이언트를 만든다.
- 외부 스크립트는 고정 버전 CDN만 사용한다(새로 추가할 때 버전 명시).

## API 호출 패턴 (auth.js를 따른다)
```js
const response = await fetch("/api/...", {
  headers: { Authorization: "Bearer " + session.access_token },
  cache: "no-store", signal: AbortSignal.timeout(10000) });
const body = await response.json();
if (!response.ok) { tell(messageFor(body.error?.code)); return; }
```
- 응답 경쟁 방지: 요청마다 `revision`을 올리고, 늦게 온 응답은 버린다.
- 쓰기 요청 중에는 버튼을 잠근다(`busy`). 멱등이 필요한 요청은 `Idempotency-Key`를 한 번 만들어 재시도에도 재사용한다.
- 오류 코드 → 한국어 안내 문구를 한곳(객체)에 모은다. 알 수 없는 코드는 일반 안내 + 재시도 안내.
- 계약 문서에 없는 필드는 쓰지 않는다.

## 데모와 실제 구분
- 데모 데이터가 남은 화면에는 "데모" 표시를 유지한다. 실제 서버 데이터로 바꾼 화면에서만 표시를 뗀다.
- 결제·확정·만료 상태는 서버 응답으로만 표시한다. 카운트다운은 서버가 준 만료 시각으로 계산하되 안내용이다.
- 상대방 결제 식별자·카드 정보는 표시하지 않고 납부 여부만 보인다.

## 화면 원칙
- 모바일 우선(좁은 화면에서 가로 스크롤 없음). 하단 탐색: 탐색·예약·협의·내 정보.
- 상태 문구는 '협의 중', '결제 대기', '예약 확정'을 명확히 구분.
- 시간은 Asia/Seoul로 표시(`Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ... })`).
- 사용자 입력은 `textContent`로 넣고 `innerHTML`에 서버·사용자 문자열을 넣지 않는다.

## 화면 노트 (`_workspace/04_frontend-developer_screens.md`)
바뀐 화면, 각 화면이 호출하는 API와 읽는 응답 필드, 처리하는 오류 코드, 남은 데모 영역.

## 자체 점검
- `node --check prototype/*.js`
- 계약의 오류 코드를 모두 문구에 매핑했는가
- 로그인 안 한 상태·토큰 만료 상태 화면이 있는가
