# CGV 용산아이파크몰 IMAX 오픈 감지기

GitHub Actions + Playwright로 CGV 페이지를 주기적으로 확인하고,
새 IMAX 예매일 후보가 감지되면 GitHub Issue를 생성하는 기본 골격입니다.

## 현재 단계

- [x] GitHub Actions 5분 주기 실행
- [x] Playwright Chromium 실행
- [x] 용산아이파크몰 + IMAX 키워드 확인
- [x] 날짜 후보 추출
- [x] 이전 감지 날짜와 비교
- [x] 신규 날짜 발견 시 GitHub Issue 생성
- [ ] CGV 실제 예매 DOM에 맞춘 정밀 selector
- [ ] 카카오 로그인 세션 처리
- [x] 인원수/시간대/좌석 선호도 엔진
- [ ] CGV 실제 DOM과 선호도 엔진 연결
- [ ] 결제 직전/자동 결제 정책 결정
- [ ] Telegram/Discord/카카오 알림 연동

## 설치

```bash
npm install
npx playwright install chromium
npm run check
```

## GitHub 설정

1. 새 **Private Repository**를 만듭니다.
2. 이 폴더의 파일 전체를 push합니다.
3. GitHub > Settings > Actions > General에서 workflow 권한을 확인합니다.
4. `Settings > Secrets and variables > Actions > Variables`에 아래 값을 추가할 수 있습니다.

- `CGV_BOOKING_URL`: 실제 CGV 예매 화면 URL

기본값은 `https://cgv.co.kr/`이며, 이는 골격 확인용입니다.

## 자동예매 선호 설정

`config.example.json`의 `bookingPreferences`에서 아래 규칙을 설정합니다.

- `partySize`: 1~4명. 4명을 초과하면 실행 전에 오류 처리합니다.
- 토/일: 시작 시간이 **23시대인 상영은 제외**, 나머지 시간은 후보로 둡니다.
- 평일: **20:00 이상, 23:00 미만**을 최우선 시간대로 점수화합니다. 해당 시간대가 없으면 다른 시간도 낮은 우선순위 후보로 남깁니다.
- 좌석: **K열 최우선**, 같은 K열에서는 선택 인원 전원이 붙어 앉을 수 있는 연속 좌석 중 **상영관 좌우 중앙에 가장 가까운 블록**을 선택합니다.
- K열에 연속 좌석이 없으면 기본 fallback은 `J → L → I → M` 순입니다. 필요하면 설정에서 바꿀 수 있습니다.

예시:

```json
"bookingPreferences": {
  "partySize": 2,
  "time": {
    "weekend": { "excludeStartHours": [23] },
    "weekday": {
      "preferredStartFrom": "20:00",
      "preferredStartBefore": "23:00"
    }
  },
  "seat": {
    "preferredRows": ["K"],
    "fallbackRows": ["J", "L", "I", "M"],
    "preferContiguous": true,
    "preferCenter": true
  }
}
```

`src/preference-engine.js`가 시간대와 좌석 후보의 순위를 계산하고, `src/booking-planner.placeholder.js`가 최종 상영회차 + 연속 좌석 블록을 고르는 구조입니다. 실제 예매 클릭은 아직 연결하지 않았습니다.

## 로그인/자동예매 확장 시 보안 원칙

비밀번호, 카카오 토큰, 세션 쿠키는 절대로 소스 코드에 저장하지 않습니다.
GitHub Actions Secrets 또는 별도 보안 저장소를 사용합니다.

예정 Secret 예시:

- `KAKAO_LOGIN_ID`
- `KAKAO_LOGIN_PASSWORD`
- `CGV_STORAGE_STATE_B64`

단, OAuth/카카오 로그인에서 CAPTCHA, 기기 인증, 추가 인증이 발생할 경우
이를 우회하는 코드는 넣지 않고 실행을 중단하도록 설계합니다.

## 자동예매 구조(다음 단계)

```text
scheduler
   |
   v
CGV open-date detector
   |
   +-- no change --> exit
   |
   +-- new date
         |
         v
      notifier
         |
         v
   authenticated browser
         |
         v
   movie/date/time filter
         |
         v
      seat picker
         |
         v
   booking checkpoint
```

GitHub-hosted runner는 매 실행마다 새 환경이어서 로그인 세션 유지에 불리합니다.
자동예매까지 안정적으로 구현하려면 추후 VPS 또는 self-hosted runner가 더 적합할 수 있습니다.
