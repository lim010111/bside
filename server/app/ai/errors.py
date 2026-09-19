"""Errors raised by the AI recommendation module.

Per-candidate problems never raise: they are reported as ``FAILED`` entries so
the caller keeps every candidate. Only programming/caller mistakes raise.
"""


class AIError(Exception):
    """Base class for every error raised by ``app.ai``."""


class AIInputError(AIError):
    """The caller handed us a request we refuse to silently repair.

    Deliberately not a ``ValueError``: Pydantic wraps those into a
    ``ValidationError``, and the caller should see why the request was refused.
    """


class AIConfigurationError(AIError):
    """Required gateway configuration (key, base URL, model) is missing."""


class AIGatewayError(AIError):
    """The provider call did not produce a usable HTTP response.

    ``status_code`` is set when the provider answered and the answer was an
    error status. It is how the service tells an error response apart from a
    transport failure, so classification never depends on the message text.
    """

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class AIGatewayHTTPError(AIGatewayError):
    """The provider answered with an error status.

    A distinct type rather than a message the caller has to read: classifying a
    failure by sniffing exception text misreads any transport error whose class
    name happens to contain "HTTP".
    """

    def __init__(self, status_code: int) -> None:
        # The body may echo request headers, so only the status code is kept.
        super().__init__(f"gateway returned HTTP {status_code}")
        self.status_code = status_code


class AITimeoutError(AIGatewayError):
    """The provider call exceeded the configured timeout."""


class AIResponseError(AIError):
    """The provider responded, but the body was not usable model output."""


class AIResponseTruncatedError(AIResponseError):
    """The model stopped because it ran out of output budget.

    Partial output is not partial success: the JSON is cut mid-document and the
    candidates it would have covered are unknown.
    """

    def __init__(self, finish_reason: str) -> None:
        super().__init__(f"model output was truncated (finish_reason={finish_reason})")
        self.finish_reason = finish_reason
