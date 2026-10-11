# 05 QA 보고 (1차) — 관리자 권한 관리

qa-inspector 보고를 리더가 저장. 결론: 높음 0, 중간 2(web), 낮음 6. SQL↔API, API↔화면 계약 불일치 없음.

## 실행
- static-check 통과, node --check 5파일 통과, 005 SQL 순수 ASCII.
- 가짜 pg/supabase 모듈로 worker.fetch 51건(scratchpad t5.mjs): 6개 엔드포인트, Origin, 본문, DB 인자(actor·issuer), 오류 매핑 9종 + 기타, list_operators FACILITY_NOT_FOUND 404, 회귀(/api/admin/facilities, /api/me) 정상.
## 미실행
- 005 실제 적용·문법, 잠금·교착 실행, wrangler·배포·브라우저·모바일, /admin-permissions 서빙.

## 결함
- M1 (web) admin-permissions.js:209-212, html:20-22 — 시설 검색 오류 메시지 대상이 숨겨진 #operator-area 안. 별도 #facility-msg.
- M2 (web) admin-permissions.js:127,133,178 (+89,98,170) — email null 운영자/관리자 표시가 빈 제목·"null 계정" 문구. 대체 문구 + memberId 앞부분.
- L1 (web) 7-31 — AUTH_NOT_CONFIGURED, INVALID_FILTER 문구 없음.
- L2 (api 문서) 03 계약 — list_operators 없는 시설은 FACILITY_NOT_FOUND 확정, DELETE operators 는 FACILITY_NOT_FOUND 안 냄.
- L3 (db) 005:156-174 — grant_operator 와 revoke 동시 시 operator null → API 503. v_obj NULL 이면 직접 구성.
- L4 (db) 005:132-150 — 해제 직후 grant_admin 이 changed=false 로 "이미 관리자" 응답. 결과 SELECT 에 enabled 조건.
- L5 (web) — 운영자 200행 상한 안내 없음.
- L6 (db/docs) 005:12-16 — permission_audit FK RESTRICT 로 auth 사용자 삭제 차단. 문서 안내.

# 2차 최종 재검증 (동결 후)
1차 8건(M1·M2·L1~L6) 전부 해결. 높음 0. 새 잠금 설계(grant_admin/revoke_admin 동일 FOR UPDATE 순서, FOR SHARE 단방향 대기, grant_operator 최대 3회 재시도) 교착·무한 루프 없음 — 코드 분석, 실제 DB 미실행.
실행: static-check, node --check 5파일, t5 51건 재실행, t6 40001 매핑, who() 헬퍼 실행.
신규 낮음 N1 (api) admin-permissions.js:21-22 — CONCURRENT_UPDATE 가 KNOWN_MESSAGES 에 없어 로그 message=-. 상수 추가 + 03 오류표.
- N1 해결: KNOWN_MESSAGES 에 CONCURRENT_UPDATE 추가(리더 확인), 03 오류표 갱신.
