# 서버 구현 계획

## 현재 상태
- 운영 주소: https://book.nexontest111.workers.dev
- 운영 main은 브라우저 저장 방식의 시안이다. 로그인, 공유 DB, 실제 예약, 실제 결제는 없다.
- development/server-foundation 브랜치에 Worker 진입점과 별도 개발 설정을 준비했다.
- PostgreSQL 연결 및 공개 시설·슬롯 조회 API를 작성했다. 실제 DB 연결은 미완료다. 자세한 현황은 postgresql-setup.md 참조.
- 화면은 기존 시안 그대로이며 이 API와 아직 연결되지 않는다.
- 테스트·빌드·배포는 실행하지 않았다. 실제 실행 결과는 아직 확인되지 않았다.

## 결정할 서버 구성
| 항목 | Workers + 관리형 PostgreSQL | Workers + D1 |
|---|---|---|
| 구성 | 외부 DB와 필요 시 Hyperdrive 연결 | Cloudflare DB 바인딩 |
| 예약 충돌 방지 | 트랜잭션, 행 잠금, 시간 범위 배타 제약 활용 가능 | 고정 슬롯 제약과 조건부 SQL, batch 트랜잭션 중심 설계 |
| 가변 시간 예약 | 시간 범위 겹침 제약 설계에 적합 | 시간 범위를 고정 슬롯으로 분할하는 등의 별도 설계 필요 |
| 로그인 | 인증 제공자 선택 필요 | 인증 제공자 선택 필요 |
| 운영 부담 | 별도 계정, 과금, 백업 정책 확인 | Cloudflare 내 관리, DB 용량·처리 제한 확인 |
| 제안 | 시간 협의와 두 당사자 결제를 고려해 우선 추천 | 고정 슬롯 위주로 MVP를 제한한다면 후보 |

Workers + 관리형 PostgreSQL은 사용자 승인으로 채택했다. DB 공급자와 인증 제공자는 미정이며 공급자 및 비용을 비교한 뒤 승인받는다. Hyperdrive는 DB 자체가 아닌 외부 DB 연결 서비스다.

공식 근거:
- Worker 정적 자산 라우팅: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- D1 batch 트랜잭션: https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 제한: https://developers.cloudflare.com/d1/platform/limits/
- PostgreSQL 연결: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- PostgreSQL 배타 제약: https://www.postgresql.org/docs/current/ddl-constraints.html

## 순차 구현과 완료 조건
1. DB·인증 선택: 공급자, 개발/운영 분리, 비용과 비밀값 관리 확정.
2. 회원·권한: 인증 서버 검증, 회원/시설 운영자/관리자 권한, 시설 소유권 검사.
3. 시설·슬롯: 운영자가 자기 시설만 수정하고 공개 슬롯을 모두 같은 DB에서 조회.
4. 협의: 제안 버전 저장, 수정 시 양측 동의 초기화, 서버에서 최신 버전에만 동의 허용.
5. 홀드: 동의 완료 시 서버 트랜잭션으로 시간 충돌 검사 및 만료시각 저장.
6. 결제: PG 선택 후 양측 동일 수수료 청구. 검증된 결제 결과만 반영.
7. 확정·만료: 양측 납부 및 유효한 홀드 확인 후 확정. 만료 시 해제 및 납부자 환불 처리.

1~3은 DB 선택 후 착수할 첫 구현 범위다. 테스트·빌드·배포는 사용자 요청 또는 승인 후 수행한다.

## 변경 예상 파일과 선행 조건
| 작업 | 파일 | 선행 조건 |
|---|---|---|
| Worker 진입점 | server/worker.js | 기본 구조 추가 완료 |
| 개발 환경 | wrangler.development.jsonc | 개발용 설정 추가 완료 |
| DB 저장소 | server/repositories/*, migrations/* | DB 선택 |
| 인증·권한 | server/auth/* | 인증 제공자 선택 |
| 시설 API | server/routes/facilities.*, server/routes/slots.* | DB·권한 |
| 화면 연결 | prototype/app.js | 시설 API |
| 예약·결제 | server/routes/bookings.*, server/payments/* | 정책·PG 확정 |

## 예약 보호 규칙
- 시간은 DB에 UTC로 저장하고 화면에서 Asia/Seoul 기준으로 표시.
- 동의는 proposal_id와 version에 연결. 요청자가 속한 당사자만 동의·결제 가능.
- 이용자별 동일 수수료의 단위와 금액은 미정. 시안의 3,000원은 예시.
- 예약 상태와 결제 상태는 별도 저장. 결제 확인 요청과 PG 이벤트에는 중복 처리 방지 키 적용.
- 만료된 홀드는 늦은 결제로 되살리지 않는다. 환불 실패는 재시도할 운영 작업으로 기록.
- 자격 증명은 저장소·화면에 넣지 않는다. 인증되지 않은 예약·결제 쓰기는 허용하지 않는다.
- 골프 코스/티타임/인원/옵션, 야구 구장/시간 범위/조명은 별도 규칙 유지.
- 확정 후 취소, 우천, 노쇼, 단독 대관 수수료는 정책 미정으로 실제 청구 구현을 보류.

## 개발 설정 사용
승인 후 실행할 명령:
```
npx wrangler dev --config wrangler.development.jsonc
```
배포 승인이 있다면:
```
npx wrangler deploy --config wrangler.development.jsonc
```
이 설정의 Worker 이름은 book-development다. 기존 book Worker의 배포 명령은 변경하지 않았다.
