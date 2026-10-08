# 이메일 회원가입과 로그인

개발 브랜치에 /auth 화면, 로그인/가입/재발송/로그아웃과 /api/me 서버 확인을 추가했다.
이메일 인증 여부도 서버에서 검증한다. Supabase 계정 생성만 수행하며 booking.members 등록과 운영자 자격 부여는 다음 단계다.
메인 예약 화면은 시안임을 계속 표시한다.
브라우저 SDK는 공식 CDN 방식으로 2.117.3 버전을 고정해 사용한다. CDN 장애 시 오류를 표시한다.
세션은 SDK가 브라우저 저장소에서 관리한다. 비밀번호는 따로 저장하거나 로그에 남기지 않는다.
토큰 URL을 SDK 처리 뒤 지우고 referrer 전송을 막는다.

## Supabase 설정
Authentication → URL Configuration
- Site URL: https://book-development.nexontest111.workers.dev
- Redirect URLs: https://book-development.nexontest111.workers.dev/auth

Authentication → Sign In / Providers → Email
- 이메일 로그인/가입 활성화
- Confirm email 활성화
- 비밀번호 최소 길이 8자 이상 설정

기본 SMTP는 프로젝트 팀 계정으로만 발송된다.
첫 확인은 Supabase 조직에 등록한 본인 이메일로 진행한다.
일반 회원에게 발송하려면 별도 SMTP 공급자/발신 도메인을 선택해 연결해야 한다.
이메일 제한을 우회하려고 Confirm email을 끄지 않는다.
요금, 일반 회원 메일 공급자, 약관·개인정보 동의, 비밀번호 재설정, 탈퇴는 남은 출시 준비 항목이다.
현재 화면은 개발 환경용이며 일반 회원 출시용 완성 화면이 아니다.

## 확인 순서 (아직 실행하지 않음)
1. 자동 개발 배포 완료 확인.
2. 위 URL/이메일 설정 저장.
3. 개발 사이트 /auth에서 본인 이메일로 회원가입.
4. 메일 링크 클릭 후 로그인. 서버 확인 메시지 확인.
5. 로그아웃, 재로그인, 인증 전 로그인 제한, 메일 재발송/만료/잘못된 비밀번호 확인.

직접 테스트·빌드·배포 명령은 실행하지 않았다. 개발 브랜치 커밋은 연결된 자동 빌드를 시작한다.
참고:
- https://supabase.com/docs/reference/javascript/auth-signup
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/reference/javascript/installing
- https://supabase.com/docs/guides/auth/auth-smtp
