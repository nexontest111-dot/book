---
name: supabase-migration
description: "플레이약속 Supabase PostgreSQL 마이그레이션 작성법. booking 스키마에 테이블·제약·인덱스·RLS·역할 권한을 추가하거나 바꾸는 SQL을 만들 때 사용한다. 예약 경합 방지 제약(배타 제약, 수량 검사)과 사용자 실행 절차 기록 포함. API 코드 작성만 하는 경우에는 worker-api 스킬을 쓴다."
---

# Supabase 마이그레이션 작성

## 파일 규칙
- `migrations/NNN_snake_case.sql`, 번호는 기존 최대값 + 1. 이미 적용된 파일(001, 002 …)은 고치지 않는다. 사용자가 SQL Editor에서 이미 실행했기 때문에 파일을 고치면 실제 DB와 기록이 어긋난다.
- 첫 줄 주석에 적용 대상(개발 DB)과 선행 마이그레이션을 적는다.
- 전체를 `BEGIN; … COMMIT;`으로 감싼다.
- 마이그레이션 실행기는 아직 없다(001 주석 참조). 실행기를 도입하자는 제안은 별도 작업으로 리더에게 올린다.

## 스키마 관례 (001을 따른다)
- 모든 객체는 `booking` 스키마. PK는 `uuid DEFAULT gen_random_uuid()`.
- 시간은 `timestamptz`, 금액은 `integer` 원 단위 + `CHECK (>= 0)` + `_krw` 접미사.
- 문자열 길이·열거값은 `CHECK`로 제한. 참조는 `ON DELETE RESTRICT` 기본.
- 새 테이블은 즉시 `ENABLE ROW LEVEL SECURITY`. 브라우저용 권한·허용 정책은 만들지 않는다. Supabase Data API 노출을 막기 위해서다.
- 서버 접근 역할은 최소 권한. 읽기는 `book_reader`, 쓰기가 필요하면 별도 역할(예: `book_writer`)을 만들고 필요한 테이블·명령만 GRANT 한다. 역할 비밀번호는 SQL에 쓰지 않고 대시보드에서 사용자가 설정한다.

## 예약 경합 방지
- 야구 시간 겹침: `btree_gist` 확장 + `EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (active)`. Supabase에서 확장 사용 가능 여부를 노트에 적고 사용자 확인을 요청한다.
- 골프 수량: 점유 행에 `quantity`를 두고, 점유 생성은 자원(또는 슬롯) 행을 `SELECT … FOR UPDATE`로 잠근 뒤 합계를 검사하는 방식을 API에 전달한다. 트리거로 강제할지 여부는 노트에 장단점과 함께 적는다.
- 멱등 키: `(scope, idempotency_key)` UNIQUE.
- 당사자별 청구 1건: `UNIQUE (booking_attempt_id, party_id)`. PG 거래 식별자 `UNIQUE`.

## 산출 노트 (`_workspace/02_db-architect_schema-notes.md`)
1. 추가·변경 객체 목록과 이유
2. API가 지켜야 할 전제(잠금 순서, 사용할 역할, 트랜잭션 경계)
3. 사용자 실행 절차: 어느 DB, 어떤 파일 순서, 예상 결과("Success. No rows returned." 등)
4. 롤백 SQL 또는 롤백 불가 사유
5. 미정 정책 때문에 비워 둔 부분

## 자체 점검
- 새 테이블 모두 RLS 활성?
- `PUBLIC` 권한 노출 없음?
- 이름 충돌(제약·인덱스) 없음?
- 001·002가 이미 적용된 상태에서 단독 실행 가능한가?
