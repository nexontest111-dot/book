# 개발 배포 현황

2026-10-08 마감 기록

- 개발 브랜치: development/server-foundation
- 개발 주소: https://book-development.nexontest111.workers.dev
- 운영 주소: https://book.nexontest111.workers.dev (예약 시안)
- DB: Supabase PostgreSQL, Hyperdrive, 공개 조회 전용 역할 및 RLS.
- 인증: Supabase 이메일 가입, 이메일 확인, 로그인·로그아웃. 토큰과 이메일 인증은 서버에서 검증.
- 실제 DB 조회 성공: 사용자 /api/facilities 응답 data:[] 확인.
- 인증 설정 인식 성공: 사용자 /api/health 응답 authenticationConfigured:true 확인.
- 실제 인증 로그인 성공: 사용자 32.png에서 /auth의 서버 확인 메시지 확인.
- 00ef548 이전 기능은 사용자 화면으로 개발 사이트 반영을 확인했다.
- 이 문서 마감 커밋은 자동 빌드를 요청한다. 문서 커밋 빌드 완료는 아직 확인 전이다.
- 본인 인증과 별개로 booking.members 등록, 운영자 권한 및 예약 기능은 아직 미구현.
- 예약 시안 데이터는 브라우저 저장이며 실제 DB와 연결되지 않는다.
- 로컬 실행 환경 오류로 원격 GitHub 연결을 사용했다. 로컬 Git 동기화는 미확인.
- 상세: worklog.md

개발 명령: npx wrangler deploy --config wrangler.development.jsonc
