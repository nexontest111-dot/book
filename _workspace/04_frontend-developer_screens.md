# 04 화면 노트 (frontend-developer)

사용 가능 도구: Read/Grep/Glob/Write/Edit/Bash (SendMessage 없음; 계약 불일치는 보고서로 전달).
변경: prototype/auth.html, auth.js, auth.css. 서버·SQL 미변경, 실행·배포 없음. `node --check auth.js` 통과(브라우저 실행 검증은 하지 않음).

## 호출 API와 사용 필드
- GET /api/me (Bearer): data.email, membership, member.displayName. (member.id 등 나머지는 미사용)
- PUT /api/me/membership (Bearer, JSON {displayName}): 응답 member.displayName, HTTP 상태 201=가입 완료/200=수정. PUT 직전 client.auth.getSession() 으로 최신 토큰 사용.

## 화면 상태 (로그인 후 #member 영역)
| membership | 표시 | 입력 |
| --- | --- | --- |
| not_provisioned | "가입 완료" 단계, 표시 이름 입력, 버튼 "가입 완료" | 활성 |
| active | "회원 정보", 표시 이름 노출(textContent), 수정 폼 버튼 "표시 이름 수정" | 활성, 기존 값 채움 |
| setup_required | "회원 정보 저장 준비 중" 안내 | 비활성 |
| 로그아웃/실패 | #member 숨김, 입력값 초기화 | - |

저장 성공 시 서버 응답 member 로 active 화면 전환(201 "가입이 완료됐습니다." / 200 "표시 이름을 수정했습니다."). 응답에 member 없으면 성공 처리하지 않음.
중복 제출 방지: memberBusy 플래그 + fieldset 비활성. 클라이언트 검증: trim 후 1~80자(서버가 최종 판단). XSS: 표시 이름은 textContent/input.value 로만 출력.

## 오류 문구
| code | 문구 |
| --- | --- |
| UNAUTHORIZED | 로그인이 만료됐습니다. 다시 로그인해주세요. |
| EMAIL_NOT_CONFIRMED | 이메일 인증을 완료해주세요. |
| INVALID_DISPLAY_NAME | 표시 이름은 앞뒤 공백을 뺀 1~80자로, 제어 문자 없이 입력해주세요. |
| JSON_REQUIRED | 요청 형식이 올바르지 않습니다. 새로고침 후 다시 시도해주세요. |
| BODY_TOO_LARGE | 입력이 너무 깁니다. 표시 이름을 줄여주세요. |
| ORIGIN_NOT_ALLOWED | 허용되지 않은 접속 경로입니다. 공식 주소에서 다시 시도해주세요. |
| MEMBER_SETUP_REQUIRED | 회원 정보 저장 준비 중입니다... (화면도 setup_required 로 전환) |
| DATABASE_UNAVAILABLE | 서버 데이터 저장소에 연결하지 못했습니다... |
| AUTH_UNAVAILABLE | 로그인 확인 서비스에 연결하지 못했습니다... |
| 기타/네트워크 | 저장 실패 일반 안내 / 서버 연결 실패 안내 |

GET /api/me 실패 시 기존 문구 유지(EMAIL_NOT_CONFIRMED 별도, 나머지 일반 안내; 이 경로는 코드별 세분화 안 함).

## 남은 데모 영역
예약 화면(index 등)은 localStorage 시안 그대로. auth 화면의 "예약 기능은 아직 개발 중" 문구 유지. operatorAccess 는 화면에서 미사용.

## 1차 QA 수정 반영 (v1.1)
| 항목 | 처리 |
| --- | --- |
| M2 | GET /api/me 200 + membership "unavailable": 로그인 영역 유지, 회원 영역에 "회원 정보를 잠시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." + 입력 비활성 + "다시 시도" 버튼(getSession 후 /api/me 재조회). PUT DATABASE_UNAVAILABLE: 로그인·회원 영역 유지, 오류 문구만 표시, 재제출 가능. |
| L2 | 길이 검사 `[...name].length`(code point) 1~80, 입력 maxlength 는 160 으로 완화(JS 가 검사). |
| L3 | DATABASE_NOT_CONFIGURED 를 MEMBER_SETUP_REQUIRED 와 동일하게 setup_required 로 전환, 문구 동일. |
| L7 | GET/PUT /api/me* 요청 시간 제한 25초(API_TIMEOUT). |
| L8 | PUT 시작 시 revision 저장, 응답 시 달라졌으면 무시. 성공 시 revision 증가로 늦게 끝난 GET 무효화. 같은 사용자의 세션 갱신(onAuthStateChange)은 무시해 입력값·회원 상태 유지. 사용자 변경·로그아웃에서만 초기화. |
검증: node --check 통과, 브라우저 실행 검증 없음.

## 2차 QA 수정 반영 (v1.2)
| 항목 | 처리 |
| --- | --- |
| N1 | PUT 시작 시 getSession 의 사용자 ID 저장. 응답 때 currentUserId 가 같고 로그인 영역이 보일 때만 반영, 다르거나 로그아웃이면 무시. 성공 후 revision++ 로 늦은 GET 무효화 유지. |
| N2 | 같은 사용자 세션 갱신 후 GET /api/me 실패(HTTP 오류·예외)면 회원 영역을 unavailable 상태(입력 비활성, 안내 문구, 다시 시도 버튼)로 전환. |
| N3 | 같은 사용자 세션 갱신 시 membership 이 같고 active 의 서버 displayName 이 이전 값(lastServerName)과 같으면 renderMember 를 호출하지 않아 입력 중인 값 유지. |
검증: node --check 통과, 브라우저 실행 검증 없음.
