# PostgreSQL 기반 1차 구현

2026-10-08: 사용자 승인으로 Workers + 관리형 PostgreSQL 채택.
개발 브랜치: development/server-foundation. 운영 main에는 반영하지 않았다.

## 작성된 기능
- pg 드라이버와 Hyperdrive 연결 모듈.
- 시설, 시설 운영자, 자원, 공개 슬롯 및 골프/야구 상세 테이블 SQL.
- GET /api/facilities?sport=golf&region=서울: 공개 시설 최대 100개.
- GET /api/facilities/{UUID}/slots?date=YYYY-MM-DD: 한국 날짜 기준 공개 슬롯 최대 200개.
- SQL 매개변수 바인딩, 입력 검증, 비공개 시설 제외.
- DB가 없으면 503. 목업 데이터로 실제 DB 응답을 대체하지 않는다.
- health는 바인딩 설정 유무만 표시하고 연결 성공을 주장하지 않는다.
- 등록/수정, 로그인, 예약, 홀드 및 결제 API는 미구현.
- 슬롯 조회는 최종 예약 가능 여부가 아니다. 홀드 기능 구현 시 서버에서 재확인한다.
- 화면은 아직 브라우저 시안이며 API와 연결되지 않았다.

## 채택한 공급자와 인증
사용자 승인으로 Supabase PostgreSQL + Supabase Auth를 채택했다. DB와 회원 인증을 함께 관리할 수 있으나 제공자의 Auth 및 권한 설정을 알아야 한다.
대안은 다른 관리형 PostgreSQL + 별도 인증 서비스다. 공급자를 각각 선택할 수 있으나 설정·비용·장애 관리 지점이 늘어난다.
실제 계정 연결은 supabase-connection.md의 절차로 진행한다.
이메일 또는 소셜 로그인 방식도 다음 결정 사항이다.

근거:
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase 연결: https://supabase.com/docs/guides/database/connecting-to-postgres
- 데이터 접근 보호: https://supabase.com/docs/guides/database/secure-data
- pg + Hyperdrive: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/

## 승인 후 연결 순서
1. 별도 개발 DB 프로젝트를 생성하고 운영 DB와 분리.
2. SQL을 검토한 뒤 migrations/001_facilities_and_slots.sql 적용. 이 파일은 1회 적용이며 아직 실행하지 않았다.
3. 브라우저/익명 계정에 booking 스키마 접근 권한을 주지 않는다.
4. Worker 전용 역할에 booking 스키마 USAGE와 공개 조회에 필요한 테이블 SELECT만 부여한다. 쓰기와 예약 구현 시 별도 권한을 설계한다. RLS가 활성화되므로 전용 역할에 SELECT 정책도 필요하다. 소유자/관리자 연결로 우회하지 않는다.
5. Hyperdrive에 전용 역할의 SSL 연결 정보를 등록하고 예약용 연결의 query caching은 끈다.
6. wrangler.development.jsonc에 실제 ID로 hyperdrive 항목 추가:
   {"binding":"HYPERDRIVE","id":"실제_개발용_ID"}
7. 패키지 설치 후 lockfile 생성. 현재는 로컬 실행 도구 오류로 설치하지 않았으며 lockfile도 없다.
8. 요청/승인 후 개발 환경에서 테스트·빌드 및 book-development 배포.
9. 공개 시설/슬롯 조회가 확인된 뒤 인증, 시설 소유권 검사, 등록 API 및 화면 연결 순서로 개발.

연결 문자열·비밀번호·비밀키는 채팅이나 Git에 넣지 않는다.

## 예약 충돌 설계의 다음 작업
현재 SQL의 UNIQUE는 완전히 같은 슬롯만 중복 방지한다. 겹치는 시간의 이중 예약을 해결하는 완성된 예약 모델은 아니다.
야구장: 구장별 점유 시간 범위에 배타 제약을 적용할 계획.
골프: 코스의 라운드 시간이 겹쳐도 서로 다른 티타임은 허용되므로 티타임별 홀드/인원 수를 잠금으로 관리할 계획.
홀드 테이블, 만료 처리, 최신 제안 동의, 양측 결제 상태는 다음 마이그레이션에 추가한다.
시설/자원 종류와 업종별 상세의 일치 검증도 등록 API와 DB 제약에 추가한 후 쓰기를 활성화한다.

## 실행 상태
테스트·빌드·배포·실제 DB 생성·SQL 적용을 수행하지 않았다.
로컬 명령 실행이 환경 오류로 실패하여 GitHub 연결로 코드를 커밋했다. 로컬 폴더 동기화는 별도 필요하다.
