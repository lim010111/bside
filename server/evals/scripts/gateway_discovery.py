"""게이트웨이 능력 조회. 평가 전용이며 비밀값을 출력하지 않는다.

server/.env 의 AI_API_KEY 로 문서화된 해커톤 게이트웨이에만 접속한다.
(docs/hackathon-brief.md 제공 자원). 키·헤더·환경 전체를 출력하지 않는다.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = "https://ai.cs.kookmin.ac.kr/v1"
ALLOWED_HOSTS = {"ai.cs.kookmin.ac.kr"}
SERVER_DIR = Path(__file__).resolve().parents[2]


def load_env(path: Path) -> dict[str, str]:
    """dotenv 최소 파서. 값은 반환만 하고 절대 출력하지 않는다."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def resolve() -> tuple[str, str]:
    env = load_env(SERVER_DIR / ".env")
    key = os.environ.get("AI_API_KEY") or env.get("AI_API_KEY", "")
    base = os.environ.get("AI_BASE_URL") or env.get("AI_BASE_URL") or DEFAULT_BASE_URL
    base = base.rstrip("/")
    host = urllib.request.urlparse(base).hostname if hasattr(urllib.request, "urlparse") else None
    from urllib.parse import urlparse

    host = urlparse(base).hostname
    if host not in ALLOWED_HOSTS:
        sys.exit(f"거부: 허용되지 않은 호스트({host}). 이 키는 문서화된 게이트웨이에만 사용한다.")
    return key, base


def request(url: str, key: str, payload: dict | None = None, timeout: float = 30.0):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("Authorization", f"Bearer {key}")
    if data:
        req.add_header("Content-Type", "application/json")
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
            return response.status, body, (time.monotonic() - started) * 1000
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace"), (time.monotonic() - started) * 1000
    except Exception as exc:  # noqa: BLE001 - 진단 목적
        return None, f"{type(exc).__name__}: {exc}", (time.monotonic() - started) * 1000


def main() -> int:
    key, base = resolve()
    print(f"base_url={base}")
    print(f"api_key_present={bool(key)} (값은 출력하지 않음)")
    if not key:
        print("AI_API_KEY 없음. 조회를 중단한다.")
        return 1

    report: dict = {"base_url": base, "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}

    status, body, ms = request(f"{base}/models", key)
    print(f"\nGET /v1/models -> HTTP {status} ({ms:.0f} ms)")
    report["models_http_status"] = status
    ids: list[str] = []
    if status == 200:
        try:
            parsed = json.loads(body)
            ids = sorted(str(item.get("id")) for item in parsed.get("data", []))
        except json.JSONDecodeError:
            print("  JSON 파싱 실패. 본문 앞부분:", body[:200])
    else:
        print("  본문 앞부분:", body[:300])
    report["model_ids"] = ids
    print(f"  모델 {len(ids)}개")
    for model_id in ids:
        print(f"    {model_id}")

    # /api/* 는 /v1 하위가 아니라 같은 호스트의 루트 경로다. 상대 결합을 쓰지 않는다.
    root = base[: -len("/v1")] if base.endswith("/v1") else base
    for path in ("/api/pricing", "/api/status"):
        url = f"{root}{path}"
        status, body, ms = request(url, key)
        print(f"\nGET {path} -> HTTP {status} ({ms:.0f} ms)")
        report[f"probe:{path}"] = {"status": status, "bytes": len(body)}
        if status == 200:
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError:
                print("  JSON 아님. 앞부분:", body[:200])
                continue
            if path.endswith("pricing"):
                rows = parsed.get("data") if isinstance(parsed, dict) else parsed
                if isinstance(rows, list):
                    print(f"  가격 항목 {len(rows)}개")
                    report["pricing_rows"] = len(rows)
                    report["pricing_sample"] = rows[:3]
                    for row in rows[:5]:
                        print("   ", json.dumps(row, ensure_ascii=False)[:220])
                else:
                    print("  예상치 못한 형태:", json.dumps(parsed, ensure_ascii=False)[:200])
            else:
                print("  ", json.dumps(parsed, ensure_ascii=False)[:300])
                report["status_payload"] = parsed
        else:
            print("  본문 앞부분:", body[:200])

    out = Path(__file__).resolve().parent.parent / "results" / "gateway-discovery.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n기록: {out.relative_to(SERVER_DIR)} (비밀값 없음, 로컬 전용)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
