# 관리자 권한 관리

작성: 2026-10-11. 상태: 코드와 SQL 작성만 완료. 005 SQL 미적용, 미배포, 실제 동작 미확인.
상세 근거: _workspace/02_db-architect_schema-notes.md(DB), 03_api-developer_contract.md(API), 05_qa-inspector_report.md(QA).

## 결정 (사용자, 2026-10-11)
- 서비스 관리자 지정·해제와 시설 운영자 연결 둘 다 화면에서 관리한다.
- 대상 계정은 이메일 정확 일치로 찾는다(대소문자 무시, 부분 일치 없음).

## 기능
- 화면 /admin-permissions (prototype/admin-permissions.html, .js, .css). /admin 화면에 링크가 있다.
- 서비스 관리자 목록·지정·해제, 시설별 운영자 목록·연결·해제.
- 기존 /admin 시설 목록 API(GET /api/admin/facilities)를 시설 선택에 재사용한다.

### API (모두 Bearer 토큰, 서버가 getUser 로 검증, 요청자는 DB 에서 관리자 확인)
- GET /api/admin/permissions/admins
- POST /api/admin/permissions/admins  (본문 email)
- DELETE /api/admin/permissions/admins/{authUserId}
- GET /api/admin/permissions/operators?facilityId=
- POST /api/admin/permissions/operators  (본문 facilityId, email)
- DELETE /api/admin/permissions/operators/{facilityId}/{memberId}

오류 코드·응답 필드 전체는 _workspace/03_api-developer_contract.md. 비 GET 은 다른 Origin 을 거부한다.

### 보호 규칙
- 자기 자신의 관리자 권한은 해제할 수 없다(SELF_REVOKE).
- 마지막 관리자 보호: 관리자가 0명이 되는 해제는 거부한다(LAST_ADMIN). 현재 경로에서는 자기 해제 금지와 잠금 후 재확인이 실질 보장이고 LAST_ADMIN 은 방어용이다.
- 이메일은 인증 완료 + 미삭제 계정만 대상이다. 후보가 2명 이상이면 임의로 고르지 않고 USER_NOT_FOUND 로 거부한다.
- 시설 운영자로 연결하려면 대상이 booking.members 에 등록돼 있어야 한다(표시 이름 등록: docs/member-profile.md). 아니면 MEMBER_NOT_REGISTERED.
- 요청 본문의 사용자 ID·역할은 권한 판정에 쓰지 않는다. 입력 검사가 관리자 확인보다 먼저라 비관리자도 잘못된 입력에는 400 을 받을 수 있다.
- 감사 기록 booking.permission_audit: 실제로 상태가 바뀐 경우에만 같은 트랜잭션에서 남긴다(멱등 재요청은 기록 없음).
- 직접 테이블 권한 없이 SECURITY DEFINER 함수 booking.admin_permissions 만 book_reader 에 EXECUTE 부여.
- 관리자 재지정 시 목록의 createdAt 은 최초 지정 시각 그대로다. 실제 재지정 시각은 permission_audit 에 있다.

## 변경 파일 (미커밋)
- migrations/005_admin_permissions.sql
- server/routes/admin-permissions.js, server/auth/issuer.js(신규, me.js 와 공용. 값은 기존과 동일)
- server/routes/me.js(issuer 공용화), server/worker.js(/api/admin/permissions 분기)
- prototype/admin-permissions.html, .js, .css, prototype/admin.html(권한 관리 링크)

## 적용 절차 (실행하지 않음, 개발 DB, Supabase SQL Editor)
1. 전제: 001~004 가 적용돼 있어야 한다(001, 002, 003, 004 순). 미적용분이 있으면 먼저 순서대로 적용한다. 이미 적용한 것은 다시 실행하지 않는다.
2. 사전 확인(읽기 전용): _workspace/02_db-architect_schema-notes.md 6절 1번 쿼리. 기대는 t003, f004 값 있음, f005 NULL, auth.users 의 email·email_confirmed_at·deleted_at 컬럼 3개 존재. deleted_at 이 없으면 적용하지 말고 알린다.
3. migrations/005_admin_permissions.sql 전체를 1회 실행. 예상 결과 Success. No rows returned. "already exists" 오류가 나면 이미 적용된 것이며 트랜잭션 전체가 롤백되어 변경은 없다.
4. 사후 확인(읽기 전용): 같은 노트 6절 3번 쿼리. 기대는 created_at NOT NULL, 두 테이블 RLS true, 함수 SECURITY DEFINER 와 search_path 빈 값, book_reader 만 EXECUTE, book_reader 의 permission_audit·facility_operators 직접 권한 없음.
5. 첫 관리자: enabled 관리자가 0명이면 docs/facility-admin.md 의 SQL 로 한 명을 지정한다. 그 뒤부터 화면에서 추가 지정한다.
6. 개발 코드 배포가 끝나면 /auth 로그인 후 /admin-permissions 에서 목록 조회, 지정·해제, 운영자 연결을 확인한다.

운영 DB 적용은 개발 검증 뒤 사용자가 따로 결정한다.

## 운영 주의
- permission_audit 의 actor_id, target_user_id, facility_id, member_id 는 ON DELETE RESTRICT 이다. 005 적용 후 권한을 지정·해제한 사람(실행자와 대상자)은 Supabase Authentication 에서 사용자 삭제가 외래 키 위반으로 막힌다. service_admins 에 행이 있는 사용자는 003 부터 이미 같은 상태다.
- 꼭 지워야 하면 감사 행을 먼저 내보내 보관한 뒤 처리 방법(감사 행 삭제 또는 FK 완화 마이그레이션)을 사용자와 정한다. 임의로 감사 행을 지우지 않는다.
- 회원 탈퇴 정책이 생기면 이 제약을 재검토한다(미정).
- lower(email) 에 인덱스가 없어 이메일 조회는 auth.users 순차 조회다. 회원 수가 커지면 재검토.
- 자격 증명(비밀번호, 연결 문자열, 토큰)은 이 문서와 저장소에 기록하지 않는다.

## 롤백
_workspace/02_db-architect_schema-notes.md 7절. 함수와 permission_audit 테이블을 DROP 하고 facility_operators.created_at 컬럼을 제거한다. service_admins.enabled 변경과 facility_operators 행은 그대로 남고 감사 기록은 사라진다(필요하면 DROP 전에 내보낸다). 롤백 후 API 는 ADMIN_SETUP_REQUIRED(503)를 반환한다.

## 상태와 검증
- 작성만 했다. 005 는 어떤 DB 에도 적용하지 않았다. 배포·브라우저·모바일 확인 없음. 사용자 확인 근거 없음. 완료로 보지 않는다.
- 실행한 검증: static-check 통과, node --check 통과, qa 가 가짜 pg/supabase 모듈로 라우트 51건과 40001 매핑, who() 를 실행(실제 DB·네트워크 아님).
- 동시성(잠금·교착 방지)은 코드 분석만 했고 실제 재현은 하지 않았다.
- 미실행: 005 실제 적용(SQL 문법 실행 포함), 동시성 실재현, wrangler dev, 배포, 브라우저·모바일.
- QA: 1차 높음 0 / 중간 2 / 낮음 6 을 모두 해결했고, 재검증에서 나온 신규 낮음 1건도 해결했다.

## 미정·후속
- 이메일 후보가 여러 명일 때 별도 오류 코드(AMBIGUOUS_USER) 여부(현재 USER_NOT_FOUND 로 통합).
- 감사 FK RESTRICT 에 따른 사용자 삭제 차단과 탈퇴 정책.
- permission_audit 조회 API 없음, 관리자 목록 상한 없음.
- 시설 운영자가 자기 시설·슬롯을 관리하는 API/화면과 GET /api/me 의 operatorAccess 계산은 미착수.
