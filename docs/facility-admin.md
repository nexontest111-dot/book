# 웹페이지 시설 노출 관리

작업 브랜치: feature/facility-admin. DB 적용 후 개발 브랜치로 반영한다.

## 기능
- /admin: 서비스 관리자 전용 골프장·야구장 정보 등록 및 수정.
- 이름/종목/지역/주소/소개/대표 사진 HTTPS URL.
- 공개/비공개, 상단 고정/해제, 고정 순서(1~1000).
- 숫자가 작은 고정 시설 → 일반 시설. 같은 순서는 시설명·ID 순.
- 비공개 시설은 고정돼 있어도 메인에 표시하지 않는다.
- 관리자 목록은 검색/종목 필터 및 50개 단위 페이지.
- 메인 시설 정보는 실제 DB 데이터, 예약 슬롯 아래 영역은 기존 시안.
- 시설 정보 저장은 슬롯·코스·구장 생성과 별개다. 코스/구장이 있는 시설의 종목 변경은 차단한다.
- 직접 삭제 대신 비공개를 사용한다. 사진 업로드는 포함하지 않았으며 URL 입력 방식이다.

## 적용 순서 (실행하지 않음)
1. Supabase 개발 SQL Editor에서 migrations/003_facility_admin.sql 전체를 1회 실행.
   001,002가 이미 적용돼 있어야 하며 이를 다시 실행하지 않는다.
2. 관리자로 쓸 인증 완료 계정을 명시적으로 지정한다.
   현재는 어떤 계정에도 자동으로 관리자 권한을 부여하지 않았다.
3. 아래 SQL의 이메일을 관리자로 승인한 계정으로 바꿔 실행한다.
   RETURNING 결과가 0행이면 해당 이메일/인증 완료 여부를 확인한다.
```sql
INSERT INTO booking.service_admins (auth_user_id, enabled)
SELECT id, true FROM auth.users
WHERE lower(email) = lower('관리자로_승인한_이메일')
  AND email_confirmed_at IS NOT NULL
ON CONFLICT (auth_user_id) DO UPDATE SET enabled = true
RETURNING auth_user_id, enabled;
```
4. 개발 코드 배포가 완료되면 /auth로 로그인 후 /admin 접근.
5. 새 시설을 등록하고 '메인에 공개'를 선택. 고정하려면 '목록 상단에 고정'과 순서 설정.
6. 메인 새로고침으로 노출 확인.

권한 해제는 Supabase 내부에서 해당 service_admins.enabled=false로 변경.
관리자 지정 SQL은 계정 접근이 있는 사용자만 실행하며 다른 회원에게 관리자 권한을 부여하지 않는다.

## API
- GET /api/admin/facilities?q=&sport=&page=0
- POST /api/admin/facilities
- PATCH /api/admin/facilities/{UUID}
- PATCH는 전체 편집 필드를 보내는 방식이며 현재 version이 필수다.
- 공개 GET /api/facilities는 공개 시설만 반환하며 pin_order를 우선 정렬한다.
- 관리자 GET도 서버에서 getUser와 이메일 인증 확인, DB 관리자 목록 확인을 수행한다.
- 요청 body의 사용자 ID·이메일·역할은 권한 판정에 사용하지 않는다.
- PUBLIC/anon/authenticated/service_role은 관리 함수 실행 권한이 없다.
- 기존 book_reader에는 직접 쓰기 권한을 부여하지 않고, 관리자 확인을 포함한 제한된 함수 EXECUTE만 추가.
- 이 DB 계정은 이제 공개 조회 외에 관리자 함수 호출도 가능한 신뢰된 Worker 전용 계정이다. 비밀번호를 브라우저에 노출하지 않는다.
- SECURITY DEFINER는 search_path='' 및 완전한 테이블명, 정적 SQL 사용.
- 변경 및 감사 기록은 한 함수 호출의 트랜잭션으로 처리.
- version 불일치는 409, 관리자 미지정은 403, DB 설정 누락은 503.
- 저장한 HTML 문구는 텍스트로 렌더링하며 사진은 HTTPS만 허용한다.
- 익명 방문자는 관리자 HTML을 받아도 API를 사용할 수 없다.

## 변경 파일
- migrations/003_facility_admin.sql
- server/routes/admin-facilities.js, server/worker.js
- prototype/admin.html, facility-admin.js, facility-admin.css
- prototype/index.html, facility-display.js, facility-display.css

## 확인 상태와 제한
코드를 작성했으며 요청 없는 테스트/빌드/배포/DB SQL 실행은 수행하지 않았다.
로컬 명령은 setup refresh 환경 오류로 접근하지 못했다.
실제 SQL 적용, 관리자 지정 및 저장·공개·고정·권한 거절·동시 수정 동작 확인이 필요하다.
003 적용 전 새 공개 조회 API는 추가 컬럼이 없어 오류가 날 수 있다. DB 적용 후 코드 배포 순서가 필요하다.
운영 main은 이 단계의 적용 대상이 아니다.

공식 참고:
- https://www.postgresql.org/docs/current/sql-createfunction.html
- https://supabase.com/docs/guides/database/functions
