---
name: booking-orchestrator
description: "플레이약속 예약 서비스 기능 개발 팀(db-architect, api-developer, frontend-developer, qa-inspector, doc-keeper)을 조율한다. 회원 등록, 시설 운영자 권한, 슬롯 등록·수정, 협의·제안·동의, 홀드, 수수료·결제·만료·환불, 화면 API 연결 같은 기능 구현 요청에 사용한다. '다음 단계 구현', '기능 추가', 'API 만들어줘', '화면 연결', 'QA 다시', '이전 결과 수정·보완', '이 부분만 다시', '재실행' 같은 후속 요청에도 사용한다. 단순 질문이나 한 줄 수정에는 쓰지 않고 직접 처리한다."
---

# 플레이약속 기능 개발 오케스트레이터

## 실행 모드: 혼합
| 단계 | 실행 모드 | 이유 |
| --- | --- | --- |
| 1 계획 | 메인 직접 | 사용자와 범위·미정 정책을 확인해야 한다 |
| 2 구현 | 지속형 에이전트 협업 | DB↔API↔화면 계약을 주고받으며 고치고, QA 피드백 반영을 반복한다 |
| 3 최종 검증 | 지속형(qa-inspector 재사용) | 앞 단계 맥락을 기억한 채 전체 재검증 |
| 4 기록 | 서브에이전트 위임 | 결과만 받으면 된다 |

명시적 팀 객체는 만들지 않는다. `Agent`에 `name`을 붙여 실행하면 같은 협업 그룹이 되고 `SendMessage`로 다시 부른다.

## 에이전트 구성
| 이름 | `subagent_type` | 스킬 | 산출물 |
| --- | --- | --- | --- |
| db | db-architect | supabase-migration, booking-domain-rules | `migrations/NNN_*.sql`, `_workspace/02_db-architect_schema-notes.md` |
| api | api-developer | worker-api, booking-domain-rules | `server/**`, `_workspace/03_api-developer_contract.md` |
| web | frontend-developer | frontend-integration, booking-domain-rules | `prototype/**`, `_workspace/04_frontend-developer_screens.md` |
| qa | qa-inspector | qa-boundary-check, booking-domain-rules | 검증 보고 → `_workspace/05_qa-inspector_report.md` |
| (위임) | doc-keeper | worklog-recording | `docs/*.md` 갱신 |

작업에 필요한 계층만 실행한다. 화면만 바꾸면 db·api는 띄우지 않는다. qa는 코드가 바뀌는 작업이면 항상 포함한다.

## 0단계: 기존 작업 확인
1. 작업 디렉터리는 저장소 루트(`book/`). `git -c safe.directory='*' status`, 현재 브랜치 확인. `main`이면 작업 전에 사용자에게 개발 브랜치를 확인받는다(운영 main은 시안 유지 정책).
2. `_workspace/` 확인:
   - 없음 → 처음부터.
   - 있고 일부 수정 요청 → 해당 에이전트만 실행하고 프롬프트에 이전 산출물 경로를 넣는다.
   - 있고 새 기능 요청 → `_workspace/`를 `_workspace_YYYYMMDD-HHMM/`으로 옮기고 새로 시작.
3. `docs/worklog.md` 마지막 섹션의 "다음 시작점"과 "남은 작업"을 읽는다.

## 1단계: 계획 (메인)
1. 요청을 계층별 작업으로 나눈다(SQL / API / 화면).
2. `booking-domain-rules`의 미정 정책에 걸리는지 확인. 걸리면 구현 전에 사용자에게 선택지와 추천을 물어본다.
3. `_workspace/01_plan.md` 작성: 목표, 범위 밖, 계층별 작업, 완료 조건, 필요한 사용자 실행(SQL 적용 등).
4. 계획을 사용자에게 짧게 보여 주고 진행한다. 범위가 큰 변경(새 테이블 3개 이상, 결제 경로)은 확인받는다.

## 2단계: 구현 (지속형 협업)
1. 필요한 에이전트를 한 메시지에서 병렬 실행한다. 프롬프트에 역할, `_workspace/01_plan.md` 경로, 산출물 경로, 협업 상대 이름을 넣는다.
   - `Agent(name: "db", subagent_type: "db-architect", prompt: ...)`
   - `Agent(name: "api", subagent_type: "api-developer", prompt: "... db의 스키마 노트가 나오면 그 전제로 구현 ...")`
   - `Agent(name: "web", subagent_type: "frontend-developer", prompt: "... api 계약이 나오면 연결 ...")`
   - `Agent(name: "qa", subagent_type: "qa-inspector", prompt: "... 각 산출물 알림을 받을 때마다 해당 모듈 검증 ...")`
2. 데이터 흐름: db 노트 → api 계약 → web 화면 노트. 각 에이전트는 산출물을 쓰면 다음 담당자와 qa에게 SendMessage로 경로를 알린다.
3. 작업 추적: `TaskCreate`/`TaskUpdate`가 있으면 쓰고, 없으면 `_workspace/tasks.md`에 체크리스트로 관리한다.
4. qa 결함 → 담당자 수정 → qa 재검증. 같은 결함 수정 왕복은 최대 3회. 넘으면 리더가 원인을 보고 사용자에게 알린다.
5. 리더는 결함을 직접 고치지 않는다. 담당 에이전트에게 SendMessage로 돌려보낸다.

## 3단계: 동결과 최종 검증
1. 모든 구현 에이전트 완료 보고 확인.
2. 동결 통지: "산출물을 동결한다. 이후 수정은 `_v2` 파일로 쓰고 리더에게 알려라."
3. `find migrations server prototype -type f | xargs sha256sum _workspace/0[2-4]_* > _workspace/freeze_build.sha`
4. qa에게 전체 재검증 지시 → 보고를 `_workspace/05_qa-inspector_report.md`에 저장. 리더도 정적 검사를 직접 한 번 실행한다:
   `node .claude/skills/qa-boundary-check/scripts/static-check.mjs .`
5. 높음 결함이 남으면 2단계로 돌아간다. 마감 직전 `sha256sum -c _workspace/freeze_build.sha`로 변경 여부 확인.

## 4단계: 기록과 보고
1. `Agent(subagent_type: "doc-keeper")`에 변경 파일 목록, `_workspace/` 노트 경로, 사용자 확인 근거(없으면 "없음")를 넘긴다.
2. 사용자에게 보고: 변경 파일, 구현된 동작, 사용자가 직접 실행해야 할 것(SQL 적용 순서, 배포 명령), 미실행 검증, 남은 결함·미정 정책.
3. 커밋·푸시·배포·SQL 실행은 사용자가 요청할 때만 한다. 커밋 메시지는 기존 관례(`feat:`, `fix:`, `docs:`, `chore:` + 영어 요약)를 따른다.

## 데이터 전달
- 파일: `_workspace/{단계번호}_{에이전트}_{산출물}.md` (`_workspace/`는 `.gitignore`에 포함)
- 메시지: 경로 알림과 결함 전달만 SendMessage로. 큰 내용은 파일로.
- 최종 산출물: 저장소의 `migrations/`, `server/`, `prototype/`, `docs/`.

## 오류 처리
| 상황 | 대응 |
| --- | --- |
| 에이전트 무응답 | SendMessage로 상태 확인 후 재지시. 그래도 실패하면 같은 유형을 새 이름으로 실행하고 이전 산출물 경로를 넘긴다. |
| 사용량 한도·인증 만료·권한 거부 | 재시도하지 않는다. 부분 산출물을 직접 열어 진행 범위를 확인하고 `_workspace/blocked.md`에 기록한 뒤 사용자에게 보고(한도면 해제 시각 포함). |
| 미정 정책에 막힘 | 구현을 멈추고 사용자에게 선택지와 추천을 묻는다. 임의 값으로 채우지 않는다. |
| DB 적용 필요 | SQL은 작성만 하고 사용자 실행 절차를 안내. 적용 전에는 해당 API를 "DB 적용 대기"로 보고. |
| 계층 간 충돌 | 지우지 말고 양쪽 근거를 `_workspace/conflicts.md`에 적고 담당자끼리 합의시키거나 사용자에게 묻는다. |
| 멈춘 에이전트의 빈 곳 | 리더가 직접 확인한 사실만 채운다. 에이전트의 판단을 추측해 쓰지 않는다. |

## 테스트 시나리오
### 정상 흐름: "인증 회원을 booking.members에 등록하는 기능 만들어줘"
1. 0단계: `_workspace/` 없음, 브랜치 `development/server-foundation` 확인.
2. 1단계: 표시 이름 입력·약관 동의 미정 여부 확인 → 계획 작성.
3. 2단계: db가 쓰기 역할·정책 마이그레이션 003 작성 → api가 `POST /api/me/membership`·`GET /api/me` 갱신 및 계약 작성 → web이 auth 화면에 가입 완료 단계 연결 → qa가 각 단계 검증, 결함 1건 왕복.
4. 3단계: 동결, 정적 검사 통과, qa 최종 보고.
5. 4단계: doc-keeper가 worklog 기록. 보고에 "003 SQL 사용자 적용 필요", "실행 검증 미실행" 명시.

### 오류 흐름: 결제 기능 요청
1. "양측 결제 붙여줘" → 1단계에서 PG·수수료 금액 미정 확인.
2. 에이전트를 띄우지 않고 사용자에게 PG 후보와 결정 항목을 묻는다.
3. 사용자가 일부만 정하면 정해진 범위(청구 테이블·상태 전이)만 계획에 넣고 실결제 경로는 범위 밖으로 기록.

### 오류 흐름: api 에이전트 사용량 한도로 중단
1. api가 계약 파일 절반만 작성한 채 중단.
2. 재시도하지 않고 파일을 열어 작성된 엔드포인트를 확인, `_workspace/blocked.md`에 남은 엔드포인트 기록, 사용자에게 해제 시각과 함께 보고.
