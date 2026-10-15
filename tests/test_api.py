from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_check_is_uncached() -> None:
    response = client.get(
        "/api/health",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["cache-control"] == "no-store"


def test_state_change_requires_origin() -> None:
    response = client.post("/api/auth/logout")

    assert response.status_code == 403
    assert response.json() == {
        "error": "An origin header is required for this request."
    }


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
