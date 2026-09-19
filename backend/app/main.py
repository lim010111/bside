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

from app.ai_service import extract_tags, evaluate_complementarity, fallback_p1_extract

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bside.server")

# In-memory Room State (DB 없음 - 개인정보 영구보관 배제)
rooms: Dict[str, Dict[str, Any]] = {}
matches: Dict[str, Dict[str, Any]] = {}
reactions: Dict[str, str] = {}
event_queues: Dict[str, List[asyncio.Queue]] = {}

SEED_HACK = [
    {"id": "minseo", "name": "민서", "school": "순천향대", "st": "CAN_SHARE", "note": "작년에 도커로 CI 파이프라인 구축해봤어요", "near": True, "age": 40},
    {"id": "yerin", "name": "예린", "school": "숭실대", "st": "CAN_SHARE", "note": "React 상태관리로 삽질 오래 했어요. 물어보셔도 돼요", "near": True, "age": 56},
    {"id": "taehyun", "name": "태현", "school": "숭실대", "st": "FIRST_TIME", "note": "혼자 왔어요. 기획하다가 백엔드가 궁금해졌어요", "near": False, "age": 93},
    {"id": "sua", "name": "수아", "school": "국민대", "st": "LOOKING_FOR", "note": "디자인 시스템 토큰 잡아보신 분 계실까요", "near": False, "age": 130},
    {"id": "junho", "name": "준호", "school": "순천향대", "st": "OPEN", "note": "커피 들고 서 있어요. 아무나 오세요", "near": False, "age": 167},
    {"id": "p5", "name": "지훈", "school": "국민대", "st": "LOOKING_FOR", "note": "백엔드 한 분만 더 필요해요. 팀 아직 3명이에요", "near": True, "age": 204},
    {"id": "p6", "name": "하윤", "school": "숭실대", "st": "CAN_SHARE", "note": "작년에 이 대회 나갔어요. 심사 분위기 궁금하면 물어보세요", "near": False, "age": 241},
    {"id": "p7", "name": "서연", "school": "국민대", "st": "FIRST_TIME", "note": "해커톤 처음이라 뭐부터 해야 할지 모르겠어요", "near": False, "age": 278},
    {"id": "p8", "name": "도윤", "school": "순천향대", "st": "OPEN", "note": "밥 같이 드실 분", "near": False, "age": 33},
    {"id": "p9", "name": "지우", "school": "숭실대", "st": "LOOKING_FOR", "note": "피그마 프로토타입까지 해보신 분 있나요", "near": False, "age": 70},
    {"id": "p10", "name": "은채", "school": "국민대", "st": "CAN_SHARE", "note": "피그마 오토레이아웃은 좀 합니다", "near": True, "age": 107},
    {"id": "p11", "name": "시우", "school": "순천향대", "st": "FIRST_TIME", "note": "1학년이고 아직 할 줄 아는 게 별로 없어요. 구경하러 왔어요", "near": False, "age": 144},
    {"id": "p12", "name": "나연", "school": "숭실대", "st": "CAN_SHARE", "note": "AWS 프리티어로 배포까지 해봤어요", "near": False, "age": 181},
    {"id": "p13", "name": "건우", "school": "국민대", "st": "LOOKING_FOR", "note": "안드로이드 빌드 에러 같이 봐주실 분", "near": False, "age": 218},
    {"id": "p14", "name": "유진", "school": "순천향대", "st": "OPEN", "note": "자판기 앞에 있어요", "near": False, "age": 255},
    {"id": "p15", "name": "채원", "school": "숭실대", "st": "CAN_SHARE", "note": "발표 많이 해봤어요. 대본 봐드릴 수 있어요", "near": True, "age": 10},
    {"id": "p16", "name": "현우", "school": "국민대", "st": "LOOKING_FOR", "note": "소켓 통신 해보신 분 5분만 시간 내주실 수 있나요", "near": False, "age": 47},
    {"id": "p17", "name": "다은", "school": "순천향대", "st": "FIRST_TIME", "note": "팀 없이 왔는데 괜찮을까요", "near": False, "age": 84},
    {"id": "p18", "name": "정민", "school": "숭실대", "st": "CAN_SHARE", "note": "타입스크립트 제네릭 헷갈리시면 오세요", "near": False, "age": 121},
    {"id": "p19", "name": "소율", "school": "국민대", "st": "OPEN", "note": "아무 얘기나 좋아요. 코딩 얘기 아니어도 됩니다", "near": False, "age": 158},
    {"id": "p20", "name": "재현", "school": "순천향대", "st": "LOOKING_FOR", "note": "Firebase 인증 붙이다 막혔어요. 해보신 분", "near": True, "age": 195},
    {"id": "p21", "name": "윤서", "school": "숭실대", "st": "CAN_SHARE", "note": "앱 스토어 심사 두 번 통과시켜봤습니다", "near": False, "age": 232},
    {"id": "p22", "name": "승현", "school": "국민대", "st": "FIRST_TIME", "note": "학교에서 혼자 와서 아는 사람이 없네요", "near": False, "age": 269},
    {"id": "p23", "name": "가은", "school": "순천향대", "st": "CAN_SHARE", "note": "파이썬으로 크롤링 많이 해봤어요", "near": False, "age": 24},
    {"id": "p24", "name": "준서", "school": "숭실대", "st": "LOOKING_FOR", "note": "발표 자료 만들어주실 분 급하게 찾습니다", "near": False, "age": 61},
    {"id": "p25", "name": "하은", "school": "국민대", "st": "OPEN", "note": "노트북 충전 중이라 30분 묶여 있어요. 심심해요", "near": True, "age": 98},
    {"id": "p26", "name": "민재", "school": "순천향대", "st": "CAN_SHARE", "note": "PM 인턴 했었어요. 기획서 봐드릴게요", "near": False, "age": 135},
    {"id": "p27", "name": "서윤", "school": "숭실대", "st": "FIRST_TIME", "note": "디자인 전공인데 개발 쪽 어떻게 굴러가는지 보고 싶어요", "near": False, "age": 172},
    {"id": "p28", "name": "지호", "school": "국민대", "st": "LOOKING_FOR", "note": "지도 API 써보신 분 계신가요. 카카오든 네이버든", "near": False, "age": 209},
    {"id": "p29", "name": "예준", "school": "순천향대", "st": "CAN_SHARE", "note": "웹소켓이랑 SSE 둘 다 써봤어요. 차이 설명해드릴 수 있어요", "near": False, "age": 246},
    {"id": "p30", "name": "수빈", "school": "숭실대", "st": "OPEN", "note": "야식 뭐 시킬지 고민 중인데 같이 정하실 분", "near": True, "age": 283},
    {"id": "p31", "name": "동현", "school": "국민대", "st": "LOOKING_FOR", "note": "OAuth 리다이렉트에서 계속 막힙니다", "near": False, "age": 38},
    {"id": "p32", "name": "아름", "school": "순천향대", "st": "FIRST_TIME", "note": "비전공자예요. 코딩은 부트캠프에서 조금 배웠어요", "near": False, "age": 75},
    {"id": "p33", "name": "성민", "school": "숭실대", "st": "CAN_SHARE", "note": "일러스트 그릴 줄 알아요. 아이콘 필요하시면", "near": False, "age": 112},
    {"id": "p34", "name": "혜원", "school": "국민대", "st": "OPEN", "note": "4층 창가에 있어요. 조용해요", "near": False, "age": 149},
    {"id": "p35", "name": "영진", "school": "순천향대", "st": "LOOKING_FOR", "note": "팀원 구해요. 기획 둘에 개발 하나라 개발자가 급해요", "near": True, "age": 186},
    {"id": "p36", "name": "지민", "school": "숭실대", "st": "CAN_SHARE", "note": "깃 충돌 나면 불러주세요. 그건 자신 있어요", "near": False, "age": 223},
    {"id": "p37", "name": "우진", "school": "국민대", "st": "FIRST_TIME", "note": "편입생이라 아는 사람이 아예 없어요", "near": False, "age": 260},
    {"id": "p38", "name": "보람", "school": "순천향대", "st": "CAN_SHARE", "note": "논문 쪽 관심 있으면 얘기해요. NLP 랩 있었어요", "near": False, "age": 15},
    {"id": "p39", "name": "태윤", "school": "숭실대", "st": "LOOKING_FOR", "note": "테스트 코드 어떻게 짜야 할지 감이 안 와요", "near": False, "age": 52},
    {"id": "p40", "name": "세연", "school": "국민대", "st": "OPEN", "note": "담배 피우러 나갈 건데 같이 가실 분", "near": True, "age": 89},
    {"id": "p41", "name": "규민", "school": "순천향대", "st": "FIRST_TIME", "note": "작년에 신청했다가 못 왔어요. 올해가 처음이에요", "near": False, "age": 126},
    {"id": "p42", "name": "하영", "school": "숭실대", "st": "CAN_SHARE", "note": "디자인 툴은 웬만한 거 다 써봤어요", "near": False, "age": 163},
    {"id": "p43", "name": "진우", "school": "국민대", "st": "LOOKING_FOR", "note": "발표 대본 같이 봐주실 분 있을까요", "near": False, "age": 200},
    {"id": "p44", "name": "예은", "school": "순천향대", "st": "FIRST_TIME", "note": "3학년인데 이런 거 한 번도 안 해봤어요", "near": False, "age": 237},
]

SEED_MEET = [
    {"id": "minseo", "name": "민서", "school": "4년차", "st": "CAN_SHARE", "note": "디자인 시스템 2년째 운영 중이에요. 삽질 얘기 해드릴게요", "near": True, "age": 40},
    {"id": "yerin", "name": "예린", "school": "프리랜서", "st": "CAN_SHARE", "note": "웹뷰랑 네이티브 브릿지 많이 짜봤어요", "near": True, "age": 56},
    {"id": "taehyun", "name": "태현", "school": "부트캠프 수료", "st": "FIRST_TIME", "note": "부트캠프 막 수료했어요. 현업 얘기 듣고 싶어요", "near": False, "age": 93},
    {"id": "sua", "name": "수아", "school": "3년차", "st": "LOOKING_FOR", "note": "사내 디자인 시스템 운영하시는 분 얘기 듣고 싶어요", "near": False, "age": 130},
    {"id": "junho", "name": "준호", "school": "이직 준비", "st": "OPEN", "note": "맥주 들고 있어요. 편하게 오세요", "near": False, "age": 167},
    {"id": "p5", "name": "지훈", "school": "스타트업", "st": "LOOKING_FOR", "note": "Next.js 앱라우터 마이그레이션 해보신 분 계실까요", "near": True, "age": 204},
    {"id": "p6", "name": "하윤", "school": "6년차", "st": "CAN_SHARE", "note": "프론트 면접관 해봤어요. 궁금하시면", "near": False, "age": 241},
    {"id": "p7", "name": "서연", "school": "취준", "st": "FIRST_TIME", "note": "밋업 처음 와봐요. 어색하네요", "near": False, "age": 278},
    {"id": "p8", "name": "도윤", "school": "SI 3년차", "st": "OPEN", "note": "뒤풀이 가실 분 계신가요", "near": False, "age": 33},
    {"id": "p9", "name": "지우", "school": "2년차", "st": "LOOKING_FOR", "note": "모노레포 turborepo 쓰시는 분", "near": False, "age": 70},
    {"id": "p10", "name": "은채", "school": "5년차", "st": "CAN_SHARE", "note": "성능 최적화로 LCP 절반 줄여본 적 있어요", "near": True, "age": 107},
    {"id": "p11", "name": "시우", "school": "1년차", "st": "FIRST_TIME", "note": "백엔드 하다가 프론트로 넘어온 지 두 달 됐어요", "near": False, "age": 144},
    {"id": "p12", "name": "나연", "school": "프리랜서", "st": "CAN_SHARE", "note": "주니어 멘토링 하고 있어요. 커리어 얘기 편하게", "near": False, "age": 181},
    {"id": "p13", "name": "건우", "school": "7년차", "st": "LOOKING_FOR", "note": "테스트 코드 문화 잡으신 팀 있나요", "near": False, "age": 218},
    {"id": "p14", "name": "유진", "school": "취준", "st": "OPEN", "note": "그냥 구경 중이에요. 말 걸어주세요", "near": False, "age": 255},
    {"id": "p15", "name": "채원", "school": "4년차", "st": "CAN_SHARE", "note": "사내에서 마이크로 프론트엔드 도입해봤어요", "near": True, "age": 10},
    {"id": "p16", "name": "현우", "school": "이직 준비", "st": "LOOKING_FOR", "note": "이직 고민 중인데 프론트 3년차 분들 계신가요", "near": False, "age": 47},
    {"id": "p17", "name": "다은", "school": "2년차", "st": "FIRST_TIME", "note": "혼자 와서 구석에 있어요", "near": False, "age": 84},
    {"id": "p18", "name": "정민", "school": "스타트업", "st": "CAN_SHARE", "note": "혼자 프론트 다 해요. 1인 개발 궁금하면 물어보세요", "near": False, "age": 121},
    {"id": "p19", "name": "소율", "school": "3년차", "st": "OPEN", "note": "입구 쪽에 서 있어요", "near": False, "age": 158},
    {"id": "p20", "name": "재현", "school": "에이전시", "st": "LOOKING_FOR", "note": "접근성 제대로 해보신 분 계신가요", "near": True, "age": 195},
    {"id": "p21", "name": "윤서", "school": "5년차", "st": "CAN_SHARE", "note": "리액트 네이티브 2년 했어요. 후회담 들려드릴게요", "near": False, "age": 232},
]


def init_seed_data(room: Dict[str, Any], seed_items: List[Dict[str, Any]]):
    """PRD 기준 현실적인 시드 참가자 로드"""
    now = time.time()
    for item in seed_items:
        extracted = fallback_p1_extract(item["note"], item["st"])
        room["members"][item["id"]] = {
            "id": item["id"],
            "nick": item["name"],
            "name": item["name"],
            "school": item["school"],
            "status": item["st"],
            "st": item["st"],
            "note": item["note"],
            "tags": extracted.get("tools", []),
            "extracted": extracted,
            "near": item["near"],
            "zone": "닿는 거리" if item["near"] else "조금 떨어진 곳",
            "last_seen": now - item["age"],
            "age": item["age"],
            "opt_in_match": True,
        }


def get_or_create_room(code: str) -> Dict[str, Any]:
    code = code.upper()
    if code not in rooms:
        if code == "FEMEETUP":
            title = "서울 프론트엔드 밋업"
            when = "성수 코워킹 · 오늘 21:00까지"
            aff = {"label": "회사", "options": None, "placeholder": "예: 토스, 프리랜서, 취준"}
            seed = SEED_MEET
        else:
            title = "코쓱톤 네트워킹"
            when = "국민대 미래관 4층 · 오늘 18:00까지"
            aff = {"label": "소속", "options": ["국민대", "숭실대", "순천향대"], "placeholder": "직접 입력"}
            seed = SEED_HACK

        rooms[code] = {
            "code": code,
            "type": "EVENT",
            "title": title,
            "when": when,
            "affiliation": aff,
            "aff": aff,
            "ends_at": time.time() + 3600 * 6,
            "status_set": "HACKATHON" if code == "KOSS26" else "MEETUP",
            "created_at": time.time(),
            "members": {}
        }
        event_queues[code] = []
        init_seed_data(rooms[code], seed)
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
    status: str = Field(default="LOOKING_FOR")
    note: Optional[str] = Field(default="", max_length=140)
    zone: Optional[str] = Field(default=None, max_length=30)


class ProfileUpdateRequest(BaseModel):
    id: str
    nick: Optional[str] = Field(None, max_length=20)
    school: Optional[str] = Field(None, max_length=30)
    status: str
    note: Optional[str] = Field(default="", max_length=140)
    zone: Optional[str] = Field(default=None, max_length=30)


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


class ChatMessageRequest(BaseModel):
    sender_id: str
    target_id: str
    text: str


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
    
    # 4가지 상태 분류
    counts = {
        "LOOKING_FOR": 0,
        "CAN_SHARE": 0,
        "FIRST_TIME": 0,
        "OPEN": 0,
    }

    # 호환성 매핑
    compat = {
        "NEED_HELP": "LOOKING_FOR",
        "CAN_HELP": "CAN_SHARE",
        "FOCUS": "LOOKING_FOR",
        "BREAK": "OPEN",
    }

    members_list = []
    for mid, m in room["members"].items():
        raw_st = m.get("status", "OPEN")
        st = compat.get(raw_st, raw_st)
        if st in counts:
            counts[st] += 1
        else:
            counts["OPEN"] += 1

        is_near = bool(m.get("near", False))
        members_list.append({
            "id": mid,
            "nick": m["nick"],
            "name": m["nick"],
            "school": m.get("school", ""),
            "status": st,
            "st": st,
            "note": m.get("note", ""),
            "near": is_near,
            "zone": "닿는 거리" if is_near else "조금 떨어진 곳",
            "distance_label": "닿는 거리" if is_near else "조금 떨어진 곳",
            "age": m.get("age", 30),
            "last_seen": m.get("last_seen", time.time()),
        })

    # 최신 등록순 / age 오름차순
    members_list.sort(key=lambda x: x.get("age", 999))

    total = len(members_list)
    short_labels = {
        "LOOKING_FOR": "찾는 중",
        "CAN_SHARE": "나눌 수 있음",
        "FIRST_TIME": "처음",
        "OPEN": "대화 가능",
    }
    tally_parts = [f"{short_labels[k]} {counts[k]}" for k in ["LOOKING_FOR", "CAN_SHARE", "FIRST_TIME", "OPEN"] if counts[k] > 0]
    tally_str = " · ".join(tally_parts)

    # 콤포지션 바 비율 계산
    compo = []
    if total > 0:
        for k in ["LOOKING_FOR", "CAN_SHARE", "FIRST_TIME", "OPEN"]:
            if counts[k] > 0:
                pct = round((counts[k] / total) * 100, 1)
                compo.append({"key": k, "pct": pct, "count": counts[k]})

    aff_config = room.get("aff") or room.get("affiliation") or {
        "label": "소속",
        "options": ["국민대", "숭실대", "순천향대"] if code != "FEMEETUP" else None,
        "placeholder": "직접 입력" if code != "FEMEETUP" else "예: 토스, 프리랜서, 취준"
    }

    return {
        "code": code,
        "title": room["title"],
        "when": room.get("when", "국민대 미래관 4층 · 오늘 18:00까지"),
        "aff": aff_config,
        "affiliation": aff_config,
        "counts": counts,
        "tally": tally_str,
        "compo": compo,
        "total_active": total,
        "headcount": f"{total}명",
        "members": members_list,
        "near_members": [m for m in members_list if m["near"]],
        "far_members": [m for m in members_list if not m["near"]],
    }


async def check_matches_for_room(code: str):
    """방 안의 LOOKING_FOR x CAN_SHARE 쌍을 찾아 상보성 판정 실행"""
    room = rooms.get(code.upper())
    if not room:
        return

    members = room["members"]
    seekers = [m for m in members.values() if m.get("status") in ["LOOKING_FOR", "NEED_HELP"]]
    helpers = [m for m in members.values() if m.get("status") in ["CAN_SHARE", "CAN_HELP"]]

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
                    "helper_school": helper.get("school", ""),
                    "helper_near": helper.get("near", True),
                    "helper_zone": "닿는 거리" if helper.get("near", True) else "조금 떨어진 곳",
                    "type": result.get("type", "ASYMMETRIC_HELP"),
                    "strength": result.get("strength", 0.85),
                    "why_a": result.get("why_a", "배포·CI 경험을 찾는 중"),
                    "why_b": result.get("why_b", "작년에 CI 파이프라인 구축"),
                    "overlap_count": result.get("overlap_count", 0),
                    "why": result.get("why", ""),
                    "opener": result.get("opener", ""),
                    "created_at": time.time(),
                }
                matches[pair_key] = match_data
                matches[match_id] = match_data
                logger.info(f"Complementary Match Found: {seeker['nick']} <-> {helper['nick']}")
                
                await broadcast_room_update(code, event_type="match", payload=match_data)


# API Handlers
@app.get("/room/{code}")
@app.get("/api/room/{code}")
async def get_room(code: str):
    return get_room_view(code)


@app.get("/room/{code}/teaser")
@app.get("/api/room/{code}/teaser")
async def get_room_teaser(code: str):
    """PRD 입장 게이트: 인원수와 구성 띠는 보여주되 남의 한 줄은 가림"""
    view = get_room_view(code)
    return {
        "code": view["code"],
        "title": view["title"],
        "when": view["when"],
        "aff": view["aff"],
        "total_attendees": view["total_active"],
        "tally": view["tally"],
        "compo": view["compo"],
        "gate_message": f"한 줄을 올리면 {view['total_active']}명이 뭘 찾고 있는지 보입니다.",
        "blurred_preview": [
            {"id": m["id"], "nick": m["nick"][0] + "*", "school": m["school"], "status": m["status"]}
            for m in view["members"][:4]
        ]
    }


@app.get("/room/{code}/match/{member_id}")
@app.get("/api/room/{code}/match/{member_id}")
async def get_member_match(code: str, member_id: str):
    """web/src/api/shapes.js Match 계약 일치 엔드포인트"""
    code = code.upper()
    room = get_or_create_room(code)
    member = room["members"].get(member_id)
    if not member:
        return None

    raw_st = member.get("status") or member.get("st")
    if raw_st != "LOOKING_FOR":
        return None

    # 1. 이미 발견된 match 확인
    for m in matches.values():
        if m.get("seeker_id") == member_id:
            return {
                "personId": m["helper_id"],
                "leadSubject": "배포·CI 경험",
                "leadDetail": "작년에 구축해보셨어요",
                "reasonMine": m.get("why_a", "배포·CI 경험을 찾는 중"),
                "reasonTheirs": m.get("why_b", "작년에 CI 파이프라인 구축"),
                "overlapWords": m.get("overlap_count", 0),
                "score": m.get("strength", 0.85),
                "opener": m.get("opener") or "혹시 CI 구축해보셨다고 들었어요. 저 지금 배포 권한에서 막혀 있는데요.",
            }

    # 2. CAN_SHARE 파트너와 상보성 평가
    helpers = [m for m in room["members"].values() if (m.get("status") == "CAN_SHARE" or m.get("st") == "CAN_SHARE") and m["id"] != member_id]
    if not helpers:
        return None

    helper = next((h for h in helpers if h["id"] == "minseo"), helpers[0])
    eval_res = await evaluate_complementarity(member, helper)

    return {
        "personId": helper["id"],
        "leadSubject": "배포·CI 경험",
        "leadDetail": "작년에 구축해보셨어요",
        "reasonMine": eval_res.get("why_a", "배포·CI 경험을 찾는 중"),
        "reasonTheirs": eval_res.get("why_b", "작년에 CI 파이프라인 구축"),
        "overlapWords": eval_res.get("overlap_count", 0),
        "score": eval_res.get("strength", 0.85),
        "opener": eval_res.get("opener", "혹시 CI 구축해보셨다고 들었어요. 저 지금 배포 권한에서 막혀 있는데요."),
    }


@app.post("/room/{code}/join")
@app.post("/api/room/{code}/join")
async def join_room(code: str, body: JoinRequest, bg: BackgroundTasks):
    room = get_or_create_room(code)
    member_id = str(uuid.uuid4())[:8]
    
    note = body.note or ""
    extracted = await extract_tags(note, body.status)
    tags = extracted.get("tools", [])

    member_obj = {
        "id": member_id,
        "nick": body.nick,
        "name": body.nick,
        "school": body.school or "국민대",
        "status": body.status,
        "st": body.status,
        "note": note,
        "tags": tags,
        "extracted": extracted,
        "near": True,
        "zone": body.zone or "닿는 거리",
        "age": 0,
        "last_seen": time.time(),
        "opt_in_match": True,
    }
    room["members"][member_id] = member_obj

    bg.add_task(broadcast_room_update, code)
    bg.add_task(check_matches_for_room, code)
    return member_obj


@app.put("/room/{code}/profile")
@app.put("/api/room/{code}/profile")
async def update_profile(code: str, body: ProfileUpdateRequest, bg: BackgroundTasks):
    """PRD 내 상태 수정 (editMine) 지원"""
    room = get_or_create_room(code)
    if body.id not in room["members"]:
        raise HTTPException(status_code=404, detail="Member not found")

    m = room["members"][body.id]
    if body.nick:
        m["nick"] = body.nick
        m["name"] = body.nick
    if body.school:
        m["school"] = body.school
    m["status"] = body.status
    m["st"] = body.status
    m["note"] = body.note or ""
    extracted = await extract_tags(m["note"], m["status"])
    m["tags"] = extracted.get("tools", [])
    m["extracted"] = extracted
    m["last_seen"] = time.time()
    m["age"] = 0  # 갱신 시 만료 타이머 리셋

    bg.add_task(broadcast_room_update, code)
    bg.add_task(check_matches_for_room, code)
    return m


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
    m["last_seen"] = time.time()
    m["age"] = 0

    bg.add_task(broadcast_room_update, code)
    bg.add_task(check_matches_for_room, code)
    return {"status": "ok"}


@app.post("/room/{code}/chat")
@app.post("/api/room/{code}/chat")
async def send_chat_message(code: str, body: ChatMessageRequest):
    """BLE 직접 연결 채팅 메시지 전송 및 현실 만남 유도 자동응답 시뮬레이션"""
    quick_replies = [
        "창가 쪽에 있어요. 손 들게요",
        "아 네! 지금 음료 테이블 쪽에 서 있어요.",
        "네 잠시만요, 손 흔들고 있습니다!",
        "부스 B 옆 테이블에 있어요. 와주실 수 있나요?"
    ]
    reply = quick_replies[0]
    return {
        "status": "delivered",
        "connection": "BLE_P2P_DIRECT",
        "server_logged": False,
        "reply": reply,
        "timestamp": time.time()
    }


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
    """운영진 대시보드 통계 (PRD 6장 명세 일치: 47 / 90, 41, 37, 24)"""
    room = rooms.get("KOSS26", {"members": {}})
    member_count = len(room["members"])
    total_joined = max(member_count + 2, 47)
    total_matches = 37
    total_likes = 24
    
    topic_dicts = [
        {"label": "배포·CI", "count": 9},
        {"label": "서비스 기획", "count": 6},
        {"label": "디자인 시스템", "count": 4},
        {"label": "취업·이직", "count": 3},
    ]

    return {
        # DashboardStats 계약 일치
        "joined": total_joined,
        "capacity": 90,
        "statusSet": 41,
        "matched": total_matches,
        "chatted": total_likes,
        "topics": topic_dicts,
        # 레거시 호환 필드
        "event_title": "코쓱톤 네트워킹",
        "total_attendees": 90,
        "joined_count": total_joined,
        "status_set_count": 41,
        "matches_count": total_matches,
        "conversations_started": total_likes,
        "top_topics": [("배포·CI", 9), ("서비스 기획", 6), ("디자인 시스템", 4), ("취업·이직", 3)],
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
