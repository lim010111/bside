"""평가 하네스의 파이썬 쪽 공용 부품.

promptfoo 제공자(`providers/bridge.py`)와 수용 테스트(`server/tests/test_ai_acceptance.py`)가
같은 사례·같은 가짜 게이트웨이를 쓰도록 한곳에 모은다. 두 곳이 사례를 각자 읽으면
검증 결과가 서로 다른 입력을 본 채 비교된다.
"""

from harness.fixtures import (
    FRESH_POOL,
    HELDOUT_POOL,
    TUNING_POOL,
    list_cases,
    load_case,
    to_request,
)
from harness.gateways import FaultGateway, ScriptedGateway

__all__ = [
    "FRESH_POOL",
    "HELDOUT_POOL",
    "TUNING_POOL",
    "FaultGateway",
    "ScriptedGateway",
    "list_cases",
    "load_case",
    "to_request",
]
