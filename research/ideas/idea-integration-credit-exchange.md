# 아이디어 E (AI 시스템 연결기) vs D (학점교류 허브) 리서치
조사 시점 2026-09-19. 불확실 항목은 (unverified) / (medium)으로 표시.

## Idea E — AI 시스템 연결기

### 경쟁 서비스
| Name | What it does | AI-generated mapping? | Status / funding | URL |
|---|---|---|---|---|
| superglue (YC W25) | Builds integrations from natural language; LLM-generated transforms; "detects the break, proposes a fix, applies it with one click" | Yes (closest comp). Now positioned as ERP implementation/migration agent | $500K pre-seed 2025-03; no later round found. FSL license, SDK MIT | github.com/superglue-ai/superglue |
| Composio | 3,000+ app toolkits + auth for agents; Tool Router (2025-10) | No, pre-built tools | $25M Series A 2025-07 (Lightspeed), ~$29M total | composio.dev |
| Nango | Open-source, 1,000+ APIs; "build integrations with AI" via coding agents | Partial (AI-assisted code, 2026) | $7.5M seed led by Gradient (post dated 2026-04-01); cashflow positive | nango.dev |
| Merge.dev | Unified API, 250+ integrations, hand-built common models; Agent Handler over MCP (2025-10) | No | $74.5M total (Series B $55M, 2022-10) | merge.dev |
| Truto | Config-driven unified API; JSONata schema customization; MCP generation | No (manual JSONata) | Founded 2023; funding not found; $999–1,999/connector/yr | truto.one |
| Zapier | Copilot builds Zaps incl. field mappings from NL (beta); Agents; MCP (2026); 8–9k apps | Yes, inside Zapier | Private | zapier.com |
| n8n | Open-source workflow/agent builder; NL workflow generation; 80%+ of workflows involve AI | Partial | €55M Series B 2025-03; $180M Series C 2025-10 at $2.5B; SAP stake at $5.2B 2026-05 (medium) | n8n.io |
| Workato | Mapper Copilot (AI mapping suggestions), Recipe Copilot; Genies 2025-08; Enterprise MCP 2026 | Yes, suggestions | Gartner MQ Leader 2025 | workato.com |
| MuleSoft | Einstein/"Vibes" generates DataWeave mappings from input/output metadata + sample data | Yes | Leader 2025 | mulesoft.com |
| Tray.ai | Merlin Agent Builder (2025-06); 700+ connectors | No evidence of mapping gen | Gartner Visionary 2025 | tray.ai |
| Paragon | ActionKit 1,000+ actions; Triggers beta 2026-05 | No | $21M+ (YC, Inspired) | useparagon.com |
| Airbyte | AI Assistant drafts connector config from API docs; AI-configured connections 2025-12 | Yes (connector config) | Open-source + cloud | airbyte.com |
| Boomi / SnapLogic / Informatica | Boomi GPT, Companion (2026-07); SnapGPT; CLAIRE GPT | Yes (NL integration) | Incumbents | boomi.com |
| 티맥스소프트 AnyLink 8 (KR) | Template-based EAI + AnyAPI; GS 1등급, 2026-05 | No LLM mapping found | Korean incumbent | tmaxsoft.com |
| Korean LLM-mapping startups | None found in KR searches (gap or undiscovered) | — | — | — |

### 시장 근거
- Gartner: iPaaS revenue >$9B in 2024 (from $7.8B 2023), >$17B by 2028; 16 vendors in 2025 MQ.
- Grand View: $12.9B (2025) → $55.5B (2033), 19.6% CAGR; Fortune BI $15.63B (2025); MarketsandMarkets $13.9B by 2026 (older report).
- MuleSoft 2025 Connectivity Benchmark (1,050 IT leaders): avg $4.7M spent on custom integrations; 95% say integration hinders AI; 2026 edition: 90% face silo obstacles, 39% use MCP, 68% struggle to keep up with agent protocols.
- Share of IT budget spent on integration: no reliable 2025–26 figure found; do not cite one.

### 실현 가능성
- Parciak et al. (VLDB TaDA 2024): GPT-4 schema matching F1 0.364–0.800 across health datasets; more context improves precision.
- Magneto (VLDB'25, NYU, open source): SLM retrieval + LLM rerank. Schemora (2025-07): new SOTA on MIMIC-OMOP (+7.49% HitRate@5). LLMatch (2025-07): SchemaNet enterprise benchmark. Agent-OM (OAEI 2025): LLM agents match SOTA on simple, beat it on complex/few-shot ontology alignment.
- Fraunhofer IESE (arXiv 2510.23893): runtime format conversion; qwen2.5-coder:32b pass@1 ≥0.89 with code generation, most models <0.2 direct; unit conversion fails; human review advised.
- WAPIIBench (arXiv 2509.20172): open-source LLMs solve <40% of API-invocation tasks (hallucinated endpoints).
- Takeaway: candidate ranking + LLM rerank + human approval + test cases is the proven pattern.

### 누가 돈을 내나 / 가격
- Dev-tool comps: Nango $0/$50/$500 per month + $1/connection; Composio Pro $29/month; Merge ~$65/linked account/month (competitor-sourced); Truto per connector/year. Korean iPaaS market rates ₩50만–300만/월 for mid-size (impactflow, low confidence).
- Universities buy integration: 고려대 차세대 포털·학사 ~120억 (메타넷디엘+토마토시스템); 명지대 AI LMS RFP 2025-12; 공유대학 LMS RFP on 나라장터 2025 (medium); 유비온 160+ customers.
- Public data exists but is heterogeneous (data.go.kr: 대교협 학과정보, KERIS APIs).

### 예상 질의응답
- "Zapier/MuleSoft already generate mappings" → They do it inside their own canvases for SaaS; none found doing Korean/edu schema unification with review-first UX; superglue (closest) pivoted to ERP rollouts.
- "How accurate is LLM mapping?" → F1 0.36–0.80 in literature; hence confidence scores, human approval, generated tests.
- "Moat?" → Domain mapping memory + Korean 학사 schemas.
- "Data access?" → Public APIs + timetable exports; consent.

## Idea D — 학점교류 허브

### 현황
| Platform | What / status |
|---|---|
| 서울총장포럼 공유대학 플랫폼 | Launched 2018 (31–32 univs). Exchanges: 2018-2 25건 → 2019-2 317건 → 2020-1 87건; shut after ~2 years when 서울시 funding stopped (한경 2020-09); 중대신문 2025-09 confirms abandoned. CAU portal still shows 68 univs (2020 data) |
| OCU 컨소시엄 (2001) | 92 universities, ~250 co-developed online courses/yr, ~120,000 students/yr, fully online |
| KNU10 | 10 거점국립대 원격수업 학점교류, active 2025 |
| DSC 공유대학 (대전·세종·충남) | 28 institutions, own LMS (ecampus.dscu.ac.kr), 융합전공 ~100 students/yr; 순천향 counts DSC in its 6-credit cap. Also USG (울산경남), 강원 LRS |
| COSS 혁신융합대학 | e.g., 차세대반도체 consortium incl. 숭실대; up to 9 credits |
| K-MOOC 학점인정 | Typically 3 credits/semester, 6 max (e.g., 세종대) |
| Consumer cross-university course app | None found (unverified) |

### 정책 / 예산
- 고등교육법 시행령 개정 (2024-02): domestic joint-curriculum credit cap raised from 1/2 of graduation credits to "협약 범위"; consortium-style joint programs allowed.
- 원격수업 20% cap abolished (2020-09 plan; 훈령 2021-02-15) → 대학 자율, except 100% online degrees.
- 2026: RISE renamed 지역성장 인재양성체계(앵커); budget 1.94조 → 2.14조; 공유대학 1,200억 formula-allocated; 4,000억 performance incentives; R&D 중심 공유대학 ~800억 from 2026-04 (newspim 2026-04-02; 한국대학신문 2026-02-02).
- 2026-05: 숭실대, 순천향대 among 7 SW중심대학 converted to AI중심대학 (24억×8yr each). 국민대 was a 미래창조과학부-era SW중심대학 (site active) but not in that list.

### 세 학교
- 국민대: apply via ON국민 portal; partners posted per university; GPA ≥3.0; ≤6 credits. 2025-2 exchanges exist with 영남대, 한성대, 성신여대, 고려대.
- 숭실대: partners include 홍익대, 고려대 세종, 한성대, 명지대, 건국대, 항공대; ≤6 credits; cyber courses excluded (홍익 rule); grades posted 2–4 weeks late.
- 순천향대: partners restricted to 천안·아산 and 대전·충남 4년제 (e.g., 단국, 공주, 호서, 백석, 한밭); ≤6 credits incl. OCU/DSC; GPA ≥3.0; paper 공문 via 교무처.
- No evidence of any 국민대–숭실대–순천향대 agreement; 순천향's regional rule suggests Seoul schools are excluded (medium-high). This is the gap a hub would fill.

### 고충 근거
- 중대신문 2025-09-01: 1 in 300 중앙대 students participate; 2024-2 OUT 63 (−45.7% vs 2015), IN 61 (−68.2%); <0.5% at three surveyed schools; in-person submission during break; no course reviews; major-credit approval at chair's discretion; rules differ per school.
- 부대신문 2017: approvals through 학과→행정실→학사과→총장; unclear credit recognition.
- 서울대 (국정감사 2025): IN 6,451 (2021–25; 1,160→1,509/yr), OUT only 1,235 (239→333→275); inbound demand far exceeds outbound.

### 누가 돈을 내나 / 벤더
- Payers: 교육부/지자체 via 공유대학 (1,200억, formula) and 성과평가 incentives; universities via LMS/학사 RFPs.
- Vendors: 유비온 코스모스 LXP (KOSDAQ; 전북대·강원대·서울시립대 2026), 토마토시스템, 메타넷디엘, 에이트원 (선문대 AI 학사). None found advertising 학점교류 features; DSC runs its own LMS. 한국이러닝/커넥트: not verified.

### 예상 질의응답
- "The Seoul platform died" → It died from admin/funding churn and low volume; wedge is recommendation + online-first + AI-normalized data, on formula-funded 2026 budgets.
- "Do these three schools even exchange?" → No; pitch as the proposal, leveraging AI/SW중심대학 status.
- "Seoul–Asan distance?" → Cap abolished; OCU proves 120k/yr online demand; recommend online/계절학기 first.
- "B2G sales cycle?" → Acknowledge; start as student-facing discovery layer.

## 출처
- superglue: https://github.com/superglue-ai/superglue ; https://superglue.ai/ ; https://www.crunchbase.com/funding_round/superglue-9d1d-pre-seed--f667cd4b
- Composio: https://siliconangle.com/2025/07/22/composio-raises-25m-funding-ease-ai-agent-development/
- Nango: https://nango.dev/blog/nango-raises-7-5m-led-by-gradient/ ; pricing https://nango.dev/blog/composio-vs-nango/
- Merge: https://techcrunch.com/2022/10/24/merge-raises-55m-series-b-for-its-unified-api/ ; https://nango.dev/blog/merge-pricing/
- Truto: https://truto.one/blog/which-unified-api-platform-has-the-most-developer-friendly-pricing/
- Zapier Copilot: https://help.zapier.com/hc/en-us/articles/23503999825421
- n8n: https://techfundingnews.com/n8n-raises-180m-series-c-2-5-billion-valuation-automation-ai/ ; https://sacra.com/c/n8n/
- Workato: https://docs.workato.com/ai-features/copilot.html ; https://siliconangle.com/2025/08/19/workato-genies-workato-one-power-agentic-enterprise-worldofworkato/
- MuleSoft: https://blogs.mulesoft.com/dev-guides/dataweave-generative-transformation/ ; https://www.salesforce.com/news/stories/connectivity-report-announcement-2025/ ; https://blogs.mulesoft.com/agentic-perspectives/connectivity-benchmark-report/
- Tray.ai: https://www.globenewswire.com/news-release/2025/06/24/3104301/0/en/ ; Paragon: https://www.prnewswire.com/news-releases/paragon-completes-the-ai-integration-layer-with-actionkit-triggers-302763537.html
- Airbyte: https://docs.airbyte.com/platform/connector-development/connector-builder-ui/ai-assist ; https://airbyte.com/blog/ai-configured-connections
- Gartner iPaaS: https://boomi.com/blog/gartner-magic-quadrant-ipaas-2025/ ; Grand View: https://www.grandviewresearch.com/industry-analysis/integration-platform-as-a-service-ipaas-market
- 티맥스 AnyLink 8: https://www.fnnews.com/news/202605190916095974
- Papers: https://arxiv.org/abs/2407.11852 ; https://arxiv.org/abs/2412.08194 ; https://arxiv.org/abs/2507.14376 ; https://arxiv.org/abs/2507.10897 ; https://ceur-ws.org/Vol-4144/om2025-oaei-paper11.pdf ; https://arxiv.org/html/2510.23893v1 ; https://arxiv.org/abs/2509.20172
- 고려대 학사시스템 120억: https://www.edaily.co.kr/News/Read?newsId=01577686642037392 ; 유비온: https://edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02755206645386272
- 중대신문 2025-09-01: https://news.cauon.net/news/articleView.html?idxno=42293 ; 한경 2020: https://www.hankyung.com/article/2020092097401 ; 부대신문: https://channelpnu.pusan.ac.kr/news/articleView.html?idxno=6223
- 서울대 stats: https://www.unipress.co.kr/news/articleView.html?idxno=13386
- 시행령 2024-02: https://www.edpl.co.kr/news/articleView.html?idxno=11713 ; 20% cap: https://www.sedaily.com/NewsVIew/1Z7SEZSZ5R ; 훈령: https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000198212
- 2026 budget: https://www.newspim.com/news/view/20260402000272 ; https://news.unn.net/news/articleView.html?idxno=589488 ; AI중심대학: https://news.unn.net/news/articleView.html?idxno=592281
- OCU: https://cons.ocu.ac.kr/ ; KNU10: https://www.knu10.or.kr/ ; DSC: https://www.dscu.ac.kr/ ; CAU 공유대학플랫폼: https://mportal.cau.ac.kr/system/share/plf/index.do
- 국민대: https://www.kookmin.ac.kr/comm/menu/user/b1c11e2683208a164edc4e07ffa80c02/content/index.do ; http://sw.kookmin.ac.kr/ ; 숭실대 (via 홍익): https://www.hongik.ac.kr/kr/newscenter/notice.do?mode=view&articleNo=139418&noCat=500 ; 순천향 (via 백석): https://www.bu.ac.kr/bbs/web/788/50191/artclView.do

미검증: 국민대의 현재 SW중심대학 지원 상태, 국민대/숭실대 학점교류 협정 전체 목록 (숭실대 공식 PDF 암호 잠김).
