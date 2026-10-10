# 다른 머신에서 작업 이어가기

작성일: 2026-10-10 (Asia/Seoul)
이 문서는 새 머신 또는 새 작업 세션의 첫 확인 문서다.
기능 완료 근거는 2026-10-08 사용자 로그·화면 및 GitHub 빌드 결과다. 2026-10-10 전체 서비스를 재검증한 기록은 아니다.

## 1. 프로젝트와 현재 작업 위치

- GitHub: https://github.com/nexontest111-dot/book
- 소유자: nexontest111-dot. 도구 연결 프로필 표시 이름은 JuneTMStudios였다.
- 작업 브랜치: development/server-foundation
- 기존 머신 로컬 경로: C:\projects\booksys\book
- 인수인계 작성 직전 HEAD: 49797534aa1803572d2e2eb6dacc2333e94421eb
- 새 머신은 이 문서가 포함된 개발 브랜치의 최신 HEAD를 사용한다.
- 운영 main과 개발 브랜치를 혼동하지 않는다.

| 용도 | Worker | 주소 | 상태 |
|---|---|---|---|
| 운영 시안 | book | https://book.nexontest111.workers.dev | 브라우저 데모 |
| 개발 서버 | book-development | https://book-development.nexontest111.workers.dev | 실제 DB 조회와 인증 로그인 확인됨 |

## 2. 새 머신에서 재개하는 순서

PowerShell 예시. 새 폴더에서 실행하며 기존 변경이 있는 저장소를 덮어쓰지 않는다.

```powershell
git clone https://github.com/nexontest111-dot/book.git
cd book
git fetch origin
git switch --track origin/development/server-foundation
git status --short --branch
git log -1 --oneline
```

이미 로컬 개발 브랜치가 있으면 git switch development/server-foundation 후 변경 여부를 확인하고 git pull --ff-only를 사용한다.
pull 전에 미커밋 작업이 있으면 보존하고 차이를 검토한다. 자동 reset/clean/force push를 하지 않는다.

문서 확인 순서:
1. 저장소 및 상위 경로의 AGENTS.md 등 개발 지침이 있다면 먼저 읽는다.
2. 이 문서, worklog.md
3. requirements-draft.md, payment-policy-proposal.md, booking-design.md
4. server-implementation-plan.md, postgresql-setup.md, email-auth-setup.md
5. 코드와 wrangler.development.jsonc

로컬 실행 준비:
- Git 및 Node.js/npm 설치 여부 확인.
- package.json 의존성 설치가 필요하나 저장소에 lockfile은 아직 없다. npm ci는 사용할 수 없다.
- npm install 후 생성된 lockfile은 별도 검토하고 커밋 여부를 결정한다.
- 설치/실행/테스트/빌드/배포는 사용자 진행 원칙과 해당 요청 범위를 확인하고 수행한다.
- 개발 실행 설정은 npm run dev 또는 npx wrangler dev --config wrangler.development.jsonc.
- 로컬 Hyperdrive는 실제 로컬 DB 연결 또는 지원되는 원격 개발 방식 설정이 추가로 필요하다. 현재 설정만으로 로컬 실행이 준비됐다고 가정하지 않는다.
- 로컬 DB 연결 문자열을 준비한다면 저장소에 넣지 말고 무시되는 환경 파일/개인 설정으로 관리한다.

## 3. 외부 도구 및 계정 연결

Git clone 권한, 에이전트의 GitHub 앱 권한, Cloudflare의 GitHub 앱 권한은 각각 별개다.
이전 세션의 도구 연결 ID는 새 머신에서 재사용하지 않는다. 연결된 계정과 실제 대상 저장소를 다시 확인한다.

### GitHub와 에이전트 도구
- 저장소는 공개이므로 clone/read는 가능하지만 commit/push에는 본인 계정 권한이 필요하다.
- 최초에는 에이전트 GitHub 연결의 앱 설치가 없어 쓰기가 403으로 막혔다.
- 사용자 OpenAI GitHub 앱 설치 및 저장소 접근 허용 후 앱 기반 커밋이 가능해졌다.
- Cloudflare 앱에 all repositories 권한이 있어도 에이전트 GitHub 도구의 권한을 대신하지 않는다.
- 새 세션에 GitHub 연결 도구가 없거나 쓰기가 거부되면 사용 중인 제품의 GitHub 연결 설정과 GitHub Settings → Applications에서 해당 앱 설치/저장소 범위를 확인한다.
- 제품 UI 이름과 연결 방법은 바뀔 수 있으므로 새 세션에서 현재 안내를 확인한다.
- 연결된 계정이 여러 개였다. junhani와 nexontest111-dot 중 이 프로젝트는 nexontest111-dot 연결을 사용했다.
- 다른 계정에 임의로 쓰거나 설치 권한을 확장하지 않는다.
- 로컬 Git을 사용한다면 GitHub 로그인/인증을 설정하고 git remote -v로 대상 origin 확인.
- 이전 에이전트는 로컬 도구 오류 때문에 GitHub API로 tree → commit → expected HEAD를 검증하는 ref update 방식으로 커밋했다.

### Cloudflare
- 기존 사용자 Cloudflare 계정 안에서 설정했다. 새 머신은 같은 계정 로그인 및 Worker/Hyperdrive 접근 권한이 필요하다.
- Workers 및 Pages → book-development → 설정 → 빌드:
  - Git 저장소: nexontest111-dot/book
  - 분기 제어: development/server-foundation
  - 루트 디렉터리: /
  - 빌드 명령: 없음
  - 배포 명령: npx wrangler deploy --config wrangler.development.jsonc
  - 개발 Worker의 미리보기 빌드는 끄도록 안내했다. 현재 값은 대시보드에서 재확인.
- GitHub 연결 후 해당 브랜치 커밋으로 자동 빌드/배포.
- CLI로 직접 배포하려면 별도의 Cloudflare 로그인/토큰이 필요하다. GitHub 앱 연결만으로 새 머신 CLI 인증이 완료되는 것은 아니다.
- 빌드 토큰 표시 이름은 book build token이었다. 토큰 값은 저장하지 않았다.
- 런타임 변수와 빌드 변수는 별개다. Supabase 값은 런타임에 필요한 값이다.
- keep_vars:true로 대시보드 변수 유지. 공개 URL과 publishable key는 개발 Wrangler vars에도 기록돼 있다.
- Secret/service_role 키는 이 인증 코드에 필요하지 않다.

Hyperdrive:
- 구성 이름: book-development-db
- ID: a7244cb587fd4870a40b968dfc9172a0 (비밀번호가 아닌 구성 ID)
- Worker 바인딩 이름: HYPERDRIVE
- Supabase Direct connection, 포트 5432, DB postgres, 사용자 book_reader.
- 연결 문자열과 비밀번호는 Cloudflare 계정 내부에 보관. 새 머신에 복사하거나 Git에 기록할 필요가 없다.
- query caching은 비활성화하도록 안내했다. 설정에서 실제 비활성 여부 재확인.
- DB 연결은 작성한 pg 모듈을 통해 수행하며 Hyperdrive는 DB 자체가 아니다.

Cloudflare 생성 과정:
1. Workers 및 Pages → 애플리케이션 생성 → Continue with GitHub → book 선택.
2. 프로젝트 이름 book-development로 변경.
3. 생성 화면에 브랜치 선택이 없어 처음에는 main의 정적 시안을 별도 이름으로 배포.
4. 초기 명령: npx wrangler deploy --name book-development --assets ./prototype --compatibility-date 2026-10-06
5. 생성 후 설정 → 빌드에서 개발 브랜치 및 개발 config 명령으로 변경.
6. 런타임 변수 등록, GitHub 개발 커밋으로 서버 배포.

주의: 기존 운영 book에도 개발 커밋에 대한 실패 check가 발생했다.
4979753의 Workers Builds: book-development는 success, Workers Builds: book은 failure였다.
실패 원인은 아직 로그로 확정하지 않았다. 운영 Worker의 분기/미리보기 설정을 확인해야 한다.
운영 main에 이 개발 기능이 배포됐다고 보고하지 않는다.

### Supabase
- 조직: Dondog Studio
- 프로젝트: book-development
- 생성 당시 Free, 서울 리전 (ap-northeast-2), Healthy 상태 확인.
- 프로젝트 URL: https://voavlxrwhqggewxaopyl.supabase.co
- API Keys의 Publishable key 사용. 전체 공개 키는 wrangler.development.jsonc에서 확인.
- 비밀번호 및 secret key/service_role key는 이 문서와 Git에 기록하지 않는다.
- 새 머신은 같은 조직/프로젝트 접근 권한이 필요하다.
- 당시 에이전트에 Supabase 계정 도구 연결은 없었다. 사용자가 대시보드 작업을 하고 화면/결과를 전달했다.
- 새 세션에서 Supabase 연결 도구가 생기더라도 먼저 프로젝트·권한·작업 범위를 확인한다.

DB 적용:
1. SQL Editor에서 migrations/001_facilities_and_slots.sql 실행 → 사용자 Success 보고.
2. migrations/002_public_reader.sql 실행 → 사용자 Success 보고.
3. book_reader 비밀번호를 사용자 SQL로 설정.
4. 조회 결과 rolcanlogin:true, can_connect:true 확인.
5. Cloudflare Hyperdrive의 사용자/비밀번호를 맞춰 구성 생성 성공.
- 이 두 마이그레이션은 1회 실행 SQL이다. 기존 DB에 재실행하지 않는다.
- migration runner/history 자동 관리는 아직 없다.
- booking 스키마는 RLS 활성화, book_reader는 공개 시설/자원/슬롯/상세 SELECT만 허용.
- 회원/운영자 및 쓰기 권한은 아직 구현·부여하지 않았다.

인증 설정:
- Authentication → URL Configuration
  - Site URL: https://book-development.nexontest111.workers.dev
  - Redirect URLs: https://book-development.nexontest111.workers.dev/auth
- 이메일 가입·로그인 및 Confirm email 활성화가 필요.
- UI 회원가입 비밀번호 최소 8자 검사. Supabase 비밀번호 정책도 설정을 재확인.
- 기본 메일 발송은 프로젝트 팀 이메일에 제한된다. 일반 회원용 SMTP와 발신 도메인은 미결정.
- 초기 확인은 본인 팀 이메일로 수행했다.
- Auth 설정 변경/새 기기 상태에 따라 재로그인이 필요하다. 이전 브라우저 세션/토큰을 복사하지 않는다.

## 4. 연결 중 발생한 문제와 해결

| 증상 | 확인·대응 |
|---|---|
| 에이전트 GitHub 쓰기 403 | OpenAI GitHub 앱 설치 및 대상 저장소 허용 후 해결 |
| Cloudflare compatibility_date 누락 | 배포 명령에 --compatibility-date 추가, 현재는 config에 지정 |
| Hyperdrive Invalid database credentials | URI 대괄호/비밀번호 입력 확인, 계정 LOGIN/CONNECT 검사, 비밀번호 재설정 후 성공 |
| authenticationConfigured:false | 런타임/빌드 변수 위치 구분, 공개 인증 값을 Wrangler vars에 동기화 후 true |
| 인증 메일 localhost:3000 이동 | Supabase Site URL/Redirect URLs를 개발 주소로 변경 |
| otp_expired | 기존 링크 대신 새 인증 메일을 재발송하고 새 링크 사용 |
| 빌드 캐시 업로드 실패 경고 | 실제 build/deploy success는 별도 확인. lockfile 부재로 캐시 불가였음 |
| 로컬 exec setup refresh 오류 | GitHub 도구로 작업. 새 머신에서는 로컬 도구가 동작하는지 먼저 확인 |

비밀번호의 SQL 작은따옴표는 SQL 문법이고 실제 비밀번호 일부가 아니다.
URI에서는 비밀번호에 특수문자가 있으면 URL 인코딩 또는 수동 필드 입력이 필요하다.
비밀번호 진단 시 값 자체를 채팅/스크린샷으로 요청하지 않는다.

## 5. 실제 구현 범위와 확인 근거

구현:
- Worker API 및 정적 파일 통합, PostgreSQL 공개 시설·날짜별 슬롯 조회.
- GET /api/health, /api/facilities, /api/facilities/{id}/slots?date=YYYY-MM-DD
- GET /api/auth/config (공개용 설정만), /api/me (Bearer 토큰 서버 검증)
- 이메일 가입, 인증 메일 재발송, 로그인/로그아웃 UI: /auth
- 서버 getUser와 email_confirmed_at 검증. JWT 단순 디코딩이나 user_metadata를 권한으로 신뢰하지 않음.
- 골프/야구 상세 분리, UTC 저장/한국 날짜 기준 조회.

확인:
- 사용자 실제 /api/facilities 응답: {"data":[],"limit":100}. DB 조회 성공, 공개 시설 데이터 없음.
- 사용자 health: databaseBindingConfigured:true, authenticationConfigured:true.
- health databaseConnectivity:not_checked는 DB 연결 실패 표시가 아닌 미검사 표시.
- 32.png 화면: /auth에서 “서버에서 로그인을 확인했습니다”, 로그인 완료.
- 4979753 GitHub Workers Builds: book-development success.
- 사용자 로컬 git log: 4979753, 개발 브랜치 HEAD와 origin 일치 (2026-10-08 당시).
- 자동 테스트, 로그아웃/만료/모든 오류 경로의 종합 검증은 수행하지 않음.
- trans/*.png는 이전 머신의 참고 자료다. 새 머신에 있다고 가정하지 않고 키/개인정보가 있어 전체 업로드하지 않는다.

미완성:
- Supabase 인증 회원 → booking.members 등록/연결.
- 실제 시설 운영자 권한, 등록/수정, 슬롯 공개 및 화면 DB 연결.
- 서버 협의/예약/홀드/결제/환불 및 동시 예약 충돌 방지.
- 기존 메인 예약/시설 관리 화면은 localStorage 기반 시안.
- 비밀번호 재설정, 탈퇴, 출시용 약관·개인정보 동의, 일반 회원용 SMTP.
- 예약/요금/시간 변경 및 세부 운영 정책.
- lockfile, migration runner, 운영 배포 정리.

## 6. 합의한 제품 정책과 다음 구현

- PC·모바일 브라우저 반응형 웹. 네이티브 앱은 현재 범위에 없음.
- 골프 팀 예약/개인 조인, 야구장 대관/경기 매칭.
- 시설이 슬롯을 공개하고 경기 참가 양측이 시간·조건을 협의.
- 양측은 경기 참가자/팀이며 시설을 뜻하지 않음.
- 최신 동일 제안에 양측 동의 → 슬롯 임시 점유 → 양측 동일 수수료 납부 → 유효 슬롯과 두 결제 확인 후 확정.
- 초기 결제 대기 30분, 실제 시설 홀드 만료 시간에 종속.
- 만료/미납 시 슬롯 해제, 납부자 전액 환불. 늦은 결제로 만료 예약을 되살리지 않음.
- 수수료 금액/정액·정률/팀·개인 단위/단독 대관 과금, 확정 후 취소·우천·노쇼는 미정.
- 골프는 티타임별 인원/점유, 야구는 구장 시간 범위 기준으로 설계. 코스 라운드 시간의 단순 겹침 금지는 적용하지 않음.
- 현재 UNIQUE 슬롯 제약은 같은 슬롯의 중복만 막으며 실제 겹치는 예약 방지는 다음 작업.

다음 구현 순서:
1. 회원 DB 연결 방식과 최소 프로필.
2. 시설 소유권·운영자 자격을 서버에서 검사.
3. 시설/자원/종목 상세 일치 제약, 실제 슬롯 등록·공개.
4. 기존 화면을 실제 API로 연결.
5. 예약 상태·제안 버전·동의·홀드 및 만료 구현.
6. 수수료·PG·취소 정책 승인 후 결제.
7. 일반 회원 출시 및 운영 main 반영 범위를 별도 확인.

## 7. 작업 원칙과 인수인계 요청문

- 큰 스택/사업 정책은 비교 후 승인받는다.
- 기존 코드와 기능을 임의 삭제/대규모 재작성하지 않는다.
- 단계별 변경과 미완료 기능을 보고한다.
- 테스트·빌드·배포는 요청/승인한 경우만 수행한다. 개발 브랜치 push는 현재 Cloudflare 자동 배포를 발생시키므로 커밋 전 해당 요청 범위를 확인한다.
- 비밀값을 저장소/로그/대화에 넣지 않는다.
- 다른 머신의 로컬 경로, CLI 로그인, 에이전트 GitHub 연결은 새로 확인한다.

새 세션에 전달할 요청문:
> nexontest111-dot/book의 development/server-foundation 브랜치에서 작업을 이어가주세요.
> docs/handoff.md와 docs/worklog.md, 저장소 지침을 먼저 읽고 현황을 확인하세요.
> Supabase·Hyperdrive·이메일 인증 로그인은 개발 사이트에서 확인됐습니다.
> 다음은 회원 DB 연결과 시설 운영자 권한/실제 슬롯 등록입니다.
> 실제 예약·결제는 아직 없습니다. 사업 정책을 임의 확정하지 마세요.
> 로컬 변경을 보존하고 요청 없이 테스트·빌드·배포하지 마세요.
