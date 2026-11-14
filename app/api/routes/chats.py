import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ...core.config import (
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    OPENROUTER_MULTIMODAL_MODEL,
)
from ...db.models import PublicChat
from ...db.session import SessionLocal, get_db
from ...schemas.chat import (
    ChatCreatedResponse,
    ChatListResponse,
    ChatMessage,
    ChatResponse,
    ChatTurnRequest,
    CreateChatRequest,
)
from ...services.chat_service import ChatService, to_openrouter_message
from ..dependencies import get_current_user_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chats", tags=["chats"])
chat_service = ChatService()


@router.get("", response_model=ChatListResponse)
def list_chats(
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
) -> dict:
    chats = (
        db.query(PublicChat)
        .filter(PublicChat.email == email)
        .order_by(PublicChat.updated_at.desc())
        .all()
    )
    return {
        "chats": [
            {"id": item.id, "title": item.title, "updatedAt": item.updated_at}
            for item in chats
        ]
    }


@router.post("", status_code=201, response_model=ChatCreatedResponse)
def create_chat(
    data: CreateChatRequest,
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
) -> dict:
    chat = PublicChat(id=str(uuid4()), email=email, title=data.title, messages=[])
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return {
        "chat": {"id": chat.id, "title": chat.title, "updatedAt": chat.updated_at}
    }


@router.get("/{chat_id}", response_model=ChatResponse)
def get_chat(
    chat_id: str,
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
) -> dict:
    chat = (
        db.query(PublicChat)
        .filter(PublicChat.id == chat_id, PublicChat.email == email)
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {
        "chat": {
            "id": chat.id,
            "title": chat.title,
            "chats": chat.messages,
            "updatedAt": chat.updated_at,
        }
    }


@router.post("/{chat_id}/turns")
async def create_turn(
    chat_id: str,
    data: ChatTurnRequest,
    request: Request,
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    if str(data.chatId) != chat_id:
        raise HTTPException(status_code=400, detail="Invalid chat message.")

    user_message = data.message
    uses_attachments = any(
        attachment.data or attachment.frames
        for attachment in user_message.attachments
    )
    provider, base_url, api_key, model = chat_service.get_provider_config(
        requested_provider=data.provider,
        requested_model=data.model,
        uses_attachments=uses_attachments,
    )
    if not api_key:
        key_name = "GROQ_API_KEY" if provider == "groq" else "OPENROUTER_API_KEY"
        raise HTTPException(
            status_code=500,
            detail=f"{key_name} is missing from the server environment.",
        )

    chat = (
        db.query(PublicChat)
        .filter(PublicChat.id == chat_id, PublicChat.email == email)
        .with_for_update()
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    history = [*chat.messages, user_message.persistent()]
    chat.messages = history
    db.commit()
    current_messages = [
        ChatMessage.model_validate(message) for message in history[-41:-1]
    ]
    current_messages.append(user_message)
    uses_attachments = any(
        attachment.data or attachment.frames
        for message in current_messages
        for attachment in message.attachments
    )
    return StreamingResponse(
        chat_service.stream_chat_turn(
            request=request,
            chat_id=chat_id,
            email=email,
            current_messages=current_messages,
            model=model,
            client_timezone=data.clientTimezone,
            client_location=data.clientLocation,
            provider=provider,
            ai_name=data.aiName,
        ),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
