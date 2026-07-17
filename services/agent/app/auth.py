"""Server-to-server authentication and per-user checkpoint identity."""

from __future__ import annotations

import hashlib
import re
import secrets
from dataclasses import dataclass
from typing import Annotated

from fastapi import Header, HTTPException, Request, status

_USER_ID_PATTERN = re.compile(r"^[\w.@:-]{1,128}$")


@dataclass(frozen=True, slots=True)
class AuthenticatedCaller:
    user_id: str

    @property
    def namespace(self) -> str:
        return hashlib.sha256(self.user_id.encode("utf-8")).hexdigest()[:24]


async def authenticate_request(
    request: Request,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
) -> AuthenticatedCaller:
    """Trust only the authenticated web server, never a browser-supplied user id."""

    settings = request.app.state.settings
    configured = settings.service_token
    if configured is None:
        if not settings.allow_insecure_dev_auth:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="agent service authentication is not configured",
            )
    else:
        expected = configured.get_secret_value()
        scheme, separator, presented = (authorization or "").partition(" ")
        authenticated = (
            separator == " "
            and scheme.lower() == "bearer"
            and bool(presented)
            and secrets.compare_digest(presented, expected)
        )
        if not authenticated:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid service credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    if user_id is None or _USER_ID_PATTERN.fullmatch(user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="a valid X-User-Id header is required",
        )
    return AuthenticatedCaller(user_id=user_id)
