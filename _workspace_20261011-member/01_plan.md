# 01 계획: 인증 회원의 booking.members 등록 (최소 프로필)

브랜치: development/server-foundation (HEAD 6c6ce57)
사용자 결정(2026-10-11): 표시 이름은 가입·로그인 직후 별도 단계에서 입력. 약관·개인정보 동의는 이번 범위 밖.

## 목표
이메일 인증을 마친 Supabase 사용자가 표시 이름을 입력해 booking.members 행을 만들고, 이후 표시 이름을 수정할 수 있다.
GET /api/me 가 실제 회원 상태를 반환한다.

## 기존 전제 (확인한 사실)
- 001: booking.members(id, auth_issuer, auth_subject, display_name 1..80, created_at, UNIQUE(auth_issuer, auth_subject)), RLS 활성, 정책·쓰기 권한 없음.
- 002: Worker DB 역할 book_reader 는 SELECT 만 가능, members 는 SELECT 권한도 없음.
- 003 패턴: 쓰기는 SECURITY DEFINER 함수(search_path='') + book_reader EXECUTE 만 허용. 행위자는 Worker 가 getUser 결과로 넘기고 요청 본문에서 받지 않음.
- server/auth/supabase.js authenticate(): getUser 서버 검증, 익명·미인증 이메일 차단.
- 003 은 아직 사용자 미적용. 004 는 003 에 의존하지 않게 작성한다(001/002 만 전제).

## 범위 밖
약관·개인정보 동의 기록, 탈퇴, 시설 운영자 자격(operatorAccess 는 계속 false), 프로필 사진·연락처, 관리자 회원 조회.

## 계층별 작업
### SQL (db) — migrations/004_member_profile.sql
- members 에 updated_at timestamptz NOT NULL DEFAULT now() 추가(필요 판단 시 version 도).
- display_name: 앞뒤 공백 없음, 제어 문자 금지 CHECK 추가 검토(기존 행 위반 가능성 검토 — 현재 행 없음으로 추정되나 미확인이므로 NOT VALID 여부 판단).
- 함수 booking.member_profile(p_issuer text, p_subject text, p_action text, p_display_name text) RETURNS jsonb, SECURITY DEFINER, search_path=''.
  - 'get': 행 있으면 {id, displayName, createdAt, updatedAt}, 없으면 null.
  - 'upsert': INSERT ... ON CONFLICT (auth_issuer, auth_subject) DO UPDATE display_name — 동시 요청에도 행 1개(멱등).
- REVOKE ALL FROM PUBLIC, anon, authenticated, service_role; GRANT EXECUTE TO book_reader. 테이블 직접 권한 부여 없음.
- 사용자 실행 절차와 확인 쿼리를 노트에 기록.

### API (api) — server/
- issuer 는 서버가 결정: `${SUPABASE_URL 정규화}/auth/v1`. subject = getUser 의 user.id. 클라이언트 값 사용 금지.
- GET /api/me: membership "active" + member {id, displayName} 또는 "not_provisioned". 004 미적용(42883/42P01) 시 membership "setup_required" 로 응답하고 실패시키지 않음. operatorAccess false 유지.
- PUT /api/me/membership {displayName}: JSON·크기 제한, Origin 검사(003 라우트와 동일), trim 후 1..80, 제어 문자 거부 → INVALID_DISPLAY_NAME. 생성 201 / 갱신 200 구분 가능하면 구분. 004 미적용 → MEMBER_SETUP_REQUIRED 503.
- 공통 JSON 본문 읽기 로직은 admin-facilities.js 와 중복되면 작은 공용 모듈로 빼도 되지만 기존 동작을 바꾸지 않는다.
- 계약 문서: _workspace/03_api-developer_contract.md

### 화면 (web) — prototype/auth.*
- 로그인 확인 후 /api/me 결과에 따라:
  - not_provisioned: 표시 이름 입력 단계(가입 완료 단계) 표시 → PUT 후 완료 표시.
  - active: 표시 이름 노출 + 수정.
  - setup_required: "회원 정보 저장 준비 중" 안내, 입력 비활성.
- 오류 코드별 한국어 안내, 모바일 레이아웃 유지. 노트: _workspace/04_frontend-developer_screens.md

## 완료 조건
- 004 SQL 작성(미적용), API·화면 구현, qa 교차 검증에서 높음 결함 0, 정적 검사 실행 결과 기록.
- 문서: docs/ 에 004 적용 절차, worklog 기록.

## 사용자 실행 필요
1. Supabase SQL Editor 에서 003(미적용 시) → 004 순서 적용.
2. 개발 배포 후 /auth 에서 표시 이름 등록 확인.
테스트·배포·커밋은 요청 시에만.
