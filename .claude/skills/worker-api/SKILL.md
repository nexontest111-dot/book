---
name: worker-api
description: "플레이약속 Cloudflare Worker(server/) API 구현법. 새 /api 엔드포인트 추가, 인증·회원·시설 운영자 권한 검사, pg 트랜잭션과 행 잠금, 오류 코드 규칙, API 계약 문서 작성 시 사용한다. SQL 스키마 자체를 바꾸는 작업은 supabase-migration 스킬을 쓴다."
---

# Worker API 구현

## 현재 구조
- `server/worker.js`: 단일 `fetch` 진입점. `/api` 외 경로는 `env.ASSETS`(prototype/)로 보낸다.
- `server/db.js`: `withDatabase(env, task)` — 요청마다 `pg` Client 연결·종료.
- `server/auth/supabase.js`: `authenticate(request, env)` → `{ user }` 또는 `{ error, status }`.
- 설정: `wrangler.development.jsonc`(Worker `book-development`, `HYPERDRIVE`, `ASSETS`, `nodejs_compat`).

## 라우트 추가 방법
- 라우트가 늘어나면 `server/routes/{영역}.js`로 나누고 `worker.js`는 분기만 맡게 한다. 한 번에 구조를 크게 바꾸지 말고 새로 추가하는 영역부터 분리한다.
- 응답은 기존 `json(body, status)`·`error(code, status)` 형태를 유지: 성공 `{ data, ... }`, 실패 `{ error: { code } }`. 공용 헬퍼로 옮길 때 형태를 바꾸지 않는다. 화면이 `body.error?.code`를 읽기 때문이다.
- 오류 코드는 `UPPER_SNAKE_CASE`. 화면이 재협의·다시 선택을 안내할 수 있게 원인을 구분한다(예: `PROPOSAL_OUTDATED`, `SLOT_UNAVAILABLE`, `HOLD_EXPIRED`).
- 메서드 불일치 405, 입력 오류 400, 미인증 401, 권한 없음 403, 없음 404, 경합 실패 409, 설정·DB 장애 503.
- 입력은 모두 검증: UUID 형식, 날짜 실재 여부, 길이 상한, 열거값.

## 인증·권한
1. `authenticate` 결과로 `user.id`를 얻는다. JWT를 직접 디코드하거나 `user_metadata`를 믿지 않는다.
2. 회원 행은 `booking.members`에서 `(auth_issuer, auth_subject)`로 찾는다. issuer는 `SUPABASE_URL` 기반 상수로 서버에서 정한다.
3. 시설 쓰기는 `facility_operators`에 `(facility_id, member_id)`가 있을 때만.
4. 권한 확인과 쓰기는 같은 트랜잭션 안에서 한다(확인 후 권한이 바뀌는 경합 방지).

## 트랜잭션
```js
await withDatabase(env, async db => {
  await db.query("BEGIN");
  try {
    // 1. 잠금: SELECT ... FOR UPDATE (자원 → 예약 → 청구 순서 고정)
    // 2. 재검사: 상태, 기한(now() 서버 시각), 수량, 최신 제안 버전
    // 3. 쓰기
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
});
```
- 잠금 순서를 모든 엔드포인트에서 같게 해 교착을 피한다.
- 제약 위반(`23P01` 배타, `23505` 유일)은 409 오류 코드로 바꾼다. 그 외 DB 오류는 503 `DATABASE_UNAVAILABLE`로, 상세를 응답에 넣지 않는다.
- 멱등 키는 `Idempotency-Key` 헤더로 받고, 같은 키 재요청은 첫 결과를 돌려준다.

## 금지
- SQL 문자열 결합으로 값 넣기(항상 `$1` 매개변수).
- 응답·로그에 연결 문자열, 토큰, 이메일 외 개인정보 노출.
- 미정 정책(수수료 금액, PG)을 하드코딩한 실결제 경로.

## 계약 문서 (`_workspace/03_api-developer_contract.md`)
엔드포인트마다: 메서드·경로, 인증 필요 여부와 권한, 요청 예시, 성공 응답 예시(필드 타입 포함), 오류 코드·상태 표, 관련 테이블. 화면 개발자와 QA가 이 문서만 보고 작업할 수 있어야 한다.

## 자체 점검
- `node --check server/**/*.js` 통과
- 새 라우트에 405 처리, 인증 필요한 곳에 `authenticate`
- 모든 쿼리 매개변수화
