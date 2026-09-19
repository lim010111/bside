# 리서치 근거

발표와 질의응답에서 인용할 숫자의 출처. 각 문서에 링크가 달려 있고, **검증 못 한 것은 미검증으로 표시**돼 있다.

> 원칙: 1차 출처가 없는 주장은 무대에서 말하지 않는다.
> 예를 들어 "Highlight는 배터리 때문에 죽었다"는 널리 퍼졌지만 **창업자도 회사도 그렇게 말한 적이 없다.**

---

## 질의응답에서 가장 많이 쓸 것

### [market/proximity-postmortem.md](market/proximity-postmortem.md) ★
근거리·상태 공유 서비스 실패 부검. Highlight, Sonar, Banjo, Zenly, FireChat, Yik Yak 등 14개.
창업자 회고와 공식 공시 우선. **"왜 안 죽느냐"는 질문의 답이 전부 여기 있다.**

핵심 세 가지
- 실제 사망 1위 원인은 **수익모델 부재** (Zenly는 4천만 MAU로도 닫힘)
- **근거리가 배관이면 살고 소셜 표면이면 죽는다** (Nearby Connections 생존, Nearby Notifications 종료)
- 가장 가까운 성공 사례는 이벤트 앱이 아니라 **Slido·Mentimeter 같은 방 코드 장르**

---

## 폴더별

### `ideas/` — 검토했다 접은 아이디어
| 문서 | 내용 |
|---|---|
| [00-early-decision.md](ideas/00-early-decision.md) | **구버전.** 방향 전환 전 결정 문서. 접은 대안 6개와 사유는 아직 유효 |
| [idea-agent-team-matching.md](ideas/idea-agent-team-matching.md) | 에이전트 간 팀빌딩 협상. 국내외 팀빌딩 서비스 경쟁 조사 |
| [idea-integration-credit-exchange.md](ideas/idea-integration-credit-exchange.md) | AI 시스템 연결기, 학점교류 허브 |
| [idea-intl-students-skillswap-debate.md](ideas/idea-intl-students-skillswap-debate.md) | 유학생 커뮤니티, 스킬 스왑, 모델 간 토론 + 유사 대회 수상작 패턴 |

### `market/` — 시장과 사업
| 문서 | 내용 |
|---|---|
| [proximity-postmortem.md](market/proximity-postmortem.md) ★ | 근거리 서비스 실패 부검 |
| [competitive-landscape.md](market/competitive-landscape.md) | 경쟁 지형 |
| [landscape-addendum.md](market/landscape-addendum.md) | 경쟁 지형 보론 |
| [gtm-marketing.md](market/gtm-marketing.md) | 캠퍼스 앱 초기 성장, 콜드스타트 해법, 대학 진입 경로, 프라이버시 역풍 사례 |
| [hr-saas-pricing.md](market/hr-saas-pricing.md) | 국내 HR·협업 SaaS 가격. **₩6,000/인/월 앵커** |
| [onboarding-demand.md](market/onboarding-demand.md) | 신입 퇴사 사유 1위 **조직·직무 적응 실패 49.1%** 등 확장 근거 |

### `naming/` — 이름 후보 충돌 검사
| 문서 | 내용 |
|---|---|
| [round1.md](naming/round1.md) | 말문·두런·물꼬. **노크가 사용 불가인 이유** (대학생 커뮤니티 앱 14만 명) |
| [round2.md](naming/round2.md) | 곁말·첫말·띠지. 명찰 계열 폐기 사유 |
| [round3.md](naming/round3.md) | 합석·쿵짝·yap. **2026 국내 작명 트렌드와 해커톤 수상작 패턴** |

> 최종 선택은 **Bside**. 위 세 라운드에는 없다.
> 할 일: 앱스토어·구글플레이에서 "Bside" 검색 (음악 서비스 충돌 가능)

### `tech/` — 기술 검증
| 문서 | 내용 |
|---|---|
| [agent-protocol-feasibility.md](tech/agent-protocol-feasibility.md) | A2A·MCP 프로토콜, LLM 가격, 에이전트 협상 아키텍처 |
| [input-friction.md](tech/input-friction.md) | 입력 마찰 조사 |

---

## 자주 쓸 숫자

| 숫자 | 뜻 | 출처 |
|---|---|---|
| **15%** | 주최자 중 자사 네트워킹이 매우 효과적이라 답한 비율 | Converve |
| **58% / 39%** | Brella 대표 사례의 앱 채택률 / 미팅 수락률 | Brella TechBBQ |
| **49.1%** | 국내 신입 1년 내 퇴사 사유 1위 = 조직·직무 적응 실패 | 경총 2016 |
| **53%** | 국내 20대 아이폰 점유율 (20대 여성 67%) | 2026 조사 |
| **SEK 598M** | Mentimeter 2025 순매출. 참가자 리텐션 없이 흑자 | |
| **31바이트** | BLE 광고 페이로드 한계. 한글 여섯 자 | BLE 규격 |
| **20~30원** | 매칭 1건당 LLM 원가 | 자체 계산 |
