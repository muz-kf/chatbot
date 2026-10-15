from datetime import datetime

from pydantic import BaseModel


class HealthResponse(BaseModel):
    server_time: datetime
    message: str
