"""Authentication and the store dependency.

The installation credential is the only thing that decides who the caller is. A
public user_id in a path or body is never treated as authentication, and neither is
a BLE identifier.
"""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.errors import unauthorized
from app.store import Store

bearer = HTTPBearer(auto_error=False, scheme_name="installationBearer")


def get_store(request: Request) -> Store:
    return Store(request.app.state.redis, request.app.state.settings)


async def current_user(
    store: Annotated[Store, Depends(get_store)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> str:
    if credentials is None or not credentials.credentials:
        raise unauthorized("An installation credential is required.")
    user_id = await store.user_for_credential(credentials.credentials)
    if user_id is None:
        raise unauthorized("The installation credential is not valid.")
    return user_id


CurrentUser = Annotated[str, Depends(current_user)]
StoreDep = Annotated[Store, Depends(get_store)]
