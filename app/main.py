import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import auth, chat
from .config import allowed_origins
from .database import lifespan_pool

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with lifespan_pool():
        yield


app = FastAPI(title="DAZZ API", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(chat.router)
_allowed_origins = allowed_origins()
MAX_REQUEST_SIZE = 32 * 1024 * 1024


class RequestTooLarge(Exception):
    pass


class RequestSizeLimitMiddleware:
    def __init__(self, application):
        self.application = application

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            await self.application(scope, receive, send)
            return
        headers = dict(scope["headers"])
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > MAX_REQUEST_SIZE:
                    await JSONResponse(
                        status_code=413,
                        content={"error": "The request is too large."},
                        headers={"Cache-Control": "no-store"},
                    )(scope, receive, send)
                    return
            except ValueError:
                await JSONResponse(
                    status_code=400,
                    content={"error": "The request body is invalid."},
                    headers={"Cache-Control": "no-store"},
                )(scope, receive, send)
                return

        received_size = 0

        async def limited_receive():
            nonlocal received_size
            message = await receive()
            if message["type"] == "http.request":
                received_size += len(message.get("body", b""))
                if received_size > MAX_REQUEST_SIZE:
                    raise RequestTooLarge
            return message

        try:
            await self.application(scope, limited_receive, send)
        except RequestTooLarge:
            await JSONResponse(
                status_code=413,
                content={"error": "The request is too large."},
                headers={"Cache-Control": "no-store"},
            )(scope, receive, send)


app.add_middleware(RequestSizeLimitMiddleware)


@app.middleware("http")
async def api_security_headers(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if not origin:
                return JSONResponse(
                    status_code=403,
                    content={"error": "An origin header is required for this request."},
                    headers={"Cache-Control": "no-store"},
                )
        else:
            origin = request.headers.get("origin")
        if origin:
            from urllib.parse import urlsplit

            parsed = urlsplit(origin)
            normalized_origin = (
                f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
            )
            if not normalized_origin or normalized_origin not in _allowed_origins:
                return JSONResponse(
                    status_code=403,
                    content={"error": "Cross-origin requests are not allowed."},
                    headers={"Cache-Control": "no-store"},
                )
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(HTTPException)
async def http_error_handler(_: Request, error: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"error": error.detail if isinstance(error.detail, str) else "Request failed."},
        headers=error.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, error: RequestValidationError) -> JSONResponse:
    if any(item["type"] == "json_invalid" for item in error.errors()):
        message = "The request body is invalid."
    else:
        message = "The request body contains invalid or missing fields."
    return JSONResponse(status_code=400, content={"error": message})


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, error: Exception) -> JSONResponse:
    logging.getLogger(__name__).exception("Unhandled API error", exc_info=error)
    return JSONResponse(
        status_code=500,
        content={"error": "The server could not complete this request."},
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


dist_path = Path(__file__).resolve().parent.parent / "dist"
if dist_path.is_dir():
    assets_path = dist_path / "assets"
    if assets_path.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def serve_react(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found.")
        requested = (dist_path / path).resolve()
        if requested.is_relative_to(dist_path.resolve()) and requested.is_file():
            return FileResponse(requested)
        index_path = dist_path / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Not found.")
