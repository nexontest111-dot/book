# Cloudflare 호스팅 검토

검토일: 2026-10-08. 공식 문서를 확인한 제안이며, 실제 배포와 유료 플랜 가입은 진행하지 않았다.

## 의견

현재 시안을 공유하는 용도로 Cloudflare를 추천한다. 지금 파일은 정적 HTML·CSS·JavaScript이므로 Cloudflare Pages에서 별도 서버 없이 제공할 수 있다. GitHub 저장소 연동으로 이후 변경을 자동 배포할 수 있다. [정적 HTML 배포](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/), [Git 연동](https://developers.cloudflare.com/pages/get-started/git-integration/).

예약·결제 서비스도 Cloudflare에서 운영 가능하다. 실제 운영에는 Workers API와 영속 데이터베이스를 추가해야 한다. Workers는 정적 자산과 서버 코드를 함께 제공할 수 있다. [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).

추천 순서는 현재 시안을 Pages로 공유하고, 기술 스택을 결정한 뒤 실서비스 API·DB를 구현하는 것이다. 처음부터 Workers Static Assets로 시작하는 것도 가능하지만, 현재 시안은 Pages의 Git 연동 설정만으로 공유할 수 있다. 기존 화면 시안은 프레임워크 선택을 강제하지 않는다.

## 단계별 구성 제안

| 단계 | 구성 | 역할 |
| --- | --- | --- |
| 현재 시안 | Pages + GitHub | 정적 화면과 데모 상호작용 공유 |
| 실서비스 웹·API | Workers Static Assets + Workers API | 반응형 웹, 권한 검증, 협의·예약·결제 요청 |
| 예약·결제 데이터 | 관리형 PostgreSQL + Hyperdrive 우선 검토 | 예약 충돌 제약, 양측 청구, 결제·환불 이력 |
| Cloudflare 내 DB 대안 | D1 | 소규모 MVP에서 조건부 갱신·제약·배치 처리 기반 구현 |
| 만료·환불·알림 | Cron 또는 Durable Objects Alarms, 작업 재시도 | 브라우저가 닫혀도 서버에서 만료·환불 후속 처리 |

PostgreSQL은 관리형 DB 서비스가 별도로 필요하다. Hyperdrive는 기존 PostgreSQL 연결을 지원하며 DB 자체를 생성·운영하는 상품은 아니다. 예약 도메인의 복잡한 자원·수량·시간 충돌과 향후 운영 조회를 고려한 설계 의견으로 PostgreSQL을 우선 검토한다. [PostgreSQL 연결](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/).

D1도 사용 가능하다. 배치 SQL은 실패 시 전체 시퀀스를 되돌리는 트랜잭션 동작을 제공하므로 예약·청구를 함께 처리하는 설계를 검토할 수 있다. 다만 실제 충돌 방지는 조건부 갱신·DB 제약으로 직접 구현해야 한다. D1 단일 DB 크기는 유료 10GB, 무료 500MB이며 DB별 쿼리는 한 번에 하나씩 처리된다. [D1 배치 API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 제한](https://developers.cloudflare.com/d1/platform/limits/).

## 비용 판단

- Workers의 정적 자산 요청은 무료이며 요청 수 제한이 없다. API·SSR처럼 Worker 실행을 거치는 요청은 별도 사용량에 해당한다. [정적 자산 요금](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
- Workers Paid는 계정 기준 월 최소 5달러다. 포함량 초과는 추가 과금되며 이 금액이 전체 서비스 비용을 뜻하지 않는다. [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/).
- DB, 파일 저장, 문자·알림, PG 결제, 도메인 비용은 선택한 서비스와 사용량을 반영해 별도로 산정한다. 사용자·슬롯·메시지·결제 규모가 미정이라 현재 월 총액은 확정하지 않는다.

## 현재 GitHub 저장소의 Pages 배포 설정

Cloudflare 대시보드의 Workers & Pages에서 Pages의 Git 연동 프로젝트를 생성하고 아래 값을 사용한다. 실제 배포 시 UI 명칭은 달라질 수 있다.

| 항목 | 값 |
| --- | --- |
| GitHub 저장소 | nexontest111-dot/book |
| Production branch | main |
| Framework preset | None |
| Root directory | 저장소 루트 / 비워두기 |
| Build command | exit 0 |
| Build output directory | prototype |

`prototype/index.html`을 진입점으로 제공한다. 문서·원본 전체가 아니라 시안 폴더를 배포 대상으로 지정한다. 이 설정은 빌드가 필요 없는 정적 HTML 배포 안내를 현재 폴더 구조에 적용한 것이다. 최초 배포 후 실제 반환된 pages.dev 주소를 확인한다. 주소를 사전에 확정하지 않는다. [설정 근거](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

공개한 화면에서도 현재 저장은 방문자 각자의 브라우저에만 남는다. 예약·채팅·시설 변경은 다른 방문자에게 전달되지 않는다. 양측 결제 버튼은 실제 참가자 계정의 결제가 아니라 데모 조작이다.

## 실서비스에서 필요한 서버 처리

1. 계정별 권한을 서버에서 확인한다. 시설 운영자는 담당 시설의 슬롯만 변경한다.
2. 최신 조건 양측 동의 후 DB에서 자원을 원자적으로 확보하고, 청구 두 건과 공통 종료시간을 기록한다.
3. 서버가 PG 거래 금액·청구 대상·결과를 확인한다. 양측 납부와 유효 점유가 확인된 예약만 확정한다.
4. 만료시간은 DB와 서버를 기준으로 판단한다. 주기 작업의 실행이 늦어져도 확정 API는 이미 만료된 예약을 거절한다.
5. 만료·늦은 결제·시설 확정 실패 시 환불 작업을 생성하고 실패를 재처리한다. Cron 또는 Alarms는 후속 처리 수단으로 사용한다. [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Durable Objects Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).
6. 시설 설명·사진과 개인 예약·슬롯 최종 가용성의 캐시 정책을 구분한다. Hyperdrive를 쓰면 예약 판단에 사용하는 조회가 오래된 캐시를 사용하지 않도록 구성한다. [Hyperdrive 쿼리 캐시](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).

## 다음 선택

현재 시안 공유에는 Pages를 추천한다. 실서비스는 Workers + 관리형 PostgreSQL을 우선 비교하되 D1 단독 구성과 운영 비용·개발 복잡도를 비교한 뒤 결정한다. 프레임워크·PG·DB 제공자는 아직 선택하지 않았다. 실제 배포를 진행하려면 Cloudflare 계정에서 해당 GitHub 저장소 연결과 프로젝트 생성이 필요하다.
