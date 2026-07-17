"""Minimal, standards-compliant Server-Sent Events encoding."""

from __future__ import annotations

import json

from .graph import AgentEvent


def encode_event(event: AgentEvent, sequence: int) -> bytes:
    payload = json.dumps(event.data, ensure_ascii=False, separators=(",", ":"), default=str)
    run_id = str(event.data.get("run_id") or "event")
    return (f"id: {run_id}:{sequence}\n" f"event: {event.event}\n" f"data: {payload}\n\n").encode()


def heartbeat() -> bytes:
    return b": keep-alive\n\n"
