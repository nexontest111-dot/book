# 03 API 계약: 회원 프로필 (/api/me, /api/me/membership)

구현: `server/routes/me.js` (worker.js 는 `/api/me`, `/api/me/*` 를 위임만), 공용 헬퍼 `server/http.js`.
DB 함수: `booking.member_profile(p_issuer text, p_subject text, p_action text, p_display_name text) RETURNS jsonb` (migrations/004_member_profile.sql, db 담당).

## 공통
- 응답 헤더: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- 실패 본문: `{ "error": { "code": "UPPER_SNAKE_CASE" } }` (화면은 `body.error?.code` 를 읽는다). DB 상세·SQL·자격 증명은 넣지 않는다.
- 인증: `Authorization: Bearer <Supabase access_token>`. 서버가 Supabase `getUser` 로 검증. 익명 사용자 401, 이메일 미인증 403.
- 회원 식별: issuer = `new URL(SUPABASE_URL).origin + "/auth/v1"`, subject = `getUser` 의 `user.id`. 요청 본문·헤더의 식별 값은 사용하지 않는다.
- `/api/me/` 아래 다른 경로: `API_NOT_IMPLEMENTED` 501.

## Member 객체
| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string (uuid) | booking.members.id |
| displayName | string | 1..80자(코드 포인트), 앞뒤 공백 없음 |
| createdAt | string | 최초 등록 시각. UTC, 밀리초 3자리, `Z` 접미사(예: `2026-10-11T03:04:05.123Z`). 표시는 Asia/Seoul 로 변환 |
| updatedAt | string (NOT NULL) | 마지막 표시 이름 변경 시각. 형식은 createdAt 과 같음. 생성 직후에는 createdAt 과 같고, 같은 이름 재요청에서는 바뀌지 않음 |

## GET /api/me
인증 필요. 회원 행이 없어도 200.

성공 200:
```json
{
  "data": { "authUserId": "6f1c...-uuid", "email": "user@example.com" },
  "membership": "active",
  "member": { "id": "b3a1...-uuid", "displayName": "홍길동", "createdAt": "2026-10-11T03:00:00.000Z", "updatedAt": "2026-10-11T03:00:00.000Z" },
  "operatorAccess": false
}
```
- `membership`:
  - `"active"`: 회원 행 있음, `member` 객체 채워짐.
  - `"not_provisioned"`: 회원 행 없음(`member: null`) → 화면은 표시 이름 입력 단계.
  - `"setup_required"`: Worker 에 HYPERDRIVE 바인딩이 없거나 004 미적용(42883/42P01/42703/3F000) (`member: null`) → 화면은 입력 비활성 + "회원 정보 저장 준비 중".
  - `"unavailable"`: 인증은 성공했지만 그 밖의 DB 오류(연결 실패, 권한, 함수 반환 형식 이상 등)로 회원 상태를 알 수 없음 (`member: null`). 로그인은 성공으로 보고, 화면은 "회원 정보를 불러오지 못함, 잠시 후 다시 시도" 안내 + 입력 비활성.
- `operatorAccess`: 이번 범위에서는 항상 `false`.
- `email`: 없으면 `null`.

오류:
| 상태 | code | 원인 |
| --- | --- | --- |
| 405 | METHOD_NOT_ALLOWED | GET 외 메서드 |
| 401 | UNAUTHORIZED | 토큰 없음/형식 오류/무효/익명 |
| 403 | EMAIL_NOT_CONFIRMED | 이메일 미인증 |
| 503 | AUTH_NOT_CONFIGURED | SUPABASE_URL/키 미설정 |
| 503 | AUTH_UNAVAILABLE | Supabase 인증 서버 장애·시간 초과 |

## PUT /api/me/membership
인증 필요. 표시 이름 최초 등록(가입 완료)과 수정을 같은 엔드포인트로 처리(멱등 upsert).

요청:
```
PUT /api/me/membership
Authorization: Bearer <access_token>
Content-Type: application/json

{ "displayName": "  홍길동 " }
```
- `Content-Type` 은 `application/json` 으로 시작해야 함. 본문 16KB(16384 바이트) 초과 거부.
- `Origin` 헤더가 있으면 요청 URL 의 origin 과 같아야 함(없으면 허용, admin 라우트와 동일).
- `displayName`: 문자열 필수. 서버가 trim 한 뒤 1..80 코드 포인트, 제어 문자(Unicode Cc: U+0000-001F, U+007F-009F) 포함 금지. 저장 값은 trim 결과.
- 다른 필드는 무시(식별·권한 값을 본문에서 받지 않음).

성공 201(새로 생성) / 200(기존 행 갱신, 같은 이름 재요청 포함):
```json
{ "member": { "id": "b3a1...-uuid", "displayName": "홍길동", "createdAt": "2026-10-11T03:00:00.000Z", "updatedAt": "2026-10-11T03:05:00.000Z" } }
```
- 상태 코드 구분은 DB 함수의 `created` 값에 따름. 화면은 2xx 이면 `member` 를 사용하면 된다.

검사 순서: 메서드 → Origin → 인증 → Content-Type/크기/JSON → displayName → DB 바인딩 → DB.

오류:
| 상태 | code | 원인 |
| --- | --- | --- |
| 405 | METHOD_NOT_ALLOWED | PUT 외 메서드 |
| 403 | ORIGIN_NOT_ALLOWED | 다른 origin 에서 온 요청 |
| 401 | UNAUTHORIZED | 인증 실패 |
| 403 | EMAIL_NOT_CONFIRMED | 이메일 미인증 |
| 503 | AUTH_NOT_CONFIGURED / AUTH_UNAVAILABLE | 인증 설정 없음 / 인증 서버 장애 |
| 415 | JSON_REQUIRED | Content-Type 이 JSON 이 아님 |
| 413 | BODY_TOO_LARGE | 본문 16KB 초과 |
| 400 | INVALID_BODY | 본문이 JSON 객체가 아님(배열·null·숫자 등) |
| 400 | INVALID_JSON | JSON 파싱 실패. 빈 본문(Content-Length 0 포함)도 여기에 해당 |
| 400 | INVALID_DISPLAY_NAME | 문자열 아님, trim 후 빈 값, 80자 초과, 제어 문자 포함, 짝 없는 서로게이트(isWellFormed false), 또는 DB 가 거부(22023 + message `INVALID_DISPLAY_NAME`, 23514, 22001) |
| 503 | DATABASE_NOT_CONFIGURED | HYPERDRIVE 바인딩 없음 |
| 503 | MEMBER_SETUP_REQUIRED | 004 미적용(42883/42P01/42703/3F000) |
| 503 | DATABASE_UNAVAILABLE | 그 밖의 DB 오류: 22023 `INVALID_IDENTITY`/`INVALID_ACTION`, P0002 `MEMBER_NOT_FOUND`, 연결 실패, 권한(42501), 함수 반환 형식 이상 |

## 화면이 쓰는 필드
- GET: `membership`(`active`/`not_provisioned`/`setup_required`/`unavailable`), `member.displayName`, `data.email`, (`operatorAccess` 는 false 고정).
- PUT: 응답 상태(201/200), `member.displayName`, 실패 시 `error.code`.
- 권장 안내: `INVALID_DISPLAY_NAME` → "표시 이름은 1~80자, 제어 문자 없이 입력", `MEMBER_SETUP_REQUIRED`/`DATABASE_NOT_CONFIGURED` → "회원 정보 저장 준비 중", `UNAUTHORIZED` → 다시 로그인, `EMAIL_NOT_CONFIRMED` → 이메일 인증 안내, `ORIGIN_NOT_ALLOWED`/`JSON_REQUIRED`/`BODY_TOO_LARGE`/`INVALID_JSON`/`INVALID_BODY` → 일반 요청 오류, 503 계열 → 잠시 후 다시 시도.

## DB 계약 (고정, db 담당 구현)
- 호출: `SELECT booking.member_profile($1::text,$2::text,$3::text,$4::text) AS payload` — `[issuer, subject, action, displayName|null]`.
- `'get'`: 회원 없음 → SQL NULL 또는 jsonb `null`(둘 다 not_provisioned 처리), 있음 → `{id, displayName, createdAt, updatedAt}`.
- `'upsert'`: `{ "created": boolean, "member": {...} }`.
- SQLSTATE: 22023 은 메시지 상수로 구분. `INVALID_DISPLAY_NAME` → 400 INVALID_DISPLAY_NAME, `INVALID_IDENTITY`/`INVALID_ACTION` → 503 DATABASE_UNAVAILABLE(서버 버그). P0002 `MEMBER_NOT_FOUND` → 503 DATABASE_UNAVAILABLE. 42883/42P01/42703/3F000 → 004(또는 001) 미적용.
- 시각 형식: UTC `YYYY-MM-DDTHH:MI:SS.MSZ`(to_char), updatedAt NOT NULL.
- 관련 테이블: `booking.members` (Worker 역할 book_reader 는 테이블 직접 권한 없음, 함수 EXECUTE 만).

## 비고
- `server/http.js` 의 `readJsonBody` 는 admin-facilities.js 의 `readBody` 와 같은 규칙이되, 본문 스트림이 없으면 INVALID_BODY 대신 INVALID_JSON 을 낸다(admin 은 여전히 INVALID_BODY). admin 라우트는 동작 변경 위험을 피하려고 이번에 바꾸지 않았다(기존 자체 구현 유지).
- 서버 trim 은 JS `String.prototype.trim`(유니코드 공백 포함)이다. DB 가 더 엄격해 거부하면 22023(INVALID_DISPLAY_NAME)/23514 → INVALID_DISPLAY_NAME 으로 응답한다.
- 로그: 예상 밖 DB 오류는 `console.error` 로 SQLSTATE 와 알려진 메시지 상수(INVALID_IDENTITY, INVALID_ACTION, INVALID_DISPLAY_NAME, MEMBER_NOT_FOUND)만 기록한다. 그 밖의 메시지는 `-` 로 대체. SQL, 사용자 데이터, 토큰은 기록하지 않는다.
- 방향 제어·영폭 문자(Cf)는 현재 허용(정책 미정, QA L10).
