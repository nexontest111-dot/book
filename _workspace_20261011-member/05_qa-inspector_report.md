# 05 QA 보고 (1차) — 회원 등록

qa-inspector 보고를 리더가 저장 (qa에 Write 권한 없음).
결론: 높음 0, 중간 2, 낮음 10, 참고 2. 004 SQL은 실제 DB 미실행 — SQL 판단은 코드 읽기 근거.

## 실행한 검사
- static-check.mjs: No problems found (단, me.js/http.js 의 fail()/InputError 코드는 수집 못 함).
- node --check: me.js, http.js, worker.js, admin-facilities.js, auth.js 통과.
- JS trim() 집합 = SQL CHECK 공백 집합, /\p{Cc}/u = SQL 제어 문자 범위(+U+0000) — 전수 비교 일치.
- worker.js 라우팅 가짜 pg/supabase 모듈 실행: GET/PUT /api/me 상태·코드, issuer 정규화, 본문 identity 무시, 회귀(health, auth/config, facilities, slots, admin) 정상.

## 미실행
- 004 SQL 실제 적용·문법, 동시 첫 요청 경합(실 DB 필요), wrangler dev/배포/브라우저/모바일.

## 결함
- M1 (api) me.js:68 — 22023 전체를 INVALID_DISPLAY_NAME 400 처리. message 가 INVALID_DISPLAY_NAME 일 때와 23514/22001 만 400, 나머지 22023·P0002 는 DATABASE_UNAVAILABLE + 로그.
- M2 (api+web) me.js:41-44, auth.js:98-100 — 인증 성공 후 DB 장애 시 GET /api/me 503 → 화면이 로그인 실패로 표시.
- L1 (api) me.js:6 — 3F000 미적용 코드 누락(문서 불일치).
- L2 (web) auth.js:61, auth.html:20 — 길이 UTF-16 기준, 계약은 code point.
- L3 (web) auth.js:23-33,74 — DATABASE_NOT_CONFIGURED 를 setup_required 로 처리 안 함.
- L4 (api 문서) 03 계약: 시각 형식 Z, updatedAt NOT NULL, 빈 본문 INVALID_JSON.
- L5 (api) me.js:20-24 — 짝 없는 서로게이트가 U+FFFD 로 저장됨. isWellFormed() 거부.
- L6 (api) — 예상 밖 DB 오류 로그 없음. console.error 로 SQLSTATE·메시지 상수만.
- L7 (web/api) — 서버 최악 21초 > 화면 제한 10초.
- L8 (web) auth.js:77-92 — 인증 상태 변경·늦은 응답이 PUT 결과·입력값을 덮어씀. revision 비교.
- L9 (docs) docs/supabase-connection.md:44 — "/api/me 는 회원 DB 등록을 하지 않으며" 갱신, 004 적용 절차 문서 없음.
- L10 (정책) 방향 제어·영폭 문자 허용 — 미정, 기록만.

## 참고
1. 정적 검사 스크립트가 fail()/InputError 코드 미수집.
2. issuer 는 SUPABASE_URL origin 기준 — URL 변경 시 회원 분리, 데이터 이전 필요.

# 2차 재검증 (동결 후)
결론: 높음 0. 1차 14건 중 해결 11, 일부 해결 1(L8), 미해결 2(L9 문서, L10 정책). 신규 낮음 3건(web).
실행: static-check 통과, node --check 5파일 통과, 가짜 모듈 라우트 실행 57건(GET/PUT 상태·코드, 서로게이트, Origin, 본문, 로그 내용, 라우팅 회귀) 정상.
미실행: 004 SQL 실제 적용, 동시 첫 요청 경합, 브라우저·모바일·wrangler·배포.
- N1 auth.js:68,80 — 같은 사용자 세션 갱신이 PUT 결과를 버림(revision 비교). 사용자 ID 비교 또는 getSession 뒤 저장.
- N2 auth.js:98-115 — 같은 사용자 GET 실패 시 회원 입력이 열린 채 남음. 실패 시 비활성.
- N3 auth.js:119 — active 상태 세션 갱신 시 수정 중 입력값 덮어씀.

# 3차 재검증 (auth.js N1~N3)
N1·N2·N3 해결, 신규 결함 없음. node --check 통과, 코드 추적. 브라우저·토큰 갱신·지연 재현 미실행.
참고: PUT 진행 중 GET 재렌더 시 입력이 잠시 활성으로 보임(memberBusy 가 제출 차단), 다시 시도 중 네트워크 오류 시 로그인 폼 표시(기존 동작).
남은 항목: L9 문서(doc-keeper), L10 정책 미정.
