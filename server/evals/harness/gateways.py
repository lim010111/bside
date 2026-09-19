"""네트워크 없이 도는 게이트웨이 대역들. 둘 다 모델이 아니다."""

from __future__ import annotations

import json

from app.ai.errors import AIGatewayError, AIGatewayHTTPError, AITimeoutError


class ScriptedGateway:
    """결정론적 오프라인 게이트웨이. 모델 호출이 아니며 품질 근거로 쓰지 않는다.

    모듈이 실제로 보낸 user payload 를 파싱해, 글자 2-gram 겹침이라는 고정 규칙으로
    점수와 이유를 만든 뒤 모듈이 기대하는 JSON 형식으로 돌려준다. 근거 구절은 원문에서
    잘라내므로 모듈의 근거 검증 경로가 실제로 동작하는지 확인할 수 있다.
    """

    name = "scripted-offline"

    def __init__(self) -> None:
        self.calls = 0

    @staticmethod
    def _grams(text: str) -> dict[str, int]:
        flat = "".join(ch for ch in text if not ch.isspace() and ch not in ".,!?~'\"()[]/:;")
        counts: dict[str, int] = {}
        for i in range(len(flat) - 1):
            counts[flat[i : i + 2]] = counts.get(flat[i : i + 2], 0) + 1
        return counts

    @classmethod
    def _cosine(cls, a: dict[str, int], b: dict[str, int]) -> float:
        dot = sum(n * b.get(g, 0) for g, n in a.items())
        na = sum(n * n for n in a.values()) ** 0.5
        nb = sum(n * n for n in b.values()) ** 0.5
        return 0.0 if na == 0 or nb == 0 else dot / (na * nb)

    @staticmethod
    def _first_clause(text: str, limit: int = 40) -> str:
        clause = text.strip().split(".")[0].strip()
        return clause[:limit] if clause else text.strip()[:limit]

    @classmethod
    def _quotable(cls, text: str, limit: int = 40) -> str | None:
        """근거로 쓸 만큼 긴 구절만 돌려준다.

        모듈은 너무 짧은 인용을 근거로 인정하지 않는다(app/ai/grounding.py). 대역이
        그보다 짧은 구절을 내면 모듈이 아니라 대역의 문제이므로 여기서 걸러낸다.
        """
        from app.ai.grounding import MIN_EXCERPT_CHARS, content_length

        clause = cls._first_clause(text, limit)
        return clause if content_length(clause) >= MIN_EXCERPT_CHARS else None

    async def complete(self, *, system: str, user: str) -> str:
        self.calls += 1
        document = json.loads(user)
        viewer = document["viewer"]
        viewer_text = f"{viewer['self_description']} {viewer['connection_intent']}"
        viewer_grams = self._grams(viewer_text)
        entries = []
        for candidate in document["candidates"]:
            candidate_text = f"{candidate['self_description']} {candidate['connection_intent']}"
            score = round(min(1.0, self._cosine(viewer_grams, self._grams(candidate_text)) * 3.2), 3)
            if score < 0.25 or len(candidate_text.strip()) < 14:
                entries.append(
                    {
                        "candidate_id": candidate["candidate_id"],
                        "status": "insufficient_evidence",
                        "score": None,
                        "reason": None,
                        "intent_conflict": False,
                        "evidence": [],
                    }
                )
                continue
            evidence = []
            quote = self._quotable(candidate["self_description"])
            if quote:
                evidence.append({"source": "candidate_self_description", "quote": quote})
            quote = self._quotable(viewer["connection_intent"])
            if quote:
                evidence.append({"source": "viewer_connection_intent", "quote": quote})
            quote = self._quotable(candidate["connection_intent"])
            if quote:
                evidence.append({"source": "candidate_connection_intent", "quote": quote})
            entries.append(
                {
                    "candidate_id": candidate["candidate_id"],
                    "status": "evaluated",
                    "score": score,
                    "reason": (
                        f"적어주신 \"{self._first_clause(candidate['self_description'], 28)}\" 부분이 "
                        "지금 찾으시는 것과 닿아 있어요."
                    ),
                    "intent_conflict": False,
                    "evidence": evidence,
                }
            )
        return json.dumps({"recommendations": entries}, ensure_ascii=False)

    async def aclose(self) -> None:
        return None


class FaultGateway:
    """지정한 실패를 재현한다. 실패를 성공으로 꾸미지 않는지 확인하는 용도다."""

    def __init__(self, kind: str) -> None:
        self.kind = kind
        self.calls = 0

    async def complete(self, *, system: str, user: str) -> str:
        self.calls += 1
        if self.kind == "gateway_timeout":
            raise AITimeoutError("injected timeout")
        if self.kind == "gateway_http_error":
            raise AIGatewayHTTPError(502)
        if self.kind == "invalid_json":
            return "죄송합니다. 추천을 만들 수 없었어요."
        if self.kind == "missing_candidate":
            return json.dumps({"recommendations": []})
        if self.kind == "invented_candidate":
            return json.dumps(
                {
                    "recommendations": [
                        {
                            "candidate_id": "ghost_user",
                            "status": "evaluated",
                            "score": 0.99,
                            "reason": "존재하지 않는 후보입니다.",
                            "intent_conflict": False,
                            "evidence": [],
                        }
                    ]
                }
            )
        raise AIGatewayError(f"unknown injected fault: {self.kind}")

    async def aclose(self) -> None:
        return None
