# 00 고정 계약 (리더 작성, db·api·web 공통 전제)

## DB 함수
`booking.admin_permissions(p_actor uuid, p_issuer text, p_action text, p_data jsonb) RETURNS jsonb`
호출: `SELECT booking.admin_permissions($1::uuid,$2::text,$3::text,$4::jsonb) AS payload`

| action | p_data | 반환 |
| --- | --- | --- |
| list_admins | {} | {"data":[Admin]} |
| grant_admin | {"email"} | {"changed":bool,"admin":Admin} |
| revoke_admin | {"authUserId"} | {"changed":bool} |
| list_operators | {"facilityId": uuid 또는 null} | {"data":[Operator]} (최대 200) |
| grant_operator | {"facilityId","email"} | {"changed":bool,"operator":Operator} |
| revoke_operator | {"facilityId","memberId"} | {"changed":bool} |

Admin = {"authUserId","email","displayName"(없으면 null),"createdAt","isSelf"}
Operator = {"facilityId","facilityName","memberId","authUserId","email","displayName","createdAt"}
시각은 UTC "YYYY-MM-DDTHH:MI:SS.MSZ" 문자열.
grant_admin changed: 새 행 또는 비활성→활성이면 true.

## 오류 (SQLSTATE + 메시지 상수)
| SQLSTATE | 메시지 | API 코드 | HTTP |
| --- | --- | --- | --- |
| 42501 | ADMIN_REQUIRED | ADMIN_REQUIRED | 403 |
| 22023 | INVALID_ACTION / INVALID_ISSUER | DATABASE_UNAVAILABLE(로그) | 503 |
| 22023 | INVALID_EMAIL | INVALID_EMAIL | 400 |
| 22023 | INVALID_ID | INVALID_ID | 400 |
| P0002 | USER_NOT_FOUND | USER_NOT_FOUND | 404 |
| P0002 | FACILITY_NOT_FOUND | FACILITY_NOT_FOUND | 404 |
| P0001 | MEMBER_NOT_REGISTERED | MEMBER_NOT_REGISTERED | 409 |
| P0001 | SELF_REVOKE | SELF_REVOKE | 409 |
| P0001 | LAST_ADMIN | LAST_ADMIN | 409 |
| 42883/42P01/42703/3F000 | - | ADMIN_SETUP_REQUIRED | 503 |
| 그 밖 | - | DATABASE_UNAVAILABLE | 503 |

## HTTP
| 메서드·경로 | 본문 | 성공 |
| --- | --- | --- |
| GET /api/admin/permissions/admins | - | 200 {data:[Admin]} |
| POST /api/admin/permissions/admins | {email} | changed 201 / 아니면 200, {changed, admin} |
| DELETE /api/admin/permissions/admins/{authUserId} | - | 200 {changed} |
| GET /api/admin/permissions/operators?facilityId={uuid} | - | 200 {data:[Operator]} (facilityId 생략 시 전체) |
| POST /api/admin/permissions/operators | {facilityId,email} | changed 201 / 200, {changed, operator} |
| DELETE /api/admin/permissions/operators/{facilityId}/{memberId} | - | 200 {changed} |

공통 오류(추가): UNAUTHORIZED 401, EMAIL_NOT_CONFIRMED 403, AUTH_UNAVAILABLE 503, ORIGIN_NOT_ALLOWED 403, JSON_REQUIRED 415, BODY_TOO_LARGE 413, INVALID_JSON/INVALID_BODY 400, METHOD_NOT_ALLOWED 405, NOT_FOUND 404(알 수 없는 하위 경로), DATABASE_NOT_CONFIGURED 503.
오류 본문 {error:{code}}.
