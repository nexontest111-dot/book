# 개발 환경 연결 현황

2026-10-08

- 사용자 화면에서 Supabase 개발 프로젝트와 Hyperdrive 구성 생성 확인.
- 사용자 보고로 DB 스키마 및 공개 조회 권한 SQL 실행 완료.
- 사용자 보고로 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY 런타임 변수 등록 완료.
- 사용자 화면에서 Cloudflare 개발 Worker의 연결 브랜치 development/server-foundation 확인.
- 개발 배포 명령: npx wrangler deploy --config wrangler.development.jsonc
- keep_vars 설정으로 대시보드에서 등록한 런타임 변수를 배포 시 유지.
- 이 커밋으로 자동 빌드 요청. 서버 배포 성공 및 DB API 응답은 아직 확인하지 않았다.
- 운영 main 사이트는 시안이다. 개발 화면도 아직 API와 연결되지 않는다.

배포 후 확인할 URL:
- /api/health: 설정 유무만 표시하며 실제 DB 연결을 검사하지 않는다.
- /api/facilities: DB 조회가 성공하면 data 배열을 반환. 시설 미등록 시 빈 배열이 정상.

참고: https://developers.cloudflare.com/workers/wrangler/configuration/
