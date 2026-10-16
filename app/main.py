import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api.routes import auth, chats, health
from .db.session import engine
from .middleware import ApiSecurityMiddleware, RequestSizeLimitMiddleware

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    if engine is not None:
        engine.dispose()


app = FastAPI(title="DAZZ API", lifespan=lifespan)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(ApiSecurityMiddleware)
app.include_router(auth.router)
app.include_router(chats.router)
app.include_router(health.router)


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
