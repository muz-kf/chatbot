from fastapi.testclient import TestClient
from datetime import datetime
import re

from app.main import app


client = TestClient(app)


def test_health_check_returns_timestamp_and_random_message() -> None:
    response = client.get("/health", headers={"Origin": "http://testserver"})

    assert response.status_code == 200
    result = response.json()
    assert set(result) == {"server_time", "message"}
    datetime.fromisoformat(result["server_time"].replace("Z", "+00:00"))
    assert result["message"].startswith("DAZZ API is healthy: ")
    assert re.fullmatch(r"[a-z0-9]{10}", result["message"].rsplit(" ", 1)[-1])


def test_state_change_requires_origin() -> None:
    response = client.post("/api/auth/logout")

    assert response.status_code == 403
    assert response.json() == {
        "error": "An origin header is required for this request."
    }


def test_same_origin_request_is_allowed() -> None:
    response = client.post(
        "/api/auth/logout",
        headers={"Origin": "http://testserver"},
    )

    assert response.status_code == 204


def test_untrusted_origin_is_rejected() -> None:
    response = client.post(
        "/api/auth/logout",
        headers={"Origin": "https://untrusted.example"},
    )

    assert response.status_code == 403
    assert response.json() == {"error": "Cross-origin requests are not allowed."}


def test_oversized_content_length_is_rejected_before_parsing() -> None:
    response = client.post(
        "/api/auth/logout",
        headers={
            "Origin": "http://localhost:5173",
            "Content-Length": str(32 * 1024 * 1024 + 1),
        },
    )

    assert response.status_code == 413
    assert response.json() == {"error": "The request is too large."}
