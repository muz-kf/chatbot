from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from ..core.config import DATABASE_URL

pool: AsyncConnectionPool | None = None


@asynccontextmanager
async def lifespan_pool() -> AsyncGenerator[None, None]:
    global pool
    if DATABASE_URL:
        pool = AsyncConnectionPool(
            DATABASE_URL,
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row},
            open=False,
        )
        await pool.open()
    try:
        yield
    finally:
        if pool is not None:
            await pool.close()
            pool = None


def get_pool() -> AsyncConnectionPool:
    if pool is None:
        raise HTTPException(
            status_code=503,
            detail="Set PSQL_STR or DATABASE_URL to connect to PostgreSQL.",
        )
    return pool
