# 회원 등록(booking.members) 적용 안내

상태: 코드와 SQL 작성만 끝났다. migrations/004_member_profile.sql 은 어떤 DB 에도 적용하지 않았고 문법 실행도 하지 않았다. 사용자가 SQL Editor 에서 처음 적용할 때가 첫 실행이다. 배포와 브라우저 확인도 하지 않았다.

## 동작 요약
- 로그인 후 /auth 화면에서 표시 이름을 입력하면 booking.members 에 회원 행이 생긴다. 가입 직후가 아니라 로그인 후 별도 단계다.
- 회원 식별: issuer = SUPABASE_URL 의 origin + /auth/v1, subject = Supabase getUser 의 user.id. 요청 본문의 식별 값은 쓰지 않는다.
- 표시 이름: trim 후 1~80 코드 포인트, 제어 문자(U+0000~001F, U+007F~009F)와 짝 없는 서로게이트 금지. DB 도 같은 규칙을 다시 검사한다.
- GET /api/me: membership = active, not_provisioned, setup_required(004 미적용 또는 DB 바인딩 없음), unavailable(그 밖의 DB 오류).
- PUT /api/me/membership: 신규 201, 기존 200(같은 이름 재요청은 쓰기 없이 200).
- Worker 역할 book_reader 는 테이블 직접 권한 없이 SECURITY DEFINER 함수 booking.member_profile 의 EXECUTE 만 가진다.
- 004 를 적용하기 전에는 API 가 setup_required 로 동작하고 입력은 비활성이다.

## 정책 메모
- 약관·개인정보 동의, 탈퇴는 이번 범위가 아니다.
- 방향 제어·영폭 문자 허용 여부는 미정이다(현재 허용). 필요하면 결정 뒤 새 마이그레이션으로 추가한다.
- 표시 이름 중복은 허용한다.
- SUPABASE_URL 의 origin 이 바뀌면 같은 사람이 다른 회원으로 갈라진다. 변경 시 데이터 이전이 필요하다.

## 적용 절차 (개발 DB, Supabase SQL Editor)
비밀번호와 연결 문자열은 이 절차에 필요하지 않고 문서·채팅에 올리지 않는다.

1. 선택, 읽기 전용 사전 확인. 기존 행이 새 CHECK 를 어기면 004 전체가 롤백된다.
```sql
SELECT count(*) AS members,
  count(*) FILTER (WHERE display_name <> btrim(display_name)) AS edge_space_ascii,
  count(*) FILTER (WHERE display_name ~ '[\u0001-\u001F\u007F-\u009F]') AS has_control
FROM booking.members;
```
   edge_space_ascii 나 has_control 이 0 이 아니면 적용하지 않는다. 0 이어도 실제 CHECK 는 더 넓은 유니코드 공백을 보므로 실패할 수 있다. 실패하면 아무것도 바뀌지 않는다.
2. 003 이 미적용이면 계획상 순서는 003 → 004 다. 004 는 003 과 기술적으로 독립이다.
3. migrations/004_member_profile.sql 전체를 붙여 넣고 한 번 실행한다. 예상 결과: Success. No rows returned.
   - already exists 오류: 이미 적용된 것이다. 다시 실행하지 않는다(전체 롤백되어 변경 없음).
   - check constraint ... is violated: 1단계 사유. 변경 없음.
   - 파일은 순수 ASCII 이며 정규식의 유니코드 이스케이프를 편집기가 실제 문자로 바꾸지 않게 한다.
4. 확인 쿼리(읽기 전용)
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
   기대값: updated_at 존재(NOT NULL), 제약 members_display_name_no_control 과 members_display_name_trimmed 존재, prosecdef = true, proconfig = {search_path=""}, reader_exec = true, anon_exec = false, auth_exec = false, reader_select = false.
5. 선택 기능 확인(행을 만들지 않음)
```sql
SELECT booking.member_profile('https://example.invalid/auth/v1','00000000-0000-0000-0000-000000000000','get',NULL);
```
   결과는 NULL 이어야 한다. 실제 회원 생성은 개발 배포 후 /auth 화면에서 확인한다.

운영 DB 적용은 개발 검증 뒤 사용자가 따로 결정한다.

## 롤백
```sql
BEGIN;
DROP FUNCTION booking.member_profile(text,text,text,text);
ALTER TABLE booking.members
  DROP CONSTRAINT members_display_name_trimmed,
  DROP CONSTRAINT members_display_name_no_control,
  DROP COLUMN updated_at;
COMMIT;
```
- 함수로 만든 members 행은 남는다. updated_at 값은 사라진다.
- 롤백 후 API 는 setup_required 로 동작한다.

## 알려진 제약
- 마이그레이션 실행기와 적용 기록 테이블은 없다. 적용 여부는 위 확인 쿼리로 본다.
- 동시 첫 요청 경합은 UNIQUE 인덱스와 ON CONFLICT 로 설계했으나 실제 DB 에서 실행해 보지 않았다.
