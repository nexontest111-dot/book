# 02 DB 스키마 노트: 004_member_profile

계약 변경: 없음. 고정 계약 그대로 구현했다. 아래 "계약 보충"은 계약이 비워 둔 부분을 정한 것이다.

상태: SQL 작성만 함. 개발·운영 DB 어디에도 적용하지 않았다. 로컬 PostgreSQL이 없어 문법 실행 검증도 하지 않았다. 사용자가 SQL Editor에 처음 적용할 때가 첫 실행이다.

파일: `migrations/004_member_profile.sql` (001/002만 전제, 003과 무관, BEGIN/COMMIT 단일 트랜잭션, 1회 적용용)
- 파일은 순수 ASCII다. 정규식의 유니코드 문자는 PostgreSQL 정규식 이스케이프(백슬래시 u + 16진 4자리)로 적었다. 편집기가 이 이스케이프를 실제 문자로 바꾸지 않게 해야 한다.

## 1. 추가·변경 객체

| 객체 | 내용 | 이유 |
| --- | --- | --- |
| `booking.members.updated_at` | `timestamptz NOT NULL DEFAULT now()`. 기존 행이 있으면 `created_at` 값으로 맞춤 | 표시 이름 수정 시각 |
| `members_display_name_trimmed` (CHECK) | 앞뒤 공백 없음 | 계약의 표시 이름 규칙을 DB에서도 강제 |
| `members_display_name_no_control` (CHECK) | 제어 문자 없음 | 같음 |
| `REVOKE ALL ON booking.members FROM PUBLIC, anon, authenticated, service_role, book_reader` | 방어용. 001/002 기준으로 원래 부여된 권한이 없으니 동작 변화 없음 | 직접 테이블 접근 차단을 파일에 명시 |
| `booking.member_profile(text,text,text,text) RETURNS jsonb` | SECURITY DEFINER, `search_path = ''`, PUBLIC/anon/authenticated/service_role 에서 EXECUTE 회수, `book_reader`에만 EXECUTE 부여 | 003과 같은 패턴. 쓰기 권한 역할을 새로 만들지 않음 |

`version` 컬럼은 넣지 않았다. 표시 이름은 본인만 바꾸고 "마지막 요청이 이긴다"로 충분하며, 계약에 버전 인자가 없다. 다른 사람이 함께 수정하는 프로필 필드가 생기면 그때 추가한다.

기존 CHECK `char_length(display_name) BETWEEN 1 AND 80` (001, 자동 이름 `members_display_name_check`로 추정)은 그대로 둔다.

## 2. 문자 규칙 (API 검사와 정확히 맞출 것)

- 길이: `char_length` = **코드 포인트 수** 1..80. JS `s.length`(UTF-16 단위)와 다르다. API는 `[...s].length` 같은 코드 포인트 기준을 써야 한다. 그렇지 않으면 이모지가 많은 이름에서 API 통과 후 DB 22023이 나거나 그 반대가 된다.
- 앞뒤 공백 금지 집합: U+0009–U+000D, U+0020, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF. JS `String.prototype.trim()`이 지우는 집합과 같다. 따라서 API가 `trim()`한 값을 넘기면 이 검사는 통과한다.
- 제어 문자 금지(어느 위치든): U+0001–U+001F, U+007F–U+009F (유니코드 Cc). NUL(U+0000)은 PostgreSQL text에 들어갈 수 없다. API는 같은 범위를 거부해야 한다. 예: `/[\u0000-\u001F\u007F-\u009F]/`.
- 포함하지 않은 것: 방향 제어 문자(U+202A–U+202E, U+2066–U+2069), 영폭 문자(U+200B–U+200D) 등의 서식 문자. 계약이 "제어 문자"만 정했으므로 추가하지 않았다. 표시 이름 위장 방지가 필요하면 별도 결정 뒤 새 마이그레이션으로 추가한다(미정 항목).
- 정규식은 문자 클래스 이름(`[[:space:]]`, `[[:cntrl:]]`)을 쓰지 않고 코드 포인트를 직접 적었다. DB 로캘에 따라 결과가 달라지지 않게 하기 위해서다. DB 인코딩이 UTF8이어야 한다(Supabase 기본값).

## 3. 함수 계약

```
booking.member_profile(p_issuer text, p_subject text, p_action text, p_display_name text) RETURNS jsonb
```

인자 검사 순서: identity → action → (upsert일 때) display_name.

- `p_issuer`: NULL 아님, 1..2048자, 앞뒤 ASCII 공백 없음(`btrim`). 그 외 22023 `INVALID_IDENTITY`.
- `p_subject`: NULL 아님, 1..255자, 앞뒤 ASCII 공백 없음. 그 외 22023 `INVALID_IDENTITY`.
- `p_action`: `'get'` 또는 `'upsert'`. 그 외(NULL 포함) 22023 `INVALID_ACTION`.
- `p_display_name`: `'get'`에서는 무시한다(NULL 권장). `'upsert'`에서는 2절 규칙 위반이나 NULL이면 22023 `INVALID_DISPLAY_NAME`. 함수 안에서 먼저 검사하므로 CHECK 위반(23514)은 정상 경로에서 나오지 않는다.

### 'get'
- 회원 없음: **SQL NULL** 반환(jsonb `'null'` 아님). node-postgres에서는 둘 다 JS `null`이 되지만, API는 `null`/`undefined` 둘 다 "없음"으로 처리하면 안전하다.
- 회원 있음:
```json
{"id":"<uuid>","displayName":"홍길동","createdAt":"2026-10-11T03:04:05.123Z","updatedAt":"2026-10-11T03:04:05.123Z"}
```
- 시각은 세션 TimeZone과 상관없이 UTC, 밀리초 3자리, `Z` 접미사 문자열(`to_char`). 화면 표시는 Asia/Seoul로 변환한다.

### 'upsert'
```json
{"created": true, "member": {"id":"…","displayName":"…","createdAt":"…","updatedAt":"…"}}
```
- `created = true`: 이번 호출이 행을 만들었다 → API 201.
- `created = false`: 이미 있던 행 → API 200. 이름이 바뀌면 `display_name`, `updated_at = now()`가 갱신된다.
- 같은 이름 재요청: 쓰기를 하지 않는다. `updated_at`이 바뀌지 않고 `created = false`. 근거: 실제 변화가 없는데 수정 시각이 움직이면 기록이 틀리고, 재시도·중복 제출이 무해한 멱등 동작이 된다.

### 동시성
- `INSERT … ON CONFLICT (auth_issuer, auth_subject) DO NOTHING RETURNING` → 행이 안 만들어졌으면 `UPDATE … WHERE display_name IS DISTINCT FROM` → 그것도 0행이면 `SELECT`.
- 같은 사용자의 첫 요청이 동시에 여러 번 오면 UNIQUE 인덱스가 순서를 정한다. 한 요청만 `created=true`이고 나머지는 대기 후 UPDATE 경로로 간다. 행은 1개다.
- 회원 삭제 경로가 없으므로(탈퇴는 범위 밖) INSERT와 UPDATE 사이에 행이 사라지지 않는다. 그 경우를 위한 방어로 `P0002 MEMBER_NOT_FOUND`를 두었지만 정상 운영에서는 나오지 않는다.
- API는 함수 1회 호출을 그대로 한 트랜잭션으로 쓰면 된다(autocommit 단일 문장). 기본 격리 수준 READ COMMITTED 전제다. 호출자가 REPEATABLE READ/SERIALIZABLE을 쓰면 동시 첫 요청에서 40001이 날 수 있다.

## 4. SQLSTATE

| SQLSTATE | 메시지 | 의미 | API 대응 제안 |
| --- | --- | --- | --- |
| 22023 | `INVALID_IDENTITY` | issuer/subject 누락·빈 값·길이 초과·앞뒤 공백 | 서버 버그(서버가 만든 값). 500 계열 + 로그 |
| 22023 | `INVALID_ACTION` | action 오타 | 서버 버그. 500 계열 |
| 22023 | `INVALID_DISPLAY_NAME` | 표시 이름 규칙 위반 | 400 `INVALID_DISPLAY_NAME` |
| P0002 | `MEMBER_NOT_FOUND` | upsert 중 행이 사라짐(정상 운영에선 발생하지 않음) | 500 계열 |
| 40001 | (PostgreSQL) | 높은 격리 수준에서 동시 충돌 | 1회 재시도 또는 503 |
| 42883 | (PostgreSQL) | 함수 없음 = 004 미적용 | `setup_required` / `MEMBER_SETUP_REQUIRED` 503 |
| 3F000 / 42P01 | (PostgreSQL) | 스키마·테이블 없음(001 미적용) | 위와 같게 처리 |
| 42501 | (PostgreSQL) | EXECUTE 권한 없음(다른 역할로 접속) | 설정 오류. 500 계열 |

메시지 문자열로 22023을 구분한다(`err.message === 'INVALID_DISPLAY_NAME'`). 003과 같은 방식이다.

## 5. API 전제

- 접속 역할: `book_reader`(Hyperdrive). 테이블 직접 SELECT/INSERT 권한은 없고 함수로만 접근한다.
- 호출: `SELECT booking.member_profile($1, $2, $3, $4) AS r`. 인자는 반드시 파라미터 바인딩한다.
- issuer/subject는 서버가 정한다. issuer = 정규화한 `SUPABASE_URL` + `/auth/v1`, subject = `getUser`의 `user.id`. 정규화 규칙(끝 `/` 제거 등)이 바뀌면 같은 사람이 다른 회원으로 갈라지므로 규칙을 고정하고 계약 문서에 적는다.
- 표시 이름은 API에서 `trim()` 후 2절 규칙으로 먼저 검사하고, DB가 같은 규칙으로 다시 검사한다.

## 6. 사용자 적용 절차 (개발 DB, Supabase SQL Editor)

1. 사전 확인(선택, 읽기 전용). 기존 행이 새 CHECK를 어기면 004 전체가 롤백되므로 미리 확인한다.
```sql
SELECT count(*) AS members,
  count(*) FILTER (WHERE display_name <> btrim(display_name)) AS edge_space_ascii,
  count(*) FILTER (WHERE display_name ~ '[\u0001-\u001F\u007F-\u009F]') AS has_control
FROM booking.members;
```
   `edge_space_ascii`, `has_control`이 0이 아니면 적용하지 말고 리더에게 알린다. (`edge_space_ascii`는 ASCII 공백만 본다. 실제 CHECK는 2절의 더 넓은 집합을 보므로 여기서 0이어도 적용 시 CHECK가 실패할 수 있다. 그때는 오류 후 아무것도 바뀌지 않는다.)
2. 003 미적용이면 003을 먼저 적용해도 되고 안 해도 된다. 004는 003과 독립이다(계획상 순서는 003 → 004).
3. `migrations/004_member_profile.sql` 전체를 붙여 넣고 실행. 예상 결과: `Success. No rows returned.`
   - `column "updated_at" of relation "members" already exists` 또는 `function ... already exists`: 이미 적용된 것이다. 다시 실행하지 않는다(트랜잭션 전체 롤백되어 변경 없음).
   - `check constraint ... is violated by some row`: 1단계 사유. 변경 없음. 리더에게 알린다.
4. 확인 쿼리(읽기 전용):
```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_schema='booking' AND table_name='members' ORDER BY ordinal_position;
SELECT conname FROM pg_constraint WHERE conrelid='booking.members'::regclass ORDER BY conname;
SELECT p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('book_reader','booking.member_profile(text,text,text,text)','EXECUTE') AS reader_exec,
  has_function_privilege('anon','booking.member_profile(text,text,text,text)','EXECUTE') AS anon_exec,
  has_function_privilege('authenticated','booking.member_profile(text,text,text,text)','EXECUTE') AS auth_exec
FROM pg_proc p WHERE p.oid='booking.member_profile(text,text,text,text)'::regprocedure;
SELECT has_table_privilege('book_reader','booking.members','SELECT') AS reader_select;
```
   기대값: `updated_at` 존재(NOT NULL), 제약 `members_display_name_no_control`, `members_display_name_trimmed` 존재, `prosecdef = true`, `proconfig = {search_path=""}`, `reader_exec = true`, `anon_exec = false`, `auth_exec = false`, `reader_select = false`.
5. 기능 확인(선택, 행을 만들지 않음): `SELECT booking.member_profile('https://example.invalid/auth/v1','00000000-0000-0000-0000-000000000000','get',NULL);` → 결과 NULL. 실제 회원 생성은 배포 후 `/auth` 화면에서 확인한다.

운영 DB 적용은 개발 검증 뒤 사용자가 따로 결정한다.

## 7. 롤백

```sql
BEGIN;
DROP FUNCTION booking.member_profile(text,text,text,text);
ALTER TABLE booking.members
  DROP CONSTRAINT members_display_name_trimmed,
  DROP CONSTRAINT members_display_name_no_control,
  DROP COLUMN updated_at;
COMMIT;
```
- 함수로 만든 `members` 행은 남는다(001 스키마에 맞는 행이므로 문제없음). `updated_at` 값은 사라진다.
- 004의 `REVOKE ALL ON booking.members`는 원래 부여된 권한이 없었으므로 되돌릴 것이 없다.
- 롤백 후 API는 42883 → `setup_required`로 동작한다.

## 8. 미정·후속

- 서식 문자(방향 제어·영폭 문자) 금지 여부: 미정. 현재는 허용한다.
- 표시 이름 중복 허용: 허용한다(UNIQUE 없음). 계획에 요구가 없다.
- issuer/subject 테이블 CHECK(빈 값 금지)는 넣지 않았다. 쓰기 경로가 함수 하나뿐이고 함수가 검사한다.
- 마이그레이션 실행기·적용 기록 테이블은 여전히 없다(001 주석). 별도 작업으로 제안한다.
