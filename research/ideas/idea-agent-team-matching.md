# 아이디어 A (에이전트 간 팀빌딩 협상) 시장·근거 브리프
조사 시점 2026-09-19. "uncertain" = 1차 출처로 검증 못 함.

## (a) 경쟁 서비스

| Name | Country | What it does | Uses AI? | Pricing / traction | URL |
|---|---|---|---|---|---|
| 렛플 Letspl (SF34) | KR | 사이드프로젝트·스터디·커피챗 board, web+app; "추천 알림" on new projects | Partial: v2.2.2 added AI 프로젝트 생성/썸네일 (no AI matching) | IAP 커피포인트 $9.99–99.99; app v2.3.1 (2025-12-31); "2000+ projects" claim; funding: not found (uncertain) | letspl.me |
| 비긴메이트 Beginmate | KR | 스타트업 공동창업자/초기 팀빌딩 매칭 (founded 2016-08) | No | "누적 10,000+ 팀빌딩, 5,000+ 성공" (c.2023). **www.beginmate.com did not resolve (DNS) on 2026-09-19**; company now lists mentoring/consulting → platform status uncertain | nextround.kr/startup/detail/2931 |
| 홀라 HOLA | KR | IT 사이드프로젝트·스터디 모집 board, tech-stack filters (indie-built, launched 2021-08-14) | Basic interest-based 추천 only | Free; traction unknown; site live | holaworld.io |
| 캠퍼스픽 (Vinu Career) | KR | 대학생 커뮤니티 + 공모전/대외활동 + 팀원 모집·스터디 게시판 | No | Free; App Store 3.8★ (641 ratings), v4.0.23; claims "대학생 커뮤니티 이용자 수 1위"; revenue = 광고 문의 | campuspick.com |
| 인프런 커뮤니티 스터디/팀 프로젝트, OKKY 모임·스터디, 링커리어 팀원모집 | KR | Free bulletin boards | No | Free; a student side-project "Match-Up" (대학생 팀플 매칭 앱, target 500 users, 2026) is posted on 인프런 — signal that students are building this themselves | inflearn.com/community/studies · okky.kr/community/gathering · community.linkareer.com/team |
| 프로그래머스 | KR | Paid "온라인 스터디" product (30만원+, per OKKY thread, undated); no matching board found | No | Uncertain | okky.kr/article/617567 |
| 팀노바 | KR | Coding academy (팀프로젝트 기반 교육) — **not a matching service** | No | Tuition | teamnova.co.kr |
| Sidedock | KR | Side-project launch/discovery listing (Dev Log), not matching | Lists AI tools | Free | sidedock.io |
| 위프(Weef), 와글(Waggle) | KR | Named in roundups as "AI 매칭 상담" / "협업 온도" platforms | Claimed | **Unverified** (source page unavailable) | — |
| Devpost | US | Participants page + "looking for teammates" flag + team-up request email; explicitly manual | No | Enterprise/custom; 4M+ devs | help.devpost.com/article/75 |
| Junction Platform | FI | Built-in team-forming tool "fitting interests and skills" | No AI stated | Per-event or annual subscription (demo) | junctionplatform.com/features |
| MLH | US | Discord #team-formation + in-person mixers | No | Membership | guide.mlh.io |
| Devfolio / Unstop / HackerEarth | IN | Submission/judging; no team finder found (Devfolio, Unstop); HackerEarth "real-time team creation tools" | No | Custom/enterprise | guide.devfolio.co · hackerearth.com/blog/hackathon-platforms |
| Brightidea, Eventornado | US | "Skills-based teammate matching" (enterprise innovation tools) | Not AI | Custom | hackerearth.com/blog/hackathon-platforms |

**Finding:** No Korean or global team-formation product found that uses agent-to-agent negotiation; at most rule-based skill filters.

## (b) 고충 근거

- **경남국립대 학보 survey (2025-06-07, n=62):** 90.32% felt severe 팀플 stress; causes: 일정 조율 69.64%, 무임승차/역할 불균형 55.35%, 평가 불공정 30.35%. Instructor: "최근 팀플은 각자가 맡은 부분을 따로 완성한 뒤 단순히 합쳐 제출하는 방식이 일반화됐다." — news.gknu.ac.kr/news/articleView.html?idxno=1802
- **대학내일20대연구소 (2012, n=225, older):** 89% experienced free-riders; 업무 분배 43%, 일정 잡기 28%, 갈등 22%. — mobile.newsis.com/view/NISX20120810_0011353713
- **SW중심대학 공동해커톤 참가 후기 (2023, cross-university):** on-site pitching, then students rush leads saying "저 !! 이 프로젝트 하고 싶어요!!"; leads screen via Slack 자기소개/GitHub/Notion; "팀빌딩은 진짜 무조건 스피드이다." — velog.io/@osohyun0224
- **KUSITMS 해커톤 후기:** planned 2 기획+2 디자인+4 개발, actual 3+1+4 (role imbalance). — velog.io/@leehyewon0531
- **링커리어 커뮤니티 (2026-07-14):** "혼자 공모전 전체를 소화 하기엔 시간이 부족할 것 같아 팀원을 구해보려고 합니다!" — community.linkareer.com/team/6241162; guides say students rely on 에브리타임 ("같은 학교 학생이면 좀 더 신뢰도가 높고"), 캠퍼스픽 팀원모집 게시판, 스펙업 카페. — community.linkareer.com/strategy/442087, /733137
- **HOLA founder (2021):** "스터디/프로젝트 팀원 모집 플랫폼이 통일되어 있지 않음" — had to post across many communities. — velog.io/@seeh_h/Hola
- **Organizer side:** 오렌지플래닛 온라인 해커톤 2025 markets "체계적인 팀 빌딩 과정" and "'함께할 사람'을 만드는 것에 집중" (eopla.net/magazines/30890). 2025 SW중심대학 디지털 경진대회: 국민대 collects 3–5인 teams by email by 5/30; per search summary teams are single-university and 참가비 대학당 100만원 (PDF password-protected, **uncertain**). A 2026 mentoring-LMS repo shows organizers still doing manual multi-select team assignment + Discord sync, "not automatic balancing in phase one." — github.com/namyeoungchan/asanAX-mentoring/issues/13

## (c) 에이전트 간 협상 유사 사례

| Name | What it does | Status 2026 | Link |
|---|---|---|---|
| 미러 (미러에이아이, KR) | User's AI talks to other users' AI first; user reviews result then decides to meet | Launched late July 2026 (sources say 7/24 vs 7/30); free basic, paid 매칭/분석; no outside funding | edaily.co.kr newsId=03365286645517800; m.news.nate.com/view/20260730n27429 |
| Volar (US) | AI clone of you chats with other clones as pre-date screen | Launched late 2023, **shut down 2024** | bhavesh0198.substack.com/p/the-next-evolution-of-online-dating |
| Sitch (US) | AI matchmaker interviews users (AI↔human, not AI↔AI) | $6.7M raised; tens of thousands of users; $90–160 setup packs (Aug 2025) | globaldatinginsights.com |
| Bumble | Wolfe Herd's "concierge dates other concierges" vision (May 2024); shipped "Bee" assistant | 2026 redesign away from swiping; AI↔AI still vision only | globaldatinginsights.com |
| Tinder Sparks 2026 | Chemistry, Learning Mode, Camera Roll Scan | Shipping Mar 2026; no agent acting on user's behalf | tinderpressroom.com (2026-03-12) |
| Series (US) | iMessage AI "friend" brokers intros for co-founders/mentors | $5.1M pre-seed (Apr 2026), 750+ campuses, 82% D30 retention; whether AIs talk to each other is not confirmed (uncertain) | techcrunch.com/2026/04/24 |
| Boardy (CA) | Voice-AI superconnector, double-opt-in intros | 166K people, 114K intros by mid-2026; Pro $100/mo (Jun 2026); $11M raised | blastra.io/blog/boardy-ai-networking-guide |
| Anthropic Project Deal | 69 staff, agents negotiated 186 deals ($4K+) in Slack, no human in loop | Published 2026-04-24; Opus 4.5 agents beat Haiku 4.5 agents and humans didn't notice; 46% would pay | anthropic.com/features/project-deal |
| Microsoft Magentic Marketplace | Open-source agentic market sim | Oct 2025; severe first-proposal bias (10–30× speed advantage) | arxiv.org/abs/2510.25779 |
| Google A2A → Agentic AI Foundation | Agent-to-agent protocol standard | A2A Apr 2025 → LF Jun 2025 → AAIF Dec 2025 (250+ members by Aug 2026) | axios.com/2026/08/17 |
| Recruiting agent↔candidate agent | — | **No shipped product found**; guides say offer negotiation stays human; 47–49% of US adults would let AI negotiate salary/benefits | 4cornerresources.com/job-market-news/ai-job-search-trust-gap-2026 |

## (d) 연구 문헌

| Title | Venue/year | Finding |
|---|---|---|
| Adaptive In-conversation Team Building for LM Agents (Captain Agent) | arXiv 2405.19425, 2024 (venue uncertain) | Dynamic agent team building +21.94% accuracy |
| AgentInit | EMNLP 2025 Findings | Pareto diversity/expertise team init, up to 1.6× gains |
| Teaming in the AI Era | UMAP 2025 (doctoral), arXiv 2506.05265 | Bandit-based human team formation + LLM feedback (tAIfa) + simulated teams |
| Piecing Together Teamwork | CHI 2025 | LLM jigsaw agent facilitates 58 student groups |
| Magentic Marketplace | arXiv 2510.25779, Oct 2025 | Agent markets degrade with scale; first-proposal bias |
| Coalition Formation in LLM Agent Networks | arXiv 2604.14386, Apr 2026 | Hedonic-game framework; "Coalition-of-Thought" prompting → 73.2% Nash-stable vs 41.8% |
| TERMS-Bench | arXiv 2605.13909, May 2026 | Equal deal rates hide big differences in surplus extraction/belief calibration |
| Do Matching Mechanisms Work with LLM Agents? | arXiv 2606.03030, Jun 2026 | Centralized mechanisms beat free negotiation on stability/efficiency; LLM agents report preferences more truthfully than humans |
| Multi-Agent Collaboration Mechanisms survey | arXiv 2501.06322, Jan 2025 | Taxonomy of LLM collaboration |

## (e) 누가 돈을 내나

- **Hackathon platforms:** Devpost enterprise/custom; Devpost for Teams = annual seat-based subscription (price not public). Devfolio: companies email partner@devfolio.co (free-for-universities claim **unverified**). Unstop, HackerEarth, Junction: custom/enterprise; Junction per-event or annual. HackerEarth's 2026 comparison: no platform lists AI team matching.
- **Korean listing platforms:** 링커리어 공모전/대외활동 등록 무료, paid promotion exists (price not public); 캠퍼스픽 revenue = 광고 문의; 위비티 pricing unknown; 이벤터스 행사 개설·모집 무료 (ticket fee % unverified).
- **University budgets (2025):** 공주대 SW중심대학 산학캡스톤: 팀당 최대 100만원 (융합) / 50만원 (단일학과), 자문 20만원 별도, ~50팀, 3인 이상 — swknu.kongju.ac.kr seq=119. 한림대 SW캡스톤 지원 (amount unlisted). 순천향대 LINC 3.0: 학생당 30만원 (search summary, **uncertain**). 국민대 SW융합대학 캡스톤 I: 56+ teams incl. AWS 분반 — kookmin-sw.github.io. 2025 SW중심대학 디지털 경진대회 참가비 대학당 100만원 (uncertain).
- **Willingness to pay signal:** 46% of Project Deal participants would pay for an agent that negotiates for them.

## (f) 차별점과 예상 질의응답

**Angles**
1. Every Korean incumbent is a bulletin board; global platforms are manual (Devpost) or skill filters (Junction). Nobody resolves the *multi-party* constraint (skills × role mix × schedule × travel) — which is exactly the #1 stressor (일정 조율 69.64%).
2. Cross-university logistics (서울×2 + 아산) is a real gap: the SW중심대학 경진대회 restricts teams to one university.
3. Human-in-the-loop approval is a design answer to Volar's failure and Project Deal's "asymmetry humans didn't notice."
4. Theme fit: person↔person exchange via technology↔technology (A2A-style agent protocol).

**Likely attacks → answers**
- *"Volar died; why will this work?"* → Dating is identity-laden; team formation is task-based with objective constraints; humans approve; 미러 (2026) and Series show renewed traction in Korea/US.
- *"Isn't this just a recommender?"* → A recommender ranks; agents negotiate trade-offs (who takes 기획, when to meet, 아산↔서울 midpoint) and output a concrete first-meeting plan.
- *"Fairness / stronger-model advantage?"* → Same model and symmetric prompts for all agents; finish with a centralized stable-matching step (Hoshino et al. 2026) plus a visible negotiation log.
- *"Privacy of schedules/profiles?"* → Agents exchange abstractions only (availability windows, skill tags), per-match consent.
- *"Cold start / small N?"* → Seeded by the organizer with registrants; the on-site pitching model already works at 30–40 people.
- *"Skill misrepresentation?"* → GitHub-linked evidence in profiles; post-project peer feedback feeds future negotiations.
- *"LLM negotiation reliability?"* → TERMS-Bench shows variance, so use a structured offer protocol (A2A-style) with LLM rationale, and Coalition-of-Thought-style stability checks.
- *"Who pays?"* → Organizers/사업단 first (캡스톤 팀당 50–100만원, 경진대회 대학당 100만원 budgets exist), then 부트캠프 and corporate hackathons where custom platform pricing is the norm.

## (g) 출처
letspl.me · apps.apple.com/us/app/렛플-letspl/id1595017110 · nextround.kr/startup/detail/2931 · beginmate.startup-plus.kr/info · holaworld.io · velog.io/@seeh_h/Hola · apps.apple.com/kr/app/캠퍼스픽/id1193606934 · vinuteam.com/campuspick · inflearn.com/projects/1766829 · okky.kr/community/gathering · okky.kr/article/617567 · teamnova.co.kr · sidedock.io · help.devpost.com/article/75-participants-page-forming-a-team · help.devpost.team/article/247-how-to-find-teammates · junctionplatform.com/features · guide.mlh.io/overview/event-types/digital-events · guide.devfolio.co · hackerearth.com/blog/hackathon-platforms · xobin.com/blog/devpost-for-teams-pricing-and-review · news.gknu.ac.kr/news/articleView.html?idxno=1802 · mobile.newsis.com/view/NISX20120810_0011353713 · velog.io/@osohyun0224 · velog.io/@leehyewon0531 · community.linkareer.com/team/6241162 · community.linkareer.com/strategy/442087 · community.linkareer.com/strategy/733137 · eopla.net/magazines/30890 · software.kookmin.ac.kr notice articleNo=5927168 · swuniv.kr/60/?bmode=view&idx=142839360 · github.com/namyeoungchan/asanAX-mentoring/issues/13 · edaily.co.kr newsId=03365286645517800 · m.news.nate.com/view/20260730n27429 · bhavesh0198.substack.com/p/the-next-evolution-of-online-dating · globaldatinginsights.com (Sitch, Bumble, Volar) · tinderpressroom.com (2026-03-12) · techcrunch.com/2026/04/24 (Series) · blastra.io/blog/boardy-ai-networking-guide · anthropic.com/features/project-deal · arxiv.org/abs/2510.25779 · axios.com/2026/08/17/a2a-agentic-ai-foundation-open-ai-standards · 4cornerresources.com/job-market-news/ai-job-search-trust-gap-2026 · arxiv.org/abs/2405.19425 · arxiv.org/abs/2509.19236 · arxiv.org/abs/2506.05265 · dl.acm.org/doi/10.1145/3706598.3713349 · arxiv.org/abs/2604.14386 · arxiv.org/abs/2605.13909 · arxiv.org/abs/2606.03030 · arxiv.org/html/2501.06322v1 · swknu.kongju.ac.kr/community/noticedetail.do?seq=119 · hallym.ac.kr/bbs/hlsw/335/374420 · kookmin-sw.github.io · linkareer.com/manage/welcome · event-us.kr/pricing

**Caveats:** 비긴메이트 platform status, 위프/와글 existence, Devfolio university pricing, 순천향대 per-student amount, 2025 경진대회 fee/single-university rule, and Series' AI↔AI mechanism are all marked uncertain above.
