# 03 API 계약: 관리자 권한 관리 (/api/admin/permissions)

작성: api, 2026-10-11. QA 1차 반영(문서만, 코드 변경 없음): GET operators 없는 시설 404 확정, DELETE operators 시설 없음 200 changed=false, 40P01 → DATABASE_UNAVAILABLE. db 노트(02) 대조 완료. 전제: _workspace/00_contract_fixed.md, migrations/005(db 작성 중, 미적용).
구현: server/routes/admin-permissions.js, server/auth/issuer.js(me.js 와 공용), server/worker.js 분기.
검증: node --check 만 실행(의존성 미설치, wrangler 미실행). 실제 호출 검증은 안 함.

## 공통
- 인증: `Authorization: Bearer <Supabase access token>`. 서버가 getUser 로 검증, 이메일 인증 계정만.
- actor = 검증된 user.id, issuer = `SUPABASE_URL origin + "/auth/v1"` (server/auth/issuer.js, /api/me 와 같은 값).
- 관리자 여부는 DB 함수 첫 단계에서 확인(본문·토큰 클레임의 역할 값은 보지 않음).
- 비 GET(POST, DELETE): `Origin` 헤더가 있으면 요청 origin 과 같아야 함 → 아니면 ORIGIN_NOT_ALLOWED 403.
- POST 본문: `Content-Type: application/json`, 16KB 이하(server/http.js readJsonBody).
- 삭제 대상 ID 는 경로 파라미터로만 받음. DELETE 본문은 읽지 않음.
- 응답 헤더: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`.
- 오류 본문: `{"error":{"code":"..."}}`.
- 시각: UTC `"YYYY-MM-DDTHH:MI:SS.MSZ"` 문자열(DB 가 만든 값 그대로).
- 응답 필드는 DB payload 필드명 그대로 전달(이름 변경·추가 없음).

## 검사 순서
1. 경로 일치 → 아니면 NOT_FOUND 404 (`/api/admin/permissions`, 끝 `/`, 추가 세그먼트 포함)
2. 경로 UUID → 아니면 INVALID_ID 400
3. 메서드 → 아니면 METHOD_NOT_ALLOWED 405
4. Origin(비 GET)
5. 인증(AUTH_NOT_CONFIGURED 503 / UNAUTHORIZED 401 / EMAIL_NOT_CONFIRMED 403 / AUTH_UNAVAILABLE 503)
6. 본문·쿼리 검사(JSON_REQUIRED 415, BODY_TOO_LARGE 413, INVALID_JSON 400, INVALID_BODY 400, INVALID_ID 400, INVALID_EMAIL 400)
7. DATABASE_NOT_CONFIGURED 503
8. DB 호출 → 오류 매핑
  - 입력 검사가 관리자 확인보다 먼저라서, 비관리자도 잘못된 입력이면 400 을 받는다(정보 노출 없음).

## 입력 규칙
- 이메일: 문자열, trim 후 3..254자(코드 포인트), 공백 문자 없음, `@` 1개 이상. 아니면 INVALID_EMAIL. 대소문자는 그대로 보냄(DB 가 lower 비교).
- UUID: `^[0-9a-f]{8}-...-[0-9a-f]{12}$` (대소문자 무시). 아니면 INVALID_ID.
- 본문이 객체가 아니면(배열, null, 숫자) INVALID_BODY. 빈 본문은 INVALID_JSON.
- 알 수 없는 본문 필드·쿼리 파라미터는 무시.

## 엔드포인트

### GET /api/admin/permissions/admins
서비스 관리자(enabled) 목록.
```json
200
{"data":[
  {"authUserId":"6f1c...","email":"owner@example.com","displayName":"운영자","createdAt":"2026-10-11T03:12:45.123Z","isSelf":true},
  {"authUserId":"9a2b...","email":"second@example.com","displayName":null,"createdAt":"2026-10-11T04:00:00.000Z","isSelf":false}
]}
```

### POST /api/admin/permissions/admins
요청 `{"email":"second@example.com"}`
```json
201 (새로 지정 또는 비활성→활성)
{"changed":true,"admin":{"authUserId":"9a2b...","email":"second@example.com","displayName":null,"createdAt":"2026-10-11T04:00:00.000Z","isSelf":false}}
200 (이미 관리자)
{"changed":false,"admin":{...}}
```
오류: INVALID_EMAIL 400, USER_NOT_FOUND 404(없음 또는 이메일 미인증 계정).

### DELETE /api/admin/permissions/admins/{authUserId}
```json
200 {"changed":true}   // 해제됨
200 {"changed":false}  // 이미 관리자가 아님(멱등)
```
오류: INVALID_ID 400, SELF_REVOKE 409(본인), LAST_ADMIN 409(마지막 관리자).

### GET /api/admin/permissions/operators?facilityId={uuid}
facilityId 생략 시 전체(최대 200행). facilityId 가 있으면 UUID 여야 함(빈 문자열도 INVALID_ID).
```json
200
{"data":[
  {"facilityId":"c0de...","facilityName":"한강 야구장","memberId":"77aa...","authUserId":"9a2b...","email":"op@example.com","displayName":"김운영","createdAt":"2026-10-11T05:00:00.000Z"}
]}
```
오류: INVALID_ID 400, FACILITY_NOT_FOUND 404(facilityId 를 줬는데 시설이 없음 — 빈 목록이 아님, db 노트 2절 계약 보충).
운영자 회원의 issuer 가 다르거나 auth 사용자가 없으면 authUserId·email 은 null 로 온다(행은 숨기지 않음). 화면은 null 을 처리하고 해제 버튼은 facilityId+memberId 로 유지.

### POST /api/admin/permissions/operators
요청 `{"facilityId":"c0de...","email":"op@example.com"}` (facilityId 먼저 검사 후 email)
```json
201 {"changed":true,"operator":{"facilityId":"c0de...","facilityName":"한강 야구장","memberId":"77aa...","authUserId":"9a2b...","email":"op@example.com","displayName":"김운영","createdAt":"2026-10-11T05:00:00.000Z"}}
200 {"changed":false,"operator":{...}}   // 이미 연결됨
```
오류: INVALID_ID 400, INVALID_EMAIL 400, FACILITY_NOT_FOUND 404, USER_NOT_FOUND 404, MEMBER_NOT_REGISTERED 409(계정은 있으나 회원 등록 전).

### DELETE /api/admin/permissions/operators/{facilityId}/{memberId}
```json
200 {"changed":true}
200 {"changed":false}  // 연결 없음(멱등)
```
오류: INVALID_ID 400. 시설이 없어도 FACILITY_NOT_FOUND 를 내지 않고 200 {"changed":false}.

## 오류 표
| 코드 | HTTP | 발생 |
| --- | --- | --- |
| NOT_FOUND | 404 | 알 수 없는 하위 경로 |
| INVALID_ID | 400 | 경로·쿼리·본문 UUID 형식 오류, DB 22023 INVALID_ID |
| METHOD_NOT_ALLOWED | 405 | 경로별 허용 외 메서드 |
| ORIGIN_NOT_ALLOWED | 403 | 비 GET 의 다른 Origin |
| AUTH_NOT_CONFIGURED | 503 | Worker 인증 설정 없음 |
| UNAUTHORIZED | 401 | 토큰 없음·무효·익명 |
| EMAIL_NOT_CONFIRMED | 403 | 요청자 이메일 미인증 |
| AUTH_UNAVAILABLE | 503 | Supabase Auth 응답 실패·시간 초과 |
| JSON_REQUIRED | 415 | POST Content-Type 이 JSON 아님 |
| BODY_TOO_LARGE | 413 | 16KB 초과 |
| INVALID_JSON | 400 | 빈 본문·JSON 파싱 실패 |
| INVALID_BODY | 400 | 본문이 객체 아님 |
| INVALID_EMAIL | 400 | 이메일 형식, DB 22023 INVALID_EMAIL |
| DATABASE_NOT_CONFIGURED | 503 | HYPERDRIVE 바인딩 없음 |
| ADMIN_REQUIRED | 403 | DB 42501 + ADMIN_REQUIRED (요청자가 관리자 아님) |
| USER_NOT_FOUND | 404 | P0002 USER_NOT_FOUND |
| FACILITY_NOT_FOUND | 404 | P0002 FACILITY_NOT_FOUND (grant_operator, list_operators 에 facilityId 지정 시) |
| MEMBER_NOT_REGISTERED | 409 | P0001 MEMBER_NOT_REGISTERED |
| SELF_REVOKE | 409 | P0001 SELF_REVOKE |
| LAST_ADMIN | 409 | P0001 LAST_ADMIN |
| ADMIN_SETUP_REQUIRED | 503 | 42883/42P01/42703/3F000 (005 미적용 등) |
| DATABASE_UNAVAILABLE | 503 | 22023 INVALID_ACTION/INVALID_ISSUER, 메시지가 ADMIN_REQUIRED 가 아닌 42501(EXECUTE 권한 누락 등), payload 모양 이상, 40P01(드문 교착, 재시도 가능), 40001 CONCURRENT_UPDATE(db 방어 경로, 재시도 가능), 연결 실패, 그 밖 전부 |

매핑은 SQLSTATE 와 메시지 상수가 모두 맞을 때만 적용한다. 매핑되지 않은 DB 오류와 payload 모양 이상은 `console.error("admin_permissions <action> failed: sqlstate=<5자 코드|unknown> message=<알려진 상수|->")` 형식으로만 기록한다(SQL·이메일·토큰·ID 없음).

## 화면 사용 필드
| 화면 | 필드 |
| --- | --- |
| 서비스 관리자 목록 | email, displayName(null 이면 표시 생략/“이름 없음”), createdAt(최초 지정일 — 재활성해도 바뀌지 않음, 화면에서 Asia/Seoul 로 표시), isSelf(본인 표시, true 면 해제 버튼 숨김), authUserId(DELETE 경로) |
| 관리자 지정 결과 | changed(true: “지정했습니다”, false: “이미 관리자입니다”), admin(목록에 반영) |
| 운영자 목록 | facilityName, email(null 가능), displayName(null 가능), createdAt, facilityId+memberId(DELETE 경로) |
| 운영자 연결 결과 | changed(true: “연결했습니다”, false: “이미 연결됨”), operator(목록에 반영) |
| 해제 결과 | changed(false 면 “이미 해제됨”으로 안내 후 목록 새로고침) |

- 화면은 서버 결과(changed, 상태 코드)만 믿고, 해제·지정 뒤 목록을 다시 불러오는 방식을 권장(동시 변경 반영).
- 시설 선택은 기존 GET /api/admin/facilities 를 그대로 쓴다(변경 없음).
- /api/admin/facilities 등 /api/admin/permissions 밖 경로는 기존 adminFacilities 그대로.
