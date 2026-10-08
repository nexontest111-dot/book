# Supabase 연결 안내

## 승인된 구성
2026-10-08 사용자 승인: Cloudflare Workers + Supabase PostgreSQL + Supabase Auth.
별도 개발 프로젝트 book-development를 생성한다. 실제 프로젝트 생성, DB SQL 적용, 테스트, 빌드, 배포는 아직 하지 않았다.
현재 도구에는 Supabase 계정 연결이 없으므로 계정 내 설정은 사용자가 대시보드에서 수행한다.

## 1. 프로젝트 생성
https://supabase.com/dashboard 에 GitHub 또는 이메일로 로그인.
New project 선택. 조직이 없으면 먼저 조직 생성.
이름 book-development, 사용 가능한 가까운 리전, 강력한 Database Password 설정.
리전은 선택 화면에서 확인한다. 비밀번호는 개인 비밀번호 관리자에 보관한다.
유료 결제나 운영 전환은 별도 비용 확인 후 결정한다.

## 2. DB 준비
SQL Editor에서 개발 브랜치 migrations/001_facilities_and_slots.sql을 1회 실행.
이어서 migrations/002_public_reader.sql을 1회 실행.
book_reader 비밀번호는 계정 내부에서 설정한다. 예시:
ALTER ROLE book_reader PASSWORD '개인적으로_생성한_비밀번호';
이 실제 비밀번호를 Git이나 채팅에 올리지 않는다. SQL 기록에 남으므로 기록 접근도 제한한다.
이 역할은 공개 조회만 가능하고 회원/시설 운영자 테이블 및 쓰기 권한이 없다.
SQL은 아직 실행되지 않았으며 배포 전 실제 DB에서 검증해야 한다.

## 3. Hyperdrive 연결
Supabase Connect 화면에서 Direct connection 호스트와 5432 포트를 확인한다.
기본 postgres 계정 대신 위 book_reader 역할을 사용한다.
Cloudflare Hyperdrive → Create Configuration에서 book-development-db 생성.
직접 연결 정보로 등록하고 SSL을 사용한다. 예약 최신 상태를 위해 query caching은 비활성화한다.
Cloudflare 공식 문서는 Supabase와 Hyperdrive 연결에 Direct connection을 권장한다.
생성된 Hyperdrive ID는 비밀번호가 아니다. ID를 알려주면 개발 Wrangler 설정에 연결할 수 있다.

## 4. Auth 설정
Supabase Project URL 및 publishable key를 확인한다.
Cloudflare 개발 Worker 변수:
- SUPABASE_URL: 프로젝트 URL
- SUPABASE_PUBLISHABLE_KEY: publishable key
service_role 또는 secret key는 이 인증 코드에 필요하지 않다.
배포 전 이 값과 HYPERDRIVE 바인딩이 있어야 한다.

GET /api/me에 Authorization: Bearer <access_token>을 보내면
Supabase Auth getUser로 서버 검증 후 본인 ID·이메일만 반환한다.
JWT 내용만 읽어 로그인 여부나 운영자 권한을 판단하지 않는다.
운영자 자격은 추후 booking.facility_operators와 서버에서 검사한다.
현재 /api/me는 회원 DB 등록을 하지 않으며 운영자 권한을 부여하지 않는다.

## 5. 다음 구현
로그인 형태(이메일 비밀번호, 이메일 링크, 소셜)는 아직 미정이다.
인증 검증 모듈은 위 방식과 독립적이다. 로그인 UI 및 회원 생성은 방식 결정 후 추가.
개발용 도메인이 배포된 후 Supabase Auth Site URL과 허용 Redirect URL을 설정한다.
기존 운영 book 사이트는 브라우저 시안이며 이 코드와 아직 연결되지 않았다.

## 코드 상태
GitHub development/server-foundation에 추가. 로컬 실행 환경 오류로 설치/동기화 미완료.
패키지 설치 및 lockfile 생성도 아직 하지 않았다. 테스트·빌드·배포는 실행하지 않았다.

공식 참고:
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/auth
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/
