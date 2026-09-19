# AI 슬롭 디자인 신호 (2026-09-19)

> **인용 금지 경고**: 널리 퍼진 "NN/g 조사에서 AI 생성 대시보드 50개 중 92%에 empty state가 없었다"는 통계는 **조작된 수치**다.
> 원문이라는 [NN/g empty state 글(2021)](https://www.nngroup.com/articles/empty-state-interface-design/)을 확인했으나 AI 관련 언급이 전혀 없다. 발표에서 쓰지 말 것.

---

## (a) 시각적 신호

| 신호 | AI 티가 나나 | 근거 |
|---|---|---|
| 보라·인디고 → 블루·시안 그라데이션 | **강함. 1순위** | 925Studios가 "2026년 가장 시끄러운 단일 AI 신호"로 지목. Tailwind `indigo-500` 기본값에 추적. 5개 독립 출처 일치 |
| 그라데이션 헤드라인 텍스트 | **강함** | impeccable.style |
| 글래스모피즘 + 네온 글로우 | **강함** | "장식으로 쓰이고 실제 레이어링 문제를 안 푼다" |
| 순수 `#000` 배경 | **강함 (다크모드 핵심)** | RAXXO: `#1f1f21` 권장, 순백 대신 `#F5F5F7` |
| 아이콘+제목+한 줄 카드 3개 한 줄 | **강함** | 4개 출처 일치 |
| Inter / Geist 기본값 | **강함** | "무관한 제품들을 닮아 보이게 만든다" |
| 전부 `rounded-xl`, 균일 그림자 | **중간~강함** | "그림자 opacity가 정확히 0.1" |
| 위계 없는 균일 그리드 | **강함** | "모든 카드가 같은 border·radius·padding" |
| 미수정 shadcn/ui | **중간** | shadcn 자체가 아니라 **기본 토큰 무수정**이 신호 |
| 바운스·elastic easing, hover zoom | **중간** | |
| 섹션 헤더 이모지 | **텍스트는 강함, UI는 약함** | RLHF 기인. 2025 연구에서 annotator가 이모지 많은 응답을 고평가 → format hacking |
| **fade-in-up 스크롤 애니메이션** | **약함. 근거 없음** | 어떤 출처도 지목 안 함. 그냥 2020년대 일반 디자인 |
| **Poppins, Space Grotesk** | **근거 없음** | 어떤 출처에서도 AI 신호로 안 나옴 |
| **다크모드 자체** | **약함** | 다크모드가 아니라 `#000`+네온+glass 조합이 신호 |

## (b) 카피 신호

**영어** — [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) 12개 패턴이 가장 검증됨.
em dash 남용 · rule-of-three · 모호한 출처("studies show") · 과장 형용사(vital, crucial, testament) · **부정 대구 "it's not just X, it's Y"** · "it's important to note" · 과도한 볼드.
UI 카피에서는 "supercharge", "world-class", "Not a feature. A platform."

> em dash는 논쟁적이다. PubMed 2,750만 건 분석에서 "AI 어휘"가 ChatGPT 이전인 2020년부터 상승했다. 위키피디아도 "단일 신호로는 아무것도 증명 못 한다"고 명시.

**한국어** — [`epoko77-ai/im-not-ai`](https://github.com/epoko77-ai/im-not-ai)가 71개 tell을 심각도별로 정리했다.
- **번역투**: `~를 통해`, `~에 있어서`, `~에 의해 생성된`
- **기계적 병렬**: `첫째/둘째/셋째`, 과도한 불릿·헤딩·이모지
- **AI 특유 어구**: `결론적으로`, `시사하는 바가 크다`, `혁신적인`, 문두 `또한/따라서/즉` 남발
- **리듬 균일성**: 문장 길이가 일정하고 어미가 반복됨 ← 저자가 꼽는 핵심

[나무위키에 밈 표제어가 생겼다](https://namu.wiki/w/%EC%99%80...%20%EB%84%88%20%EC%A0%95%EB%A7%90%2C%20**%ED%95%B5%EC%8B%AC%EC%9D%84%20%EC%B0%94%EB%A0%80%EC%96%B4.**). 2025년 3월 GPT-4o 아첨 현상으로 확산.
**한국 사용자가 이미 패턴을 사냥 중이라는 증거다.** `단순한 A가 아니라 B였습니다`, 거의 모든 답변의 `다만`, 마크다운이 깨져 `**`가 그대로 노출되는 것까지.

## (c) 구조적 신호 — 가장 중요

심사위원이 실제로 잡아내는 건 색이 아니라 이것이다.

- **AI는 정적 코드로 학습했지 인터랙티브 동작으로 학습하지 않았다.** [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)의 진단. 결과: validation 없고, error state 없고, 필수 필드 표시도 없는 폼
- **아무도 설계하지 않은 세 화면**: 대기·실패·빈 첫 화면. [SmoothUI](https://smoothui.dev/blog/ai-design-slop)는 "focus state 누락, WCAG 미달 대비, 애초에 설계된 적 없는 empty/error state"를 슬롭의 정의에 포함한다. **시각적 진부함과 기능적 결함을 같은 층위로 본다**
- **균일한 완성도 = 아무도 어느 화면도 더 아끼지 않았다는 증거.** 사람이 만들면 반드시 한 화면이 더 다듬어져 있다
- **해커톤 1인칭 증언** — [$3,000 해커톤용으로 vibe-code했다가 수상 실패한 기록](https://dev.to/qamar_dev_01/i-vibe-coded-an-app-for-a-3000-hackathon-it-was-complete-slop-146i): API 한 번 실패하면 전체 run 사망 / 50개 처리 중 UI 프리즈에 진행 표시 없음 / 부분 결과 export 불가 / pause·resume 없음. **데모 3분 안에 이 중 하나는 반드시 드러난다**
- **심사위원의 방어 기제는 입력을 비트는 것이다.** 긴 이름, 0건, 네트워크 끊기

## (d) 사람이 만든 티

- **Apple Design Awards 2026** 심사 기준: "전환 효과의 우아함이 아니라 **압박 상황에서 도구의 신뢰성**". 수상작 소개에서 스티커 2,500개가 **방콕과 발리의 현지 아티스트가 그렸다**는 사실을 전면에 세웠다. 출처의 구체성 자체가 상찬 대상
- **Proof of Hand** (Studio2am, Creative Bloq 2026): "알고리즘이 완벽한 평면성을 쏟아낼 때, 만든 이의 흔적이 신호가 된다." 리소그래프 질감, 불규칙한 가장자리, 의도적 그레인
- **당근 SEED**: 기술블로그가 "프롬프트 한 줄로 화면이 나오는 시대에 당근스러운 화면을 만드는 법"을 썼다. AI를 막는 게 아니라 **자기 토큰을 먼저 정의해 AI를 그 안에서 굴린다**

## (e) 한국 맥락

- [brunch "AI가 그린 세상은 왜 다 보라색일까?"](https://brunch.co.kr/@fromhyuns/13): **분포 수렴.** 보라색은 "가장 실패하지 않는 선택"
- [시프트업 AI 슬롭 논란](https://ditoday.com/): AI 사용을 **표기했는데도** 논란이 됐다. 나무위키에 "AI 슬롭" 표제어가 있다
- [brunch "요즘 앱·웹 UX/UI가 전부 비슷한 이유"](https://brunch.co.kr/@7217b71f43c34f7/221): 획일화 논의는 AI 이전부터. 템플릿이 풍부해져서 **차이는 시각 완성도가 아니라 UX 완성도에서 난다**

**미확인**: "Pretendard + 파란 액센트 + 라운드 카드가 이제 제네릭하게 읽힌다"고 명시적으로 비판한 한국어 출처는 못 찾았다. Pretendard의 편재성은 문서화됐지만 그 조합을 비판한 글은 확인 실패. 논리적 추론이지 인용 가능한 근거가 아니다.
국내 해커톤 심사평에서 "다 비슷비슷하다"는 지적을 담은 공개 자료도 검색으로는 확인 실패.

## (f) 체크리스트

### 하지 말 것 10
1. 보라·인디고 → 시안 그라데이션. Tailwind `indigo-500`·`blue-500` 기본값 그대로 쓰지 말 것
2. 헤드라인 그라데이션 텍스트
3. 배경 `#000` → `#1f1f21`급 오프블랙. 본문 `#fff` → `#F5F5F7`
4. 아이콘+제목+한 줄 카드 3개 나란히
5. 카드에 글래스모피즘. blur는 모달·드롭다운에만, 그것도 5px
6. 모든 요소 동일 radius·shadow·padding
7. 타이포 사이즈 12종 → 4종만
8. 뷰포트당 장식용 강조색 2개 이상
9. 카피에서 `~를 통해`, `결론적으로`, `첫째/둘째/셋째`, `단순한 A가 아니라 B`, 섹션 헤더 이모지
10. 바운스·elastic easing, hover zoom, pulsing dot, marquee

### 할 것 8
1. **텍스트 3단계 위계 강제** (100% / 60% / 30%). RAXXO는 이것만으로 "다 똑같아 보이는" 문제의 80%가 사라진다고 본다
2. **깊이 3단계** 배경 토큰: base / raised / inset
3. **핵심 화면 1개만 과하게 다듬기.** 균일한 완성도가 기계의 지문이다. 일부러 편애를 남길 것
4. **empty / loading / error 3종을 최소 1개 화면에 실제 구현.** 왜 비었는지 + 다음에 뭘 할지 버튼 + 채워지면 뭐가 보일지
5. **긴 텍스트·0건·네트워크 끊김을 데모 전에 직접 넣어볼 것**
6. **가짜 데이터에 구체적 출처 부여.** 애플이 "방콕·발리 아티스트 2,500장"을 전면에 세운 것처럼
7. **시그니처 디테일 1개.** 손그림 아이콘, 그레인, 비대칭 한 군데
8. **폰트에 의견 넣기.** Inter·Geist 회피

## (g) 출처
[impeccable.style/slop](https://impeccable.style/slop/) · [925Studios](https://www.925studios.co/blog/ai-slop-design-tells) · [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website) · [SmoothUI](https://smoothui.dev/blog/ai-design-slop) · [RAXXO 다크모드](https://dev.to/raxxostudios/dark-mode-design-that-doesnt-look-ai-2cn3) · [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) · [im-not-ai](https://github.com/epoko77-ai/im-not-ai) · [brunch/fromhyuns](https://brunch.co.kr/@fromhyuns/13) · [해커톤 슬롭 1인칭](https://dev.to/qamar_dev_01/i-vibe-coded-an-app-for-a-3000-hackathon-it-was-complete-slop-146i) · [NN/g empty states](https://www.nngroup.com/articles/empty-state-interface-design/) · [Proof of Hand](https://studio2am.co/blogs/news/proof-of-hand-why-designers-are-reaching-for-imperfection-in-2026) · [brunch 획일화](https://brunch.co.kr/@7217b71f43c34f7/221)

---

## 정직한 한계 3가지
1. **"92% NN/g 통계"는 조작된 수치.** 여러 블로그가 재인용 중이라 마주칠 수 있다. 인용 금지
2. **fade-in-up, Poppins, Space Grotesk는 근거 없음.** 이걸 피하느라 시간 쓰지 말 것
3. **국내 해커톤 심사평 자료와 "Pretendard 기본룩" 비판 자료는 검색 실패.** 존재하지 않는다는 뜻은 아니지만 추론임을 명시
