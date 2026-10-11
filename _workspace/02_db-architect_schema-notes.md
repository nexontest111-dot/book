# 02 DB 스키마 노트: 005_admin_permissions

계약 변경: 없음. `00_contract_fixed.md` 그대로 구현했다. 아래 "계약 보충"은 계약이 비워 둔 부분을 정한 것이다.

수정 이력: QA 1차(L3·L4·L6) 반영 — 같은 005 파일 직접 수정(미적용 상태). 반환 형태 변경 없음. 변경 내용은 5.4절과 6절 0단계.

상태: SQL 작성만 했다. 개발·운영 DB 어디에도 적용하지 않았고, 로컬 PostgreSQL이 없어 문법 실행 검증도 하지 않았다. 사용자가 SQL Editor에서 처음 적용할 때가 첫 실행이다.

파일: `migrations/005_admin_permissions.sql` (001~004 전제, BEGIN/COMMIT 단일 트랜잭션, 1회 적용용, 순수 ASCII 확인함). 003의 `admin_facilities`는 건드리지 않았다.

## 1. 추가·변경 객체

| 객체 | 내용 | 이유 |
| --- | --- | --- |
| `booking.facility_operators.created_at` | `timestamptz NOT NULL DEFAULT now()`. 기존 행은 마이그레이션 실행 시각으로 채워짐 | Operator.createdAt |
| `booking.permission_audit` | id, actor_id(→auth.users), action(4종 CHECK), target_user_id(→auth.users, NULL 허용), facility_id(→facilities, NULL 허용), member_id(→members, NULL 허용), created_at. 모든 FK `ON DELETE RESTRICT` | 권한 변경 감사 |
| `permission_audit_shape` (CHECK) | 관리자 행: target_user_id NOT NULL, facility_id·member_id NULL. 운영자 행: facility_id·member_id NOT NULL | 행 모양 강제 |
| `permission_audit_created` (INDEX) | created_at | 이후 감사 조회용 |
| RLS / REVOKE | permission_audit RLS 활성. permission_audit·facility_operators 에서 PUBLIC, anon, authenticated, service_role, book_reader 권한 회수(원래 부여된 것 없음, 방어용) | 직접 접근 차단 |
| `booking.admin_permissions(uuid,text,text,jsonb) RETURNS jsonb` | SECURITY DEFINER, `search_path = ''`, EXECUTE 는 book_reader 만 | 003/004 패턴 |

계획 대비 추가: `permission_audit.member_id`. 운영자 해제 시 회원의 auth 사용자를 못 찾는 경우(다른 issuer 회원, 탈퇴 등)에도 누구를 해제했는지 남기기 위해서다. 그래서 운영자 행의 target_user_id 는 NULL 일 수 있다.

## 2. 함수 시그니처와 반환

```
booking.admin_permissions(p_actor uuid, p_issuer text, p_action text, p_data jsonb) RETURNS jsonb
SELECT booking.admin_permissions($1::uuid,$2::text,$3::text,$4::jsonb) AS payload
```

검사 순서: (1) actor 가 enabled 관리자인가 → (2) action → (3) issuer(NULL·1..2048자·앞뒤 공백 없음) → (4) action별 입력 → (5) 존재 확인 → (6) 변경.
actor 검사가 맨 앞이므로 비관리자는 action·입력이 틀려도 항상 `ADMIN_REQUIRED` 를 받는다.

| action | p_data | 반환 | 비고 |
| --- | --- | --- | --- |
| list_admins | 무시 | `{"data":[Admin]}` | enabled 만. created_at, auth_user_id 순. 상한 없음(관리자 수가 적다는 전제) |
| grant_admin | `{"email"}` | `{"changed":bool,"admin":Admin}` | 새 행 또는 비활성→활성일 때만 changed=true |
| revoke_admin | `{"authUserId"}` | `{"changed":bool}` | 대상이 enabled 관리자가 아니면(없는 ID 포함) changed=false |
| list_operators | `{"facilityId": uuid 또는 null 또는 키 없음}` | `{"data":[Operator]}` | 최대 200행. 시설 이름, facilityId, createdAt, memberId 순 |
| grant_operator | `{"facilityId","email"}` | `{"changed":bool,"operator":Operator}` | 이미 연결이면 changed=false |
| revoke_operator | `{"facilityId","memberId"}` | `{"changed":bool}` | 행 없으면 changed=false(시설이 없어도 같음) |

- Admin = `{authUserId, email, displayName, createdAt, isSelf}`. displayName 은 `booking.members(auth_issuer = p_issuer, auth_subject = authUserId 문자열)` 행이 없으면 null.
- Operator = `{facilityId, facilityName, memberId, authUserId, email, displayName, createdAt}`. 회원의 issuer 가 p_issuer 와 다르거나 auth 사용자가 없으면 authUserId·email 은 null(행은 숨기지 않는다 — 권한이 있는데 화면에서 안 보이면 해제할 수 없기 때문).
- 시각: UTC `YYYY-MM-DDTHH:MI:SS.MSZ` 문자열.
- uuid 입력은 JSON 문자열 + 하이픈 포함 36자 형식(대소문자 무관)만 받는다. 그 외는 INVALID_ID.
- 이메일 입력 검사(DB): JSON 문자열, 3..254자, 앞뒤 ASCII 공백 없음, `@` 포함. API 가 trim 해서 넘기면 통과한다.

### 계약 보충
- list_operators 에 facilityId 를 줬는데 시설이 없으면 `P0002 FACILITY_NOT_FOUND`(빈 목록 아님). API 는 GET 에서도 이 오류를 404 로 매핑해야 한다.
- grant_admin 재활성 시 `createdAt` 은 최초 행 생성 시각 그대로다(service_admins 에 수정 시각 컬럼 없음). 실제 재지정 시각은 permission_audit 에 있다. 화면 문구를 "지정일"로 쓰면 재지정 계정은 예전 날짜가 보인다.

## 3. 오류 표 (SQLSTATE + 메시지)

| SQLSTATE | 메시지 | 발생 조건 |
| --- | --- | --- |
| 42501 | ADMIN_REQUIRED | p_actor 가 enabled 관리자가 아님(NULL 포함). grant_admin·revoke_admin 은 잠금 후 재확인에서도 발생 |
| 22023 | INVALID_ACTION | action 이 6종 밖(NULL 포함) |
| 22023 | INVALID_ISSUER | issuer NULL·빈 값·2048자 초과·앞뒤 공백 |
| 22023 | INVALID_ID | facilityId/memberId/authUserId 형식 오류·누락 |
| 22023 | INVALID_EMAIL | email 누락·문자열 아님·길이·공백·`@` 없음 |
| P0002 | FACILITY_NOT_FOUND | grant_operator, list_operators(facilityId 지정 시) |
| P0002 | USER_NOT_FOUND | 이메일 일치 + 인증 완료 + 미삭제 계정이 0개 또는 2개 이상 |
| P0001 | MEMBER_NOT_REGISTERED | grant_operator 대상에 (p_issuer, user id) members 행 없음 |
| P0001 | SELF_REVOKE | revoke_admin 대상 = actor |
| P0001 | LAST_ADMIN | revoke_admin 후 enabled 0명이 되는 경우(아래 5절: 현재 경로에선 방어용) |
| 42883 / 42P01 / 42703 / 3F000 | (PostgreSQL) | 005 미적용 등 → ADMIN_SETUP_REQUIRED. 42703 은 auth.users 에 deleted_at 이 없을 때도 나옴(6절 사전 확인) |
| 40P01 | (PostgreSQL) | 드문 교착(5절). DATABASE_UNAVAILABLE 로 처리, 재시도 가능 |
| 40001 | CONCURRENT_UPDATE | 방어용. grant_admin 결과 행이 enabled 가 아니거나 grant_operator 가 삽입·삭제 경합에 3회 연속 진 경우. 정상 경로에서는 나오지 않음. DATABASE_UNAVAILABLE(계약의 "그 밖") |

같은 SQLSTATE(22023, P0002, P0001)는 `err.message` 상수로 구분한다(003/004 와 같음).

## 4. API 전제

- 접속 역할: book_reader(Hyperdrive). 테이블 직접 권한 없음, 이 함수만 호출.
- p_actor = getUser 의 user.id, p_issuer = `new URL(SUPABASE_URL).origin + "/auth/v1"` (me.js `issuerOf` 와 동일해야 함 — 다르면 displayName 이 null 이 되고 grant_operator 가 MEMBER_NOT_REGISTERED 를 낸다).
- 함수 1회 호출 = 1 트랜잭션(autocommit). READ COMMITTED 전제. 더 높은 격리 수준에서는 잠금 재평가 대신 40001 이 날 수 있다.
- 삭제 대상 ID 는 경로 파라미터에서만 p_data 에 넣는다.

## 5. 판단 근거

### 5.1 revoke_admin / grant_admin 관리자 집합 잠금
- 순서: 입력 검사 → SELF_REVOKE → `SELECT auth_user_id FROM service_admins WHERE enabled ORDER BY auth_user_id FOR UPDATE` 로 enabled 관리자 행 전부를 고정 순서로 잠금 → 잠긴 집합에 actor 가 없으면 42501 → 대상이 없으면 changed=false → 집합 크기 1 이하면 LAST_ADMIN → enabled=false + 감사.
- 관리자 A, B 둘만 있고 A→B, B→A 해제를 동시에 하면: 두 트랜잭션 모두 같은 순서로 잠그므로 한쪽(A)이 먼저 둘 다 잠그고 다른 쪽(B)은 첫 행에서 대기한다(교착 없음). A 가 B 를 비활성화하고 커밋하면, READ COMMITTED 의 FOR UPDATE 는 대기 후 최신 행으로 `enabled` 조건을 다시 평가하므로 B 의 행은 빠진다. B 는 자신이 집합에 없어 42501 을 받는다. 결과 enabled 1명.
- 같은 이유로 스냅샷 이후 새로 활성화된 관리자는 집합에 안 잡힐 수 있지만, 이는 개수를 적게 세는 방향이라 안전하다(불필요한 LAST_ADMIN 가능성만 있음).
- 첫 actor 확인은 grant_admin·revoke_admin 에서만 잠금 없이 한다. 다른 action 처럼 자기 행에 FOR SHARE 를 잡은 뒤 전체 FOR UPDATE 를 시도하면, 서로 해제하는 두 트랜잭션이 상대의 SHARE 잠금을 기다려 교착(40P01)이 난다. 0명은 안 되지만 사용자에게 503 이 보인다. 잠금 없는 사전 확인으로 비관리자를 먼저 거르고(비관리자가 관리자 행을 잠그지 못하게), 실제 판단은 잠금 후 재확인으로 한다.
- LAST_ADMIN: actor 가 enabled 이고 대상이 actor 와 다른 enabled 관리자이면 집합은 최소 2명이므로 현재 경로에서는 도달하지 않는다. "0명 금지"의 실질 보장은 SELF_REVOKE + 잠금 후 actor 재확인이다. LAST_ADMIN 검사는 규칙이 바뀌어도(예: 자기 해제 허용) 0명이 안 되게 하는 방어로 남겼다. QA 가 이 오류를 실제로 재현하지 못하는 것은 정상이다.
- grant_admin 도 사용자 조회 뒤 같은 집합 잠금을 잡는다(5.4). 둘 다 같은 순서로 잠그므로 서로 교착하지 않는다.
- 그 밖의 action 은 003 처럼 actor 행에 FOR SHARE 를 잡는다. 따라서 관리자 해제는 그 관리자가 진행 중인 지정 작업이 끝날 때까지 기다리고, 해제된 뒤 시작된 작업은 42501 이 된다.
- 지정·해제는 관리자 수만큼 행을 잠그고 서로 직렬화된다. 관리 화면 빈도와 관리자 수(수 명)에서는 문제없다고 판단.
- 40P01 은 이론상 남아 있다(예: 수동 SQL 이 다른 순서로 service_admins 를 잠글 때). 발생해도 PostgreSQL 이 한쪽만 끝내고 데이터는 일관된다.

### 5.2 이메일 일치
- `lower(u.email) = lower(입력)` 정확 일치. 부분 일치·LIKE 없음.
- 대상 조건: `email_confirmed_at IS NOT NULL AND deleted_at IS NULL`. 익명 사용자는 이메일이 없어 자연히 빠진다. 차단(banned_until) 계정은 거르지 않는다(로그인 못 하므로 권한이 있어도 쓸 수 없음).
- 후보가 2개 이상(SSO 계정과 이메일 계정이 같은 주소, 대소문자만 다른 주소 등)이면 임의로 고르지 않고 USER_NOT_FOUND 로 거부한다. 잘못된 사람에게 권한을 주는 것이 가장 위험하기 때문이다. 계약에 별도 코드가 없어 같은 코드를 썼다. 운영자가 원인을 구분해야 하면 `AMBIGUOUS_USER` 추가를 별도 결정으로 제안한다.
- 성능: `lower(email)` 에는 인덱스가 없어 auth.users 순차 조회다. 관리 화면 빈도에서는 문제없다고 판단. 회원 수가 커지면 재검토.

### 5.3 감사 기록
- `changed = true` 인 경우에만 같은 트랜잭션에서 INSERT. 멱등 재요청·없는 대상 해제는 기록하지 않는다.
- grant_admin 의 changed 는 관리자 집합 잠금 후 대상이 집합에 없을 때 `INSERT ... ON CONFLICT DO UPDATE SET enabled=true WHERE NOT enabled RETURNING` 의 결과로 정한다. 동시에 같은 사람을 지정하면 잠금으로 직렬화되어 한쪽만 true, 감사 1건.
- grant_operator 는 `ON CONFLICT DO NOTHING RETURNING`, revoke_operator 는 `DELETE ... RETURNING` 으로 같은 원리.

### 5.4 QA 1차 수정 (L3, L4)
- L4 grant_admin: 이전에는 잠금 없는 사전 조회로 "이미 enabled" 를 판단해, 그 직후 커밋된 해제를 놓치고 changed=false + 관리자 객체를 돌려줄 수 있었다.
  - 수정: grant_admin 도 revoke_admin 과 같은 관리자 집합 잠금(`WHERE enabled ORDER BY auth_user_id FOR UPDATE`)을 잡고 actor 를 재확인한다.
  - 대상이 잠긴 집합에 있으면 changed=false. 행이 잠겨 있어 이 트랜잭션이 끝날 때까지 해제될 수 없으므로 응답이 사실이다.
  - 집합에 없으면(방금 해제된 경우 포함 — 해제 커밋 뒤 재평가로 빠짐) 재활성하고 changed=true + 감사 기록.
  - 결과 SELECT 에 `AND a.enabled` 를 붙였고, 그래도 NULL 이면 null 객체 대신 40001 CONCURRENT_UPDATE 를 낸다(잠금 때문에 도달 불가, 방어용).
  - 근거: 대상 행만 FOR UPDATE 하는 방법도 있지만, actor 행 FOR SHARE 와 해제 쪽 전체 잠금의 순서가 달라 교착이 생긴다. 해제와 같은 잠금을 쓰는 것이 교착 없이 맞는 결과를 낸다.
- L3 grant_operator: `ON CONFLICT DO NOTHING` 이 기존 행 때문에 아무것도 안 했는데, 결과를 읽기 전에 동시 revoke_operator 가 그 행을 지우면 operator 가 null 이었다.
  - 수정(선택한 쪽: 재삽입): 삽입이 안 되면 기존 행을 `FOR SHARE` 로 잠근다. 잠기면 삭제가 이 트랜잭션 뒤로 밀리므로 그 행으로 응답(changed=false). 이미 지워졌으면 다시 삽입한다(최대 3회). 재삽입이 되면 changed=true + 감사 기록.
  - 객체를 v_member/v_uid/시설 정보로 직접 구성하는 안은 택하지 않았다. 실제로 없는 연결을 "있다"고 응답하게 되기 때문이다. 재삽입은 "요청 결과 = 연결 존재" 를 사실로 만든다(해제와 지정이 동시에 오면 나중에 커밋된 지정이 이긴다).
  - 3회 모두 지면 null 대신 40001 CONCURRENT_UPDATE(사실상 도달 불가).
- 감사 FK 가 `ON DELETE RESTRICT` 라 감사에 등장한 auth 사용자·회원·시설은 삭제가 막힌다(003 facility_audit, service_admins 와 같은 성격). 회원 탈퇴 정책이 생기면 재검토(미정).

## 6. 사용자 적용 절차 (개발 DB, Supabase SQL Editor)

0. 운영 안내(적용 전에 읽기): `permission_audit` 의 actor_id·target_user_id 는 `auth.users` 를 `ON DELETE RESTRICT` 로 참조한다(member_id·facility_id 도 RESTRICT).
   - 005 적용 후 한 번이라도 권한을 지정·해제한 사람(실행한 관리자, 대상자)은 Supabase 대시보드 Authentication 에서 사용자 삭제가 실패한다(외래 키 위반). service_admins 에 행이 있는 사용자는 003 부터 이미 같은 상태다.
   - 해당 사용자를 꼭 지워야 하면 감사 행을 먼저 내보내 보관한 뒤 처리 방법(감사 행 삭제 또는 FK 완화 마이그레이션)을 리더·사용자가 결정한다. 임의로 감사 행을 지우지 않는다.
   - 확인 쿼리: `SELECT count(*) FROM booking.permission_audit WHERE actor_id = '<uuid>' OR target_user_id = '<uuid>';`

1. 사전 확인(읽기 전용):
```sql
SELECT to_regclass('booking.service_admins') AS t003,
       to_regprocedure('booking.member_profile(text,text,text,text)') AS f004,
       to_regprocedure('booking.admin_permissions(uuid,text,text,jsonb)') AS f005;
SELECT column_name FROM information_schema.columns
 WHERE table_schema='auth' AND table_name='users'
  AND column_name IN ('email','email_confirmed_at','deleted_at') ORDER BY 1;
```
   기대: t003, f004 값 있음, f005 NULL. 컬럼 3개 모두 나옴. t003/f004 가 NULL 이면 003 → 004 를 먼저 적용. f005 가 NULL 이 아니면 이미 적용된 것이니 다시 실행하지 않는다. deleted_at 이 없으면 적용하지 말고 리더에게 알린다(함수 생성은 되지만 grant 실행 시 42703).
2. `migrations/005_admin_permissions.sql` 전체를 붙여 넣고 실행. 예상: `Success. No rows returned.`
   - `column "created_at" of relation "facility_operators" already exists` / `relation "permission_audit" already exists`: 이미 적용됨. 트랜잭션 전체 롤백, 변경 없음.
3. 사후 확인(읽기 전용):
```sql
SELECT column_name, is_nullable, column_default FROM information_schema.columns
 WHERE table_schema='booking' AND table_name='facility_operators' ORDER BY ordinal_position;
SELECT relname, relrowsecurity FROM pg_class
 WHERE oid IN ('booking.permission_audit'::regclass,'booking.facility_operators'::regclass);
SELECT p.prosecdef, p.proconfig,
  has_function_privilege('book_reader','booking.admin_permissions(uuid,text,text,jsonb)','EXECUTE') AS reader_exec,
  has_function_privilege('anon','booking.admin_permissions(uuid,text,text,jsonb)','EXECUTE') AS anon_exec,
  has_function_privilege('authenticated','booking.admin_permissions(uuid,text,text,jsonb)','EXECUTE') AS auth_exec,
  has_function_privilege('service_role','booking.admin_permissions(uuid,text,text,jsonb)','EXECUTE') AS srv_exec
FROM pg_proc p WHERE p.oid='booking.admin_permissions(uuid,text,text,jsonb)'::regprocedure;
SELECT has_table_privilege('book_reader','booking.permission_audit','SELECT') AS reader_audit,
       has_table_privilege('book_reader','booking.facility_operators','SELECT') AS reader_ops;
SELECT count(*) FILTER (WHERE enabled) AS enabled_admins FROM booking.service_admins;
```
   기대: created_at NOT NULL, default now(). relrowsecurity 둘 다 true. prosecdef=true, proconfig={search_path=""}, reader_exec=true, 나머지 exec false, reader_audit=false, reader_ops=false. enabled_admins 가 0 이면 docs/facility-admin.md 의 SQL 로 첫 관리자를 지정해야 화면을 쓸 수 있다.
4. 기능 확인(선택, 변경 없음): `SELECT booking.admin_permissions('00000000-0000-0000-0000-000000000000','https://example.invalid/auth/v1','list_admins','{}');` → `ADMIN_REQUIRED` 오류가 나면 정상.

운영 DB 적용은 개발 검증 뒤 사용자가 따로 결정한다.

## 7. 롤백

```sql
BEGIN;
DROP FUNCTION booking.admin_permissions(uuid,text,text,jsonb);
DROP TABLE booking.permission_audit;
ALTER TABLE booking.facility_operators DROP COLUMN created_at;
COMMIT;
```
- 함수로 바꾼 service_admins.enabled 값과 facility_operators 행은 그대로 남는다(001/003 스키마에 맞는 데이터). 감사 기록과 운영자 연결 시각은 사라진다. 감사 기록을 보존하려면 DROP 전에 내보낸다.
- REVOKE 들은 원래 부여된 권한이 없었으므로 되돌릴 것이 없다.
- 롤백 후 API 는 42883 → ADMIN_SETUP_REQUIRED.

## 8. 미정·후속

- 여러 계정 일치 시 별도 오류 코드(AMBIGUOUS_USER) 여부: 현재 USER_NOT_FOUND 로 통합.
- 감사 FK RESTRICT 로 인한 auth 사용자·회원 삭제 차단: 회원 탈퇴 정책 결정 때 재검토.
- list_admins 상한 없음, permission_audit 조회 API 없음(범위 밖).
- 마이그레이션 실행기·적용 기록 테이블 여전히 없음.
