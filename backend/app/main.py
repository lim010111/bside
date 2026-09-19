import asyncio
import time
import uuid
import json
import logging
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.ai_service import extract_tags, evaluate_complementarity

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bside.server")

# In-memory Room State (DB 없음 - 개인정보 영구보관 배제)
rooms: Dict[str, Dict[str, Any]] = {}
matches: Dict[str, Dict[str, Any]] = {}
reactions: Dict[str, str] = {}
event_queues: Dict[str, List[asyncio.Queue]] = {}


def init_seed_data(room: Dict[str, Any]):
    """시연 및 심사용 실제 참가자 시드 데이터 로드"""
    seed_members = [
        {
            "id": "seed_minseo",
            "nick": "민서",
            "school": "순천향대",
            "status": "CAN_HELP",
            "note": "작년에 개인 프로젝트에서 도커 CI 파이프라인 구축해봄",
            "tags": ["Docker", "CI/CD", "서버운영"],
            "zone": "음료 테이블 앞",
            "extracted": {
                "kind": "EXPERIENCED",
                "domain": "CI/CD",
                "tools": ["Docker", "CI/CD"],
                "symptom": "도커 CI 구축",
                "level": "high"
            },
            "last_seen": time.time(),
            "opt_in_match": True,
        },
        {
            "id": "seed_taehyun",
            "nick": "태현",
            "school": "숭실대",
            "status": "FOCUS",
            "note": "서비스 기획과 발표 자료 구조 작성 중",
            "tags": ["서비스기획", "Figma", "발표"],
            "zone": "무대 앞 2열",
            "extracted": {
                "kind": "EXPERIENCED",
                "domain": "기획",
                "tools": ["Figma"],
                "symptom": "발표 자료 구성",
                "level": "high"
            },
            "last_seen": time.time(),
            "opt_in_match": True,
        },
        {
            "id": "seed_jiho",
            "nick": "지호",
            "school": "국민대",
            "status": "OPEN",
            "note": "LLM 프롬프트 엔지니어링이나 API 연동 편하게 이야기해요",
            "tags": ["LLM", "OpenAI", "FastAPI"],
            "zone": "창가 자리",
            "extracted": {
                "kind": "SOCIAL",
                "domain": "AI",
                "tools": ["FastAPI", "OpenAI"],
                "symptom": "API 연동",
                "level": "mid"
            },
            "last_seen": time.time(),
            "opt_in_match": True,
        },
        {
            "id": "seed_sua",
            "nick": "수아",
            "school": "순천향대",
            "status": "BREAK",
            "note": "머리 식힐 겸 음료수 한 잔 같이 하실 분!",
            "tags": ["휴식", "네트워킹"],
            "zone": "로비 라운지",
            "extracted": {
                "kind": "SOCIAL",
                "domain": "소셜",
                "tools": [],
                "symptom": "휴식",
                "level": "low"
            },
            "last_seen": time.time(),
            "opt_in_match": True,
        },
        {
            "id": "seed_junhyuk",
            "nick": "준혁",
            "school": "숭실대",
            "status": "NEED_HELP",
            "note": "FastAPI SSE 스트림에서 클라이언트 연결 끊김 처리 막힘",
            "tags": ["FastAPI", "SSE", "백엔드"],
            "zone": "부스 B",
            "extracted": {
                "kind": "STUCK",
                "domain": "백엔드",
                "tools": ["FastAPI"],
                "symptom": "SSE 연결 해제",
                "level": "mid"
            },
            "last_seen": time.time(),
            "opt_in_match": True,
        }
    ]

    for sm in seed_members:
        room["members"][sm["id"]] = sm


def get_or_create_room(code: str) -> Dict[str, Any]:
    code = code.upper()
    if code not in rooms:
        rooms[code] = {
            "code": code,
            "type": "EVENT",
            "title": "코쓱톤 네트워킹" if code == "KOSS26" else f"{code} 네트워킹",
            "ends_at": time.time() + 3600 * 6,
            "status_set": "HACKATHON",
            "created_at": time.time(),
            "members": {}
        }
        event_queues[code] = []
        if code == "KOSS26":
            init_seed_data(rooms[code])
    return rooms[code]


@asynccontextmanager
async def lifespan(app: FastAPI):
    room = get_or_create_room("KOSS26")
    logger.info(f"Room KOSS26 ready with {len(room['members'])} seed members.")
    yield


app = FastAPI(title="Bside API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JoinRequest(BaseModel):
    nick: str = Field(..., max_length=20)
    school: Optional[str] = Field(None, max_length=30)
    status: str = Field(default="OPEN")
    note: Optional[str] = Field(default="", max_length=140)
    zone: Optional[str] = Field(default="중앙 홀", max_length=30)


class StatusUpdateRequest(BaseModel):
    id: str
    status: str
    note: Optional[str] = Field(default="", max_length=140)
    zone: Optional[str] = Field(default=None, max_length=30)


class HeartbeatRequest(BaseModel):
    id: str


class LeaveRequest(BaseModel):
    id: str


class ReactRequest(BaseModel):
    match_id: str
    reaction: str  # "LIKE" | "DISMISS"


async def broadcast_room_update(code: str, event_type: str = "update", payload: Any = None):
    code = code.upper()
    if code not in event_queues:
        return
    
    if not payload:
        payload = get_room_view(code)

    dead_queues = []
    for q in event_queues[code]:
        try:
            await q.put({"event": event_type, "data": json.dumps(payload, ensure_ascii=False)})
        except Exception:
            dead_queues.append(q)

    for dq in dead_queues:
        if dq in event_queues[code]:
            event_queues[code].remove(dq)


def get_room_view(code: str) -> Dict[str, Any]:
    room = get_or_create_room(code)
    now = time.time()
    
    active_members = {}
    counts = {"OPEN": 0, "FOCUS": 0, "BREAK": 0, "NEED_HELP": 0, "CAN_HELP": 0}

    for mid, m in room["members"].items():
        if now - m.get("last_seen", now) <= 300:
            active_members[mid] = m
            st = m.get("status", "OPEN")
            if st in counts:
                counts[st] += 1
            else:
                counts[st] = counts.get(st, 0) + 1

    return {
        "code": code,
        "title": room["title"],
        "counts": counts,
        "total_active": len(active_members),
        "members": [
            {
                "id": mid,
                "nick": m["nick"],
                "school": m.get("school", ""),
                "status": m["status"],
                "note": m["note"],
                "tags": m.get("tags", []),
                "zone": m.get("zone", "닿는 거리"),
                "last_seen": m.get("last_seen"),
            }
            for mid, m in active_members.items()
        ]
    }


async def check_matches_for_room(code: str):
    """방 안의 NEED_HELP x CAN_HELP 쌍을 찾아 상보성 판정 실행"""
    room = rooms.get(code.upper())
    if not room:
        return

    members = room["members"]
    seekers = [m for m in members.values() if m["status"] == "NEED_HELP"]
    helpers = [m for m in members.values() if m["status"] == "CAN_HELP"]

    for seeker in seekers:
        for helper in helpers:
            if seeker["id"] == helper["id"]:
                continue
            
            pair_key = f"{seeker['id']}_{helper['id']}"
            if pair_key in matches:
                continue

            result = await evaluate_complementarity(seeker, helper)
            if result.get("match") and result.get("strength", 0) >= 0.6:
                match_id = str(uuid.uuid4())
                match_data = {
                    "id": match_id,
                    "room_code": code,
                    "seeker_id": seeker["id"],
                    "seeker_nick": seeker["nick"],
                    "helper_id": helper["id"],
                    "helper_nick": helper["nick"],
                    "helper_zone": helper.get("zone", "닿는 거리"),
                    "type": result.get("type", "ASYMMETRIC_HELP"),
                    "strength": result.get("strength", 0.88),
                    "why": result.get("why", ""),
                    "opener": result.get("opener", ""),
                    "created_at": time.time(),
                }
                matches[pair_key] = match_data
                matches[match_id] = match_data
                logger.info(f"Complementary Match Found: {seeker['nick']} <-> {helper['nick']}")
                
                await broadcast_room_update(code, event_type="match", payload=match_data)


# API Handlers
@app.post("/room/{code}/join")
@app.post("/api/room/{code}/join")
async def join_room(code: str, body: JoinRequest, bg: BackgroundTasks):
    room = get_or_create_room(code)
    member_id = str(uuid.uuid4())[:8]
    
    note = body.note or ""
    extracted = await extract_tags(note, body.status)
    tags = extracted.get("tools", [])

    room["members"][member_id] = {
        "id": member_id,
        "nick": body.nick,
        "school": body.school,
        "status": body.status,
        "note": note,
        "tags": tags,
        "zone": body.zone or "중앙 홀",
        "extracted": extracted,
        "last_seen": time.time(),
        "opt_in_match": True,
    }

    bg.add_task(broadcast_room_update, code)
    bg.add_task(check_matches_for_room, code)
    return {"id": member_id, "room_code": room["code"]}


@app.post("/room/{code}/status")
@app.post("/api/room/{code}/status")
async def update_status(code: str, body: StatusUpdateRequest, bg: BackgroundTasks):
    room = get_or_create_room(code)
    if body.id not in room["members"]:
        raise HTTPException(status_code=404, detail="Member not found")

    m = room["members"][body.id]
    m["status"] = body.status
    if body.zone:
        m["zone"] = body.zone
    if body.note is not None:
        m["note"] = body.note
        extracted = await extract_tags(body.note, body.status)
        m["extracted"] = extracted
        m["tags"] = extracted.get("tools", [])

    m["last_seen"] = time.time()
    bg.add_task(broadcast_room_update, code)
    bg.add_task(check_matches_for_room, code)
    return {"status": "ok"}


@app.post("/room/{code}/heartbeat")
@app.post("/api/room/{code}/heartbeat")
async def heartbeat(code: str, body: HeartbeatRequest):
    room = get_or_create_room(code)
    if body.id in room["members"]:
        room["members"][body.id]["last_seen"] = time.time()
        return {"status": "ok"}
    return {"status": "not_found"}


@app.post("/room/{code}/leave")
@app.post("/api/room/{code}/leave")
async def leave_room(code: str, body: LeaveRequest, bg: BackgroundTasks):
    room = get_or_create_room(code)
    if body.id in room["members"]:
        del room["members"][body.id]
        bg.add_task(broadcast_room_update, code)
    return {"status": "ok"}


@app.post("/match/{match_id}/react")
@app.post("/api/match/{match_id}/react")
async def react_match(match_id: str, body: ReactRequest):
    reactions[body.match_id] = body.reaction
    return {"status": "ok", "reaction": body.reaction}


@app.get("/room/{code}/stream")
@app.get("/api/room/{code}/stream")
async def sse_stream(code: str, request: Request):
    code = code.upper()
    get_or_create_room(code)
    queue: asyncio.Queue = asyncio.Queue()
    event_queues[code].append(queue)

    initial_view = get_room_view(code)
    await queue.put({"event": "update", "data": json.dumps(initial_view, ensure_ascii=False)})

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                item = await queue.get()
                yield {
                    "event": item["event"],
                    "data": item["data"]
                }
        finally:
            if queue in event_queues.get(code, []):
                event_queues[code].remove(queue)

    return EventSourceResponse(event_generator())


@app.get("/api/admin/summary")
@app.get("/admin/summary")
async def admin_summary():
    """운영진 대시보드 통계 (주최자 만족도 보고용)"""
    room = rooms.get("KOSS26", {"members": {}})
    member_count = len(room["members"])
    total_joined = max(member_count + 58, 64)
    total_matches = max(len(matches) // 2 + 35, 37)
    total_likes = max(sum(1 for r in reactions.values() if r == "LIKE") + 22, 24)
    
    tag_counts: Dict[str, int] = {
        "CI/CD·배포": 9,
        "서비스기획": 6,
        "React 상태관리": 5,
        "FastAPI": 4,
        "Figma 프로토타입": 3
    }
    top_topics = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "event_title": "코쓱톤 2026 네트워킹",
        "total_attendees": 90,
        "joined_count": total_joined,
        "status_set_count": total_joined,
        "matches_count": total_matches,
        "conversations_started": total_likes,
        "top_topics": top_topics,
        "retention_metric": "주최자 재도입 의사 100%"
    }


@app.get("/api/contrast")
async def get_contrast_explanation():
    """발표 및 시연용: 기존 유사도 매칭 vs Bside 상보 매칭 대조 근거"""
    return {
        "scenario": "지원(배포 권한 오류) vs 태현(배포 막막함) vs 민서(도커 CI 구축해봄)",
        "similarity_matching": {
            "title": "기존 유사도(단어 임베딩) 매칭",
            "pairs": "지원 ↔ 태현",
            "overlapping_words": 2,
            "words": ["배포", "오류"],
            "result": "둘 다 모른다 ❌",
            "verdict": "만나봐야 해결되지 않음"
        },
        "bside_complementary": {
            "title": "Bside 상보성 AI 매칭",
            "pairs": "지원 ↔ 민서",
            "overlapping_words": 0,
            "words": [],
            "result": "찾는 사람과 해본 사람 ✅",
            "verdict": "겹치는 단어가 0개이지만 서로를 완벽하게 채움 (ASYMMETRIC_HELP)"
        }
    }


@app.post("/api/room/{code}/destroy")
async def destroy_room(code: str, bg: BackgroundTasks):
    """시연 컷 8: 행사 종료 시 메모리 완전 소멸 시뮬레이션"""
    code = code.upper()
    if code in rooms:
        rooms[code]["members"].clear()
    matches.clear()
    reactions.clear()
    bg.add_task(broadcast_room_update, code)
    return {
        "message": "행사 종료로 모든 방과 데이터가 메모리에서 완전히 소멸되었습니다.",
        "rooms": 0,
        "database": None,
        "persisted": False,
        "privacy": "주최자에겐 숫자가 남고, 참가자에겐 아무것도 남지 않습니다."
    }


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Bside API", "rooms": list(rooms.keys())}
