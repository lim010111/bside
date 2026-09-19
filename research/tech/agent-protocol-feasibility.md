# 에이전트 간 협상 MVP 기술 검증 (조사 시점 2026-09-19)

미검증 항목: HyperCLOVA X 원화 단가 (네이버 포털 가격 탭이 JS 렌더링이라 수집 실패). 나머지는 출처 있음.

참고: 코쓱톤은 ai.cs.kookmin.ac.kr 통합 게이트웨이(OpenAI 호환)로 크레딧을 주므로, 아래 (d)는 게이트웨이 안에서 어떤 모델을 고를지 판단용. 또한 (e)의 빌드 순서는 48시간 기준 원문이며, 코쓱톤은 약 21시간이라 압축이 필요하다.

## (a) 프로토콜 현황

| Protocol | Maintainer | Version / date | SDKs | Best sample | Demo fit |
|---|---|---|---|---|---|
| **A2A (Agent2Agent)** | Linux Foundation → Agentic AI Foundation (AAIF) growth-stage project since 2026-08-27 | Spec **v1.0.0** (official blog: 2026-03-12; LF one-year press release 2026-04-09). Bindings: JSON-RPC, gRPC, HTTP+JSON/REST. Task states incl. `INPUT_REQUIRED`; `contextId` for multi-turn; extensions via URI; Signed Agent Cards | `a2a-sdk` **1.1.4** (PyPI, 2026-09-18, Py≥3.10, extras `http-server`, `grpc`); `@a2a-js/sdk` **v1.2.0** (2026-09-18); Java, Go (`a2a-go/v2`), .NET | [a2a-samples](https://github.com/a2aproject/a2a-samples) (1.8k★): `any_agent_adversarial_multiagent` (two LLM agents in a multi-turn A2A duel), `number_guessing_game` (3 agents, multi-turn, no LLM) | **5** |
| **MCP** | Anthropic / AAIF | Spec **2026-07-28**: stateless (no session/initialize), server-initiated sampling/elicitation replaced by **MRTR** (`resultType: "input_required"`), **Tasks moved to extension** `io.modelcontextprotocol/tasks`; Roots/Sampling/Logging deprecated. Roadmap 2026-08-22: "agentic messaging primitives", agent identity — no peer-to-peer agent messaging, no A2A merge | python-sdk / typescript-sdk | [Changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) | **3** (tool-calling client→server; you'd fake "negotiation" as a tool) |
| **IBM ACP / BeeAI** | merged into A2A 2025-08-29; BeeAI runs on A2A | n/a | n/a | — | use A2A |
| **ANP (Agent Network Protocol)** | ANP open-source community (CN-led) | ANP 1.1 line; AgentConnect SDKs 0.9.3; release 2026-09-12; did:wba identity | AgentConnect | [repo](https://github.com/agent-network-protocol/AgentNetworkProtocol) | **2** (less recognizable to judges) |
| Newer 2026 | No replacement protocol. Consolidation instead: AAIF (MCP, goose, AGENTS.md, now A2A; 250+ members by Aug 2026). AP2 (payments) irrelevant here | | | | |

**Verdict:** A2A is the practical choice — two `a2a-sdk` servers on two laptops, agent cards at `/.well-known/agent-card.json`, one `contextId` per negotiation, `INPUT_REQUIRED` for human approval. Judges recognize "A2A + MCP".

## (b) 프레임워크 적합도

| Framework | Package (latest) | Two independent agents over network? | Closest sample |
|---|---|---|---|
| **Google ADK** | `google-adk` 2.9.2 (2026-09-18), `pip install google-adk[a2a]` | **Best**: `to_a2a(root_agent, port=8001)` → uvicorn; consume with `RemoteA2aAgent`; `adk api_server --a2a`; auto agent card | [adk.dev/a2a/quickstart-exposing](https://adk.dev/a2a/quickstart-exposing/), `airbnb_planner_multiagent` (host + 2 remotes + web UI) |
| **Plain a2a-sdk** (any LLM inside) | `a2a-sdk` 1.1.4 | Best for control: subclass `AgentExecutor`, `DefaultRequestHandler`, `InMemoryTaskStore` | `helloworld`, `any_agent_adversarial_multiagent` |
| **LangGraph** | `langgraph` Agent Server exposes `/a2a/{assistant_id}`, card at `/.well-known/agent-card.json?assistant_id=`; works with `langgraph dev` (Python) | Good; A2A v1.0 JSON-RPC + v0.3 names | [langchain-samples/A2A-langgraph](https://github.com/langchain-samples/A2A-langgraph) (14★, two agents, 3 rounds) |
| **CrewAI** | `pip install 'crewai[a2a]'`; `A2AClientConfig(endpoint, max_turns=10)` / `A2AServerConfig` | Good but heavy for a short hackathon | [docs](https://docs.crewai.com/en/learn/a2a-agent-delegation) |
| **Microsoft Agent Framework** | Python `agent-framework` + `agent-framework-a2a` 1.0.0b260918 (**pre-release**); .NET `Microsoft.Agents.AI.Hosting.A2A.AspNetCore` | OK; Azure/Foundry-centric setup | [Host agents with A2A](https://learn.microsoft.com/en-us/agent-framework/integrations/a2a) |
| **OpenAI Agents SDK** | `openai-agents` 0.22.3 (2026-09-17) | Handoffs are **in-process only**; MCP yes, A2A no → wrap in a2a-sdk yourself | [handoffs](https://openai.github.io/openai-agents-python/handoffs/) |
| **Claude Agent SDK** | `claude-agent-sdk` / `@anthropic-ai/claude-agent-sdk` | Subagents in-process; MCP client; no A2A server → fine as the "brain" inside an `AgentExecutor`, not as transport | [quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart) |

## (c) 참고 레포 (협상·일정 조율 에이전트)

- [a2aproject/a2a-samples](https://github.com/a2aproject/a2a-samples) 1.8k★ — `any_agent_adversarial_multiagent`: attacker vs defender, multi-turn over A2A, Gemini key, traces to `out/`. `number_guessing_game`: 3 agents, task-referencing multi-turn, zero LLM (great skeleton). `airbnb_planner_multiagent`: host + remotes + web UI.
- [a2aproject/a2a-inspector](https://github.com/a2aproject/a2a-inspector) 490★ — card validation, live chat, **raw JSON-RPC console** (put it on the projector).
- [langchain-samples/A2A-langgraph](https://github.com/langchain-samples/A2A-langgraph) 14★ — two GPT-4o-mini LangGraph agents converse via A2A, Python+TS.
- [vinid/NegotiationArena](https://github.com/vinid/NegotiationArena) 85★ (ICML 2024) — LLM-vs-LLM negotiation games; prompt patterns.
- [SafeRL-Lab/AgenticPay](https://github.com/SafeRL-Lab/AgenticPay) 48★ — buyer/seller multi-issue contract negotiation benchmark.
- [ashwin87gre/llm_negotiation](https://github.com/ashwin87gre/llm_negotiation) — LangGraph two-party offers, `--max-rounds`, validated moves with retries, **HTML timeline viewer** (copy this transcript pattern).
- [simon5530/agent-liaison](https://github.com/simon5530/agent-liaison) — scheduling with policy-bounded negotiation, `CANDIDATE` (tentative) holds, human escalation, audit log.
- [hunterZh37/agentic-scheduling](https://github.com/hunterZh37/agentic-scheduling) 4★ — Claude tool-calling scheduler; agent↔agent negotiation is "upcoming" only.
- [inference-gateway/google-calendar-agent](https://github.com/inference-gateway/google-calendar-agent) — A2A server for Google Calendar.
- Korean: no Korean-language agent-vs-agent negotiation repo surfaced; Korean coverage is explainers ([SK AX](https://www.skax.co.kr/insight/trend/3314)).

## (d) LLM 선택지와 크레딧 (USD per 1M tokens, input/output)

| Provider | Models (Korean OK) | Price | Free credits / student programs (2026) |
|---|---|---|---|
| **Claude** | Haiku 4.5 $1/$5; **Sonnet 5 $2/$10**; Opus 5 $5/$25; Fable 5.1 $10/$50; cache hits 0.1x; batch −50% | [official](https://platform.claude.com/docs/en/about-claude/pricing) | Small free credits on signup. Claude Campus closed for Fall 2026 |
| **OpenAI** | gpt-5.6-luna $0.20/$1.20; gpt-5.4-mini $0.75/$4.50; gpt-5.6-terra $2/$12; gpt-5.6-sol $4/$20; gpt-6-astra $10/$50 | [official](https://developers.openai.com/api/docs/pricing) | Hackathon support needs ≥1 month lead |
| **Gemini** | 3.8/3.7/3.6 Flash $0.75/$3.75; 3.5 Flash $1.50/$9; 3.5 Flash-Lite $0.30/$2.50; 3.1 Pro $2/$12 | [official](https://ai.google.dev/gemini-api/docs/pricing) | **Free tier on 3.x Flash and 2.5 models** (rate-limited) |
| **Upstage Solar** | Solar Pro 4 list $0.30/$1.20, **promo $0.09/$0.36 (Sep 11–Oct 10, 2026)**; Pro 3 $0.15/$0.60 | [official](https://www.upstage.ai/pricing/api) | **$10 credit on signup (3 mo)** |
| **NAVER HyperCLOVA X** | HCX-007 (hybrid reasoning, function calling, structured output), HCX-005, HCX-DASH-002 | KRW rates not verified | New-customer 100,000 KRW / 3 mo (payment method required) |
| **Kakao Kanana** | Kanana-o API closed beta ended; Kanana-2 32B-A3B open weights | — | Self-host only; skip |

**Recommendation:** fast/cheap model for negotiation turns (Gemini Flash or Claude Haiku 4.5 via the gateway), stronger model (Claude Sonnet 5) for the final meeting-plan write-up. Keep the model name in an env var.

## (e) 최소 아키텍처

**Components**
1. **Profile store** — JSON per user: skills, role prefs, availability buckets, hard constraints, and a *disclosure policy* (what may leave the machine).
2. **Agent runtime per user** — `a2a-sdk` Starlette server; `AgentExecutor` = deterministic **move validator** + one LLM call/turn (structured output: `{action: PROPOSE|COUNTER|ACCEPT|REJECT|ASK, roles, slots, rationale}` in a `DataPart`, free text only for display).
3. **Transport** — A2A JSON-RPC over LAN/hotspot; card at `/.well-known/agent-card.json`; one `contextId` per negotiation; hard cap **8 turns**.
4. **Human approval** — final `ACCEPT` returns task `INPUT_REQUIRED`; approval page (FastAPI + SSE) resolves it.
5. **Meeting-plan generator** — deterministic slot intersection + LLM agenda → `.ics`.
6. **Negotiation board** — both agents append every in/out A2A message to JSONL → SSE → two-column page with state badges, agreement score, and a "raw JSON-RPC" toggle (or run a2a-inspector beside it).

**Mock:** auth (static bearer), calendars (JSON), discovery (hardcode peer URL), signed cards, DB, streaming. **Build:** validator, executor, board, approval, `.ics`.

**Build order (48h original):** H0–4 schema + validator → H4–10 a2a servers from `helloworld`, two agents on one laptop → H10–16 loop, turn cap, logging → H16–24 board + approval → H24–30 meeting plan + Korean prompt polish → H30–36 two laptops → H36–44 failure handling, scripted fallback transcript, rehearsals → H44–48 buffer.

**Risks → mitigations**
- **Latency:** small model, ≤300 output tokens, prompt caching, temperature 0.2, "typing" indicator; ≤8 turns.
- **Agreeing to disallowed things:** validator runs on send and receive; enum-constrained actions; final agreement re-checked against both profiles; human gate before commit.
- **Prompt injection between agents:** inbound text is data — quoted, never in system prompt; act only on `DataPart` JSON; no tools during negotiation; flag instruction-like text on the board.
- **Profile privacy:** share derived facts (buckets/tags) not raw calendar; per-turn minimum disclosure; redact PII on board.
- **Venue network / quotas:** phone hotspot; fallback both agents on one laptop; recorded transcript as backup.

## (f) Sources
[A2A v1.0 post](https://a2a-protocol.org/latest/blog/) · [A2A spec](https://a2a-protocol.org/latest/specification/) · [LF press 2026-04-09](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year) · [A2A joins AAIF (Forbes)](https://www.forbes.com/sites/janakirammsv/2026/08/19/agent2agent-joins-the-agentic-ai-foundation-alongside-mcp/) · [AAIF formation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) · [a2a-sdk PyPI](https://pypi.org/project/a2a-sdk/) · [a2a-js releases](https://github.com/a2aproject/a2a-js/releases) · [MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) · [MCP roadmap](https://blog.modelcontextprotocol.io/posts/mcp-roadmap/) · [ACP→A2A](https://lfaidata.foundation/communityblog/2025/08/29/acp-joins-forces-with-a2a-under-the-linux-foundations-lf-ai-data/) · [ANP](https://github.com/agent-network-protocol/AgentNetworkProtocol) · [ADK A2A](https://adk.dev/a2a/quickstart-exposing/) · [google-adk PyPI](https://pypi.org/project/google-adk/) · [LangGraph A2A](https://docs.langchain.com/langsmith/server-a2a) · [CrewAI A2A](https://docs.crewai.com/en/learn/a2a-agent-delegation) · [MS Agent Framework A2A](https://learn.microsoft.com/en-us/agent-framework/integrations/a2a) · [openai-agents PyPI](https://pypi.org/project/openai-agents/) · [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) · [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [OpenAI pricing](https://developers.openai.com/api/docs/pricing) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Upstage pricing](https://www.upstage.ai/pricing/api) · [CLOVA Studio models](https://guide.ncloud-docs.com/docs/clovastudio-model) · [Kanana-2](https://www.kakaocorp.com/page/detail/11904)
