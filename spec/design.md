# Bside — 디자인 토큰

방향: **나이트.** UI는 무채색, 색은 상태에서만 나온다.
근거: 네트워킹 행사는 조명이 낮다. 밝은 화면은 눈부시고 대화 자리에서 무례해 보인다.

---

## 1. 폰트

**Wanted Sans** — 원티드랩이 만든 오픈소스. Pretendard보다 기하학적이고 다크 배경에서 또렷하다.

```css
@import url('https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.4/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css');
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css');

:root {
  --font: 'Wanted Sans Variable', 'Wanted Sans', 'Pretendard Variable', -apple-system, system-ui, sans-serif;
}
```

**Pretendard를 폴백으로 같이 받는다.** 행사장 네트워크에서 하나가 실패해도 시스템 폰트로 떨어지지 않는다.

Inter와 Geist는 쓰지 않는다. 조사에서 AI 티로 명시적으로 지목됐다.

**굵기는 셋만 쓴다.** 400 본문 / 500 강조 / 600 제목. 700 이상은 쓰지 않는다.

---

## 2. 아이콘

**Lucide React** — `npm i lucide-react`

컴포넌트로 임포트하면 트리쉐이킹된다. 굵기는 `strokeWidth={1.75}`로 통일.

```jsx
import { Search, MessageCircle, Hand, Circle, Bluetooth, Send } from 'lucide-react';
<Search size={18} strokeWidth={1.75} />
```

크기는 셋만. **18px 인라인 / 20px 버튼 / 24px 헤더.**

---

## 3. 색

```css
:root {
  /* 배경 층위 — 다크에서는 그림자 대신 밝기로 층을 만든다 */
  --bg:            #16161A;   /* 화면 바닥. 순검정 #000은 AI 티가 난다 */
  --surface:       #202027;   /* 카드 */
  --surface-hi:    #2A2A33;   /* 입력창, 눌린 상태 */

  --border:        #32323C;
  --border-strong: #43434F;

  --text:          #F5F5F7;
  --text-dim:      #8E8E9A;   /* 보조 설명 */
  --text-faint:    #5C5C68;   /* 만료 임박, 비활성 */

  /* 상태 — 화면에 보이는 유일한 색 */
  --looking:       #F5B942;   /* 이런 분 찾아요 */
  --sharing:       #4ADE80;   /* 이런 얘기 할 수 있어요 */
  --first:         #A78BFA;   /* 처음 왔어요 */
  --open:          #60A5FA;   /* 대화 가능 */

  --danger:        #F87171;
  --on-color:      #16161A;   /* 상태색 위에 올리는 텍스트 */
}
```

### 상태색 사용 규칙

| 용도 | 방법 |
|---|---|
| 점·아이콘 | 색 그대로 |
| 칩 배경 | `rgba(색, 0.12)` + 글자는 색 그대로 |
| 강조 뱃지 | 배경은 색 그대로 + 글자는 `--on-color` |
| 선택된 카드 테두리 | `1px solid 색` |

**상태색을 브랜드색으로 쓰지 않는다.** 버튼과 링크는 무채색 또는 흰색이다.
색이 의미를 잃으면 상태 표시가 안 읽힌다.

### 상태 4종 매핑

| 코드 | 라벨 | 색 | 아이콘 |
|---|---|---|---|
| `LOOKING_FOR` | 이런 분 찾아요 | `--looking` | `Search` |
| `CAN_SHARE` | 이런 얘기 할 수 있어요 | `--sharing` | `MessageCircle` |
| `FIRST_TIME` | 처음 왔어요 | `--first` | `Hand` |
| `OPEN` | 대화 가능 | `--open` | `Circle` |

---

## 4. 타이포 스케일

한글은 영문보다 행간이 좁아도 읽힌다. 모바일 카드에서 1.7은 너무 성기다.

**크기는 네 종류만.** 12종씩 쓰는 게 AI 티가 나는 대표 신호다.

| 용도 | 크기 / 굵기 | 행간 |
|---|---|---|
| 숫자 강조 · 화면 제목 | 24 / 600 | 1.25 |
| 섹션 제목 · 상대 이름 | 17 / 500 | 1.4 |
| 본문 · 상태 한 줄 | 14 / 400 | 1.5 |
| 보조 · 캡션 | 12 / 400 | 1.4 |

**자간은 한글에 `-0.01em`.**

**텍스트 위계는 세 단계로 강제한다.** 이것만으로 화면이 다 똑같아 보이는 문제의 대부분이 사라진다.
`--text` 100% / `--text-dim` 60% / `--text-faint` 30%. 한 화면에서 네 번째 밝기를 만들지 않는다.

---

## 5. 간격과 모양

**간격은 4의 배수만.** 4 · 8 · 12 · 16 · 20 · 24 · 32

| 요소 | 값 |
|---|---|
| 카드 라운딩 | 14px |
| 버튼·입력 라운딩 | 12px |
| 칩 라운딩 | 20px (pill) |
| 카드 안쪽 여백 | 12~14px |
| 화면 좌우 여백 | 16px |
| 카드 사이 간격 | 8px |

**그림자는 시트에만.** 다크에서 그림자는 잘 안 보인다. 층위는 배경 밝기 차이로 만든다.
하단 시트만 `box-shadow: 0 -8px 32px rgba(0,0,0,0.5)`.

---

## 6. 모션

| 상황 | 값 |
|---|---|
| 기본 전환 | `150ms ease-out` |
| 하단 시트 | `240ms cubic-bezier(0.32, 0.72, 0, 1)` |
| 접점 카드 등장 | 페이드 + `scale(0.96 → 1)`, 200ms |
| 상태 만료 임박 | 밝기를 서서히 낮춘다. 깜빡이지 않는다 |

**과한 모션은 넣지 않는다.** 30초 안에 끝나야 하는 앱이다.

---

## 7. 터치와 접근성

- 터치 타겟 **최소 44×44px**
- 상태를 **색으로만 구분하지 않는다.** 항상 아이콘과 라벨을 함께 둔다
- 본문 대비는 배경 대비 4.5:1 이상. `--text-dim`도 `--surface` 위에서 통과한다
- `--text-faint`는 **장식과 비활성에만.** 읽어야 할 내용에 쓰지 않는다

---

## 8. 워드마크

**Bside** — 한 단어, 첫 글자만 대문자. Wanted Sans 600.
로고를 따로 만들지 않는다. 시간이 없고, 워드마크로 충분하다.

부제는 `Connect with who's beside you.` 13px / 400 / `--text-dim`.

---

## 9. 붙여넣을 CSS

```css
@import url('https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.4/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css');
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css');

:root {
  --font: 'Wanted Sans Variable', 'Wanted Sans', 'Pretendard Variable', -apple-system, system-ui, sans-serif;

  --bg: #16161A;
  --surface: #202027;
  --surface-hi: #2A2A33;
  --border: #32323C;
  --border-strong: #43434F;
  --text: #F5F5F7;
  --text-dim: #8E8E9A;
  --text-faint: #5C5C68;

  --looking: #F5B942;
  --sharing: #4ADE80;
  --first: #A78BFA;
  --open: #60A5FA;
  --danger: #F87171;
  --on-color: #16161A;

  --r-card: 14px;
  --r-ctrl: 12px;
  --r-pill: 20px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.5;
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
}

/* 모바일 전용. 데스크톱에서도 폰 폭으로 고정한다 */
#app {
  max-width: 420px;
  margin: 0 auto;
  min-height: 100dvh;
  padding: 0 16px;
}

button { font-family: inherit; }
```

`100dvh`를 쓴다. 모바일 브라우저 주소창 때문에 `100vh`는 잘린다.

---

## 10. 정하지 않은 것

- 다크 전용으로 간다. **라이트 모드는 만들지 않는다.** 시간이 없고 행사장은 어둡다
- 스플래시·온보딩 없음. QR 찍으면 바로 입장 화면
- 애니메이션 라이브러리 없음. CSS transition만

---

## 11. AI 티를 피하는 규칙

근거: [`research/market/ai-slop-design.md`](../research/market/ai-slop-design.md)

### 금지

| 금지 | 이유 |
|---|---|
| 보라·인디고 → 시안 그라데이션 | **2026년 가장 시끄러운 AI 신호.** Tailwind `indigo-500` 기본값 |
| 그라데이션 헤드라인 텍스트 | 장식일 뿐 문제를 안 푼다 |
| 배경 `#000`, 본문 `#fff` | 다크모드 AI 티의 핵심. 우리는 `#16161A` / `#F5F5F7` |
| 카드에 글래스모피즘·네온 글로우 | blur는 시트에만, 그것도 5px 이하 |
| 아이콘+제목+한 줄 카드를 3개 나란히 | 4개 출처가 지목한 클리셰 |
| Inter · Geist | 무관한 제품들이 서로 닮아 보이게 만든다 |
| 모든 요소 같은 radius·shadow·padding | 위계가 없으면 아무도 설계하지 않은 것처럼 보인다 |
| 바운스·elastic easing, hover zoom, pulsing dot | |
| 타이포 사이즈 5종 이상 | 4종으로 고정 |

> **다크모드 자체는 AI 티가 아니다.** `#000` + 네온 + 글래스 + 균일한 무게라는 **실행 방식**이 티다.

### 카피

`~를 통해` · `결론적으로` · `첫째/둘째/셋째` · `단순한 A가 아니라 B` · `혁신적인` · 섹션 헤더 이모지.
한국 사용자는 **이미 이 패턴을 사냥 중이다.** 나무위키에 AI 문체 밈 표제어가 있을 정도다.

UI 문구는 짧고 구체적으로. "지금 무엇을 찾고 계세요?"는 되지만 "당신의 네트워킹을 혁신하세요"는 안 된다.

**가운뎃점으로 세 항목을 나열하지 않는다.** `설치 없음 · 가입 없음 · 나가면 사라짐` 같은 문구가 가장 전형적인 신호다.
자랑은 화면이 대신한다. 가입 폼이 없으면 가입이 없다는 걸 알아서 안다.

**한 칸에 대구 두 문장을 넣지 않는다.** "상태는 그대로 둘게요. 누가 들어오면 바로 알려드릴게요."는
"누가 들어오면 알려드릴게요." 한 문장이면 된다. 리듬이 일정한 게 기계 글의 핵심 특징이다.

### 반드시 만들 것 — 여기가 진짜 차이를 만든다

**1. 편애하는 화면 하나.** 균일한 완성도가 기계의 지문이다. 사람이 만들면 반드시 한 화면이 더 다듬어져 있다.
**우리는 S4 접점 카드를 편애한다.** 여기에만 시간을 두 배로 쓴다. 나머지는 단정하기만 하면 된다.

**2. 빈 상태 · 로딩 · 실패 세 화면.** AI가 만든 것에 가장 확실히 없는 것이다.
심사위원의 방어 기제는 **입력을 비트는 것**이다. 긴 이름, 0건, 네트워크 끊기.

| 상태 | 화면 | 반드시 담을 것 |
|---|---|---|
| 접점 없음 | S4 | 왜 없는지 + 지금 몇 명인지 + 계속 찾겠다는 약속 |
| 방이 텅 빔 | S3 | 첫 입장자라는 사실 + QR 공유 버튼 |
| BLE 꺼짐 | S5 | 왜 안 되는지 + 켜는 방법 + **방 기준으로는 계속 동작한다는 안내** |
| 매칭 중 | S3 | 스피너 말고 "지금 47명 중에서 찾는 중" 같은 구체적 문구 |

**3. 시그니처 디테일 하나.** 만든 이의 흔적이다.
**우리는 만료를 시각화한다.** 상태 카드가 시간이 갈수록 서서히 바랜다. 5분이 다가오면 `--text`에서 `--text-faint`로 천천히 내려간다.
기능이면서 동시에 제품 철학(휘발성)의 시각화다. 깜빡이지 않는다. 천천히 바랜다.

**4. 가짜 데이터에 구체성을 준다.** 애플이 수상작 소개에서 "방콕과 발리의 아티스트가 그린 스티커 2,500장"을 전면에 세운 것처럼.
시드 프로필의 한 줄을 "백엔드 관심 있어요" 같은 뭉뚱그린 말 대신 **"GitHub Actions 배포에서 권한 오류로 막힘"**처럼 쓴다. 구체적인 거짓말이 추상적인 진실보다 진짜처럼 보인다.

### 시연 전 반드시 해볼 것

- 닉네임에 20자 넣어보기
- 한 줄에 140자 꽉 채우기
- 방에 혼자 있기
- 비행기 모드 켜기
- 블루투스 끄기

이 다섯 개가 안 깨지면 완성도 점수가 올라간다. **데모 3분 안에 이 중 하나는 반드시 드러난다.**
