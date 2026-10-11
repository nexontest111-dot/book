# 01 계획: 관리자 권한 관리 페이지 (서비스 관리자 + 시설 운영자)

브랜치: development/server-foundation (HEAD 31f21e9). 이전 작업 산출물: _workspace_20261011-member/.
사용자 결정(2026-10-11): 서비스 관리자 지정·해제와 시설 운영자 연결을 둘 다 화면에서 관리. 대상은 이메일 정확 일치로 찾는다(부분 검색·회원 목록 노출 없음).

## 기존 전제 (확인한 사실)
- 003: booking.service_admins(auth_user_id PK → auth.users, enabled, created_at), RLS 활성, 직접 권한 없음. 관리자 지정은 현재 SQL 수동.
  booking.admin_facilities(p_actor,...) 패턴: SECURITY DEFINER, search_path='', 첫 줄에서 enabled 관리자 확인(42501), book_reader EXECUTE 만.
- 001: booking.facility_operators(facility_id, member_id, PK 둘) — 다른 컬럼 없음.
- 004: booking.members(auth_issuer, auth_subject = auth.users.id 문자열, display_name, updated_at), booking.member_profile. issuer = SUPABASE_URL origin + "/auth/v1" (server/routes/me.js).
- server/routes/admin-facilities.js: Origin 검사, authenticate, 오류 매핑(42501→ADMIN_REQUIRED 403, 42883/42703/42P01→ADMIN_SETUP_REQUIRED 503). worker.js 는 /api/admin/* 전체를 adminFacilities 로 보냄 → 분기 필요.
- server/http.js: json/fail/readJsonBody 공용 헬퍼(/api/me 용). 본문 없음은 INVALID_JSON.
- 003·004 는 사용자 적용 미확인.

## 범위 밖
- 시설 운영자가 실제로 자기 시설·슬롯을 관리하는 API/화면(다음 작업). GET /api/me 의 operatorAccess 는 계속 false.
- 회원 부분 검색·목록, 관리자 초대 메일, 역할 세분화(슈퍼 관리자 등), 시설 삭제.

## 계층별 작업
### SQL (db) — migrations/005_admin_permissions.sql (001~004 전제)
- facility_operators 에 created_at timestamptz NOT NULL DEFAULT now() 추가.
- booking.permission_audit: id, actor_id(auth.users), action('grant_admin','revoke_admin','grant_operator','revoke_operator'), target_user_id uuid(auth.users), facility_id uuid NULL, created_at. RLS 활성, 권한 회수.
- 함수 booking.admin_permissions(p_actor uuid, p_issuer text, p_action text, p_data jsonb) RETURNS jsonb, SECURITY DEFINER, search_path=''.
  - 공통: 첫 단계에서 p_actor 가 enabled 관리자인지 확인, 아니면 42501.
  - list_admins: enabled 관리자 목록 {authUserId, email, displayName(members 있으면), createdAt, isSelf}.
  - grant_admin {email}: auth.users 에서 lower(email) 정확 일치 + email_confirmed_at NOT NULL 1명. 없으면 P0002 USER_NOT_FOUND. 이미 enabled 면 변경 없이 성공(멱등, changed=false). 비활성 행이면 enabled=true.
  - revoke_admin {authUserId}: 자기 자신 해제 금지(SELF_REVOKE), 마지막 enabled 관리자 해제 금지(LAST_ADMIN) — 동시 해제 경합에도 0명이 되지 않도록 잠금. enabled=false.
  - list_operators {facilityId?}: 시설별 운영자 {facilityId, facilityName, memberId, authUserId, email, displayName, createdAt}. 최대 200행.
  - grant_operator {facilityId, email}: 시설 존재(P0002 FACILITY_NOT_FOUND), 이메일 인증 계정 + 같은 issuer 의 booking.members 행 필요(없으면 MEMBER_NOT_REGISTERED). 이미 있으면 멱등.
  - revoke_operator {facilityId, memberId}: 행 삭제, 없으면 멱등 성공(changed=false).
  - 변경이 실제로 일어난 경우에만 permission_audit 기록, 같은 트랜잭션.
  - 입력 오류 22023 + 메시지 상수. 오류 메시지 상수 목록을 노트에 표로.
- REVOKE ALL FROM PUBLIC, anon, authenticated, service_role; GRANT EXECUTE TO book_reader.

### API (api) — server/routes/admin-permissions.js
- worker.js: /api/admin/permissions/* → adminPermissions, 나머지 /api/admin/* → adminFacilities (기존 동작 유지).
- GET  /api/admin/permissions/admins
- POST /api/admin/permissions/admins {email}  → 201 생성/재활성, 200 변경 없음
- DELETE /api/admin/permissions/admins/{authUserId}
- GET  /api/admin/permissions/operators?facilityId=
- POST /api/admin/permissions/operators {facilityId, email}
- DELETE /api/admin/permissions/operators/{facilityId}/{memberId}
- actor = getUser id, issuer = me.js 와 같은 규칙(공용 함수로 빼서 두 곳이 같은 값을 쓰게). 본문의 역할·사용자 ID 신뢰 금지(삭제 대상 ID 는 경로 파라미터로만).
- 비 GET 은 Origin 검사, JSON 본문은 server/http.js readJsonBody. 이메일은 trim, 3..254자, @ 포함 간단 검사.
- 오류: ADMIN_REQUIRED 403, ADMIN_SETUP_REQUIRED 503(005 미적용 포함), USER_NOT_FOUND 404, FACILITY_NOT_FOUND 404, MEMBER_NOT_REGISTERED 409, SELF_REVOKE 409, LAST_ADMIN 409, INVALID_EMAIL/INVALID_ID 400, DATABASE_UNAVAILABLE 503. 예상 밖 DB 오류는 SQLSTATE·상수만 로그.
- 계약: _workspace/03_api-developer_contract.md

### 화면 (web) — prototype/admin-permissions.html, admin-permissions.js (+ 필요 시 css)
- 정적 경로 /admin-permissions. admin.html 헤더에 "권한 관리" 링크, 새 페이지에 "시설 관리" 링크.
- 섹션 1 서비스 관리자: 목록(이메일·표시 이름·지정일, 본인 표시), 이메일로 지정, 해제(확인은 페이지 내 확인 UI — window.confirm 금지, 본인 행은 해제 버튼 없음).
- 섹션 2 시설 운영자: 시설 선택(기존 GET /api/admin/facilities 재사용, 검색), 선택 시설의 운영자 목록, 이메일로 연결, 해제.
- 오류 코드별 한국어 안내, 중복 제출 방지, textContent 출력, 모바일 레이아웃, 25초 시간 제한. 기존 facility-admin.js 의 인증·토큰 처리 방식 재사용.
- 노트: _workspace/04_frontend-developer_screens.md

## 완료 조건
- 005 SQL 작성(미적용), API·화면 구현, qa 높음 결함 0, 정적 검사 통과, docs 기록(docs/admin-permissions.md, worklog).

## 사용자 실행 필요
1. 003 → 004 → 005 순서 적용(미적용분만).
2. 첫 관리자 1명은 기존 SQL(docs/facility-admin.md)로 지정 — 화면은 관리자만 쓸 수 있으므로.
3. 개발 배포 후 /admin-permissions 확인.
