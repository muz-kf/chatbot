from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator
from typing_extensions import Annotated


class ProfileRequest(BaseModel):
    email: EmailStr
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    dateOfBirth: date

    @field_validator("dateOfBirth")
    @classmethod
    def birth_date_must_not_be_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Date of birth cannot be in the future.")
        return value


class VerifyCodeRequest(ProfileRequest):
    code: Annotated[str, StringConstraints(pattern=r"^\d{6}$")]


class CreateChatRequest(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class StoredAttachment(BaseModel):
    id: Annotated[str, StringConstraints(max_length=100)]
    name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    mimeType: Annotated[str, StringConstraints(max_length=120)]
    size: int = Field(ge=0, le=60 * 1024 * 1024)
    format: Literal["wav", "mp3"] | None = None
    text: Annotated[str, StringConstraints(max_length=180_000)] | None = None
    transcript: Annotated[str, StringConstraints(max_length=12_000)] | None = None


class ChatAttachment(StoredAttachment):
    data: Annotated[str, StringConstraints(max_length=16_000_000)] | None = None
    frames: list[Annotated[str, StringConstraints(max_length=3_000_000)]] = Field(
        default_factory=list, max_length=3
    )


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(max_length=12_000)]
    attachments: list[ChatAttachment] = Field(default_factory=list, max_length=6)

    def validate_user_content(self) -> None:
        if self.role == "user" and not self.content.strip() and not self.attachments:
            raise ValueError("User messages must include text or an attachment.")

    def persistent(self) -> dict:
        result = self.model_dump(mode="json", exclude_none=True)
        for attachment in result.get("attachments", []):
            attachment.pop("frames", None)
            attachment.pop("data", None)
        return result


class ChatTurnRequest(BaseModel):
    chatId: UUID
    message: ChatMessage

    @field_validator("message")
    @classmethod
    def turn_requires_user_message(cls, message: ChatMessage) -> ChatMessage:
        if message.role != "user":
            raise ValueError("A chat turn must be a user message.")
        message.validate_user_content()
        return message
