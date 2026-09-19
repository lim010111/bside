# Bside 서비스 구성도 생성 프롬프트

생성 방식: 내장 `image_gen` 도구. 최초 생성 후 배경·HTTPS 연결선 보정.

기준: 현재 작업 트리의 `server/app/main.py`, `server/app/routers/v1.py`, `server/app/recommendations.py`, `server/app/push.py`, `server/compose.yaml`, Android 네이티브 계층, `web/src/discovery-controller.js`, `docs/deployment.md`. 색상은 `pitch/deck.html`을 따름.

```text
Use case: infographic-diagram
Asset type: One presentation-ready service architecture image for the existing Bside project.
Primary request: Create a clear, polished Korean architecture diagram titled "Bside 서비스 구성도", faithfully showing the currently implemented Android BLE discovery, FastAPI backend, Redis persistence, asynchronous AI recommendations, and Firebase push notifications. Generate a single wide 16:9 high-resolution image with sharp readable Korean typography.

Style/medium: Flat technical infographic for a hackathon presentation, elegant and restrained. Match the repository's existing presentation palette: white #FFFFFF background, warm off-white #F6F4F1 panels, charcoal #1F1F24 text, warm gray #E4E1DC outlines, muted amber #B45309 primary accents. Small line icons for phone, Bluetooth, server, database and notifications, used only to identify components. No invented logo, no 3D, no decorative gradients. Korean sans-serif typography similar to Pretendard or Wanted Sans. Generous whitespace, large text, consistent padding and line weights.

Composition: Header at top, three architectural zones across the middle, a concise explanatory footer at bottom. The client zone is on the left, the backend zone in the center, and external services on the right. This left-to-right layout represents network boundaries. Use clear container boundaries, orthogonal connectors and arrowheads. Never run lines through text. Architecture dominates the canvas; decorative elements are minimal.

Text and components (render all quoted Korean and English labels verbatim; do not render the English instructions):

HEADER:
Title: "Bside 서비스 구성도"
Subtitle: "BLE 근접 발견 · AI 추천 · 바로 1:1 채팅"

LEFT ZONE — container title "Android 앱":
At the top of this container, show two simple small Android phone silhouettes labeled "사용자 A" and "사용자 B", connected by a short bidirectional radio link labeled "BLE 임시 ID". They represent two installations of the SAME client architecture below, not different app types.
Below them, show a clean stacked app architecture shared by both installations:
UI box title "React · Vite"
UI box text "자기소개·교류 의도 / 주변 목록 / 채팅"
Thin bridge strip label "Capacitor 브리지"
Native box title "Kotlin 네이티브"
Native box text on two lines "BLE 광고·스캔 / 관측 보고" and "설치 자격 저장 / 알림 수신"
A concise small annotation inside the client zone: "BLE에는 임시 ID만 전송"
The phones must not appear to send chat messages over their BLE radio link.

CENTER ZONE — outer container title "서버 · OCI"
Small infrastructure subtitle "Docker Compose: API + Redis"
Within this server zone:
Small top gateway box "Nginx · HTTPS" (Nginx is the host gateway, not a Compose service).
A large middle "FastAPI" box with three modestly separated functions:
"설치 인증·프로필"
"발견 관측·추천 처리"
"1:1 대화·메시지"
Within the FastAPI box or immediately beneath its functions, a small contained strip "AI 비동기 평가". This is an in-process background task, NOT an independent worker service.
At the bottom inside this zone, one "Redis" storage component with text on two lines:
"사용자·프로필·대화·메시지"
"임시 ID·관측·추천 캐시"
Small persistence label "AOF + 영속 볼륨".
Connect Nginx bidirectionally with FastAPI; connect FastAPI bidirectionally with Redis.

RIGHT ZONE — title "외부 서비스":
Upper service box:
"AI 추천"
"Claude Haiku 4.5"
"양쪽 자기소개·교류 의도 평가"
"추천 순서·이유 생성"
Connect the FastAPI AI strip bidirectionally to this AI service box. Small connector label "비동기 평가".
The AI produces evaluations based on provided text; it does not discover users or authorize conversations.
Lower service box:
"Firebase FCM"
"새 메시지·추천 알림"
Draw a one-way arrow from FastAPI to FCM. Draw a dashed one-way notification path FROM FCM TO the Android Kotlin box, routed through whitespace beneath the architectural containers. Label the return path "푸시 알림". FCM is notification delivery, not the source of stored chat messages.

CLIENT–SERVER CONNECTION:
Draw a clear bidirectional connection between the Android app container and Nginx gateway with the label "HTTPS API".
Use a modest, readable annotation near this connection: "프로필·관측 / 추천·메시지".
The native layer handles BLE observation reporting; the React layer handles profile/chat UI and API polling. If an extra connector is needed, use a clean shared app-side connection rather than crossed arrows.

FOOTER:
A slim, uncluttered strip containing these two exact statements:
"주변 목록 먼저 표시 → AI 평가 후 추천 갱신"
"거리 이탈·발견 OFF 뒤에도 기존 대화 유지"

Accuracy constraints: Android clients use internet HTTPS for profiles, recommendations and all chat; BLE only advertises and scans temporary IDs. The server owns authentication, ID resolution, discovery validity and conversation permissions. Redis stores persistent user/conversation/message data as well as temporary discovery and AI cache data. API responses return the nearby list without waiting for the LLM, then the app fetches updated recommendations. AI and FCM are external dependencies called by the backend. No browser-only BLE, no iOS, no QR/event rooms, no acceptance step, no BLE chat, no GPS, no WebSocket or SSE, no separate Celery worker, no invented microservices, no cloud vendor services beyond the ones named. Do not put secret keys, host addresses, example personal profiles, deployment status claims or performance benchmarks on the diagram. All labels legible, all text fully contained, no tiny footnotes, no cropped edges, no watermark.
```

## 보정 프롬프트

```text
Use case: precise-object-edit
Asset type: Bside service architecture diagram for a presentation.
Input image: the supplied PNG is the edit target.
Primary request: Fix the background and the HTTPS connector only. Preserve the existing diagram, all Korean and English text exactly, typography, warm neutral palette, all components, panel positions, icons, and the BLE, AI, Redis and FCM connections.

1. The current PNG has transparency in the background. Replace ALL transparent and partially transparent background with a completely SOLID OPAQUE PURE WHITE background (#FFFFFF). The entire final rectangular image must be opaque, including every margin, all space between panels, the title background and behind connector labels. Do not perform background removal. Do not export a cutout. This is a white presentation slide, not a transparent asset. Keep charcoal title text fully legible on white.
2. The bidirectional connector labeled "HTTPS API" must connect the Android app boundary to the left edge of the "Nginx · HTTPS" gateway box in the server panel, using a tidy elbow connector in the gutter as necessary. It should not enter FastAPI directly. Keep "프로필·관측 / 추천·메시지" near that connector without overlap.

Everything else must remain unchanged, including all text, panel geometry, native BLE functions, FastAPI/Redis links, the AI service box, Firebase FCM and its dashed return notification path, and both footer statements. No new elements, no extra text, no watermark. Output a sharp fully opaque white 16:9 diagram.
```
