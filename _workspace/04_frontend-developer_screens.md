# 04 화면 노트: 권한 관리 (/admin-permissions)

사용 가능 도구: Read, Grep, Glob, Write, Edit, Bash(node --check 만 사용). 서버 실행·브라우저 검증은 하지 않음.

## 변경 파일
- prototype/admin-permissions.html (신규), admin-permissions.js (신규), admin-permissions.css (신규)
- prototype/admin.html: 헤더 nav 에 "권한 관리"(/admin-permissions) 링크만 추가.
- 재사용: styles.css, facility-admin.css (admin-pagination 등), supabase 세션(storageKey book-development-auth), /api/auth/config.

## 호출 API와 사용 필드 (00_contract_fixed.md 기준)
| 호출 | 사용 필드 |
| --- | --- |
| GET /api/admin/permissions/admins | data[].authUserId, email, displayName, createdAt, isSelf |
| POST /api/admin/permissions/admins {email} | changed |
| DELETE /api/admin/permissions/admins/{authUserId} | changed |
| GET /api/admin/permissions/operators?facilityId= | data[].facilityId, memberId, email, displayName, createdAt |
| POST /api/admin/permissions/operators {facilityId,email} | changed |
| DELETE /api/admin/permissions/operators/{facilityId}/{memberId} | changed |
| GET /api/admin/facilities?q=&page= (기존) | data[].id, name, sport, region; total (페이지 크기 50 가정, facility-admin.js 와 동일) |

## 동작
- 시작 시 목록 조회로 관리자 여부 판정. UNAUTHORIZED / EMAIL_NOT_CONFIRMED / ADMIN_REQUIRED / ADMIN_SETUP_REQUIRED 면 작업 영역을 숨기고 상단 안내만 표시.
- 계약표 전체 오류 코드(공통 오류 포함) + TIMEOUT/NETWORK 에 한국어 문구. 섹션 폼 오류는 해당 섹션 메시지 줄에, 로드 오류는 상단 상태줄에 표시.
- 해제는 행 안의 "해제 확인/취소" 인라인 확인(confirm/alert 미사용). 본인 행(isSelf)은 해제 버튼 없음, "본인" 배지.
- 지정일/연결일은 Intl 로 Asia/Seoul(KST) 표시. 모든 서버 값은 textContent.
- 중복 제출 방지: 전역 busy 로 한 번에 요청 하나, 모든 버튼·입력 비활성. 요청 시간 제한 25초(AbortSignal.timeout).
- 늦은 응답 무시: 관리자/시설/운영자 목록별 시퀀스 번호, 시설 변경 시 운영자 응답은 시설 ID 일치할 때만 반영, SIGNED_OUT 시 초기화.
- 이메일은 trim 후 3..254자·@ 포함을 클라이언트에서 선검사(서버 검증이 최종).
- 변경 성공 후 서버에서 목록을 다시 조회해 표시(화면 상태만으로 확정 표시 안 함). changed=false 면 "이미 …" 안내.

## 알려진 사항 / 남은 것
- 시설 목록 한 페이지 50개 가정은 기존 admin 화면과 동일.
- 계약 불일치 발견 없음. 실제 서버·브라우저 동작은 미검증(node --check 통과만).
- 정적 경로 /admin-permissions 가 확장자 없이 서빙되는지는 /admin 과 같은 방식이라 가정(설정 파일 미수정).

## QA 1차 수정 반영
- M1: 시설 검색 폼 아래 #facility-msg 추가, 검색·이전·다음 오류는 여기에 표시(검색 제출 시 초기화).
- M2: who() 헬퍼 — email 없으면 (displayName 또는 "(이메일 없는 계정)") + 식별자(운영자 memberId, 관리자 authUserId) 앞 8자. 목록 제목, 해제 확인, 해제 완료 문구에 적용. "null" 문자열 출력 없음.
- L1: AUTH_NOT_CONFIGURED, INVALID_FILTER 문구 추가.
- L5: 운영자 200건 이상이면 "최대 200명까지 표시합니다." 안내.
- 지정/연결 성공 문구는 입력 이메일을 쓰고 응답의 admin/operator 는 사용하지 않아 null 이어도 목록 재조회만 하고 오류 없음.
