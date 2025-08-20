from sqlalchemy.orm import Session
from . import models, schemas
import uuid

def create_session(db: Session, session_id: str, user_id: int = None):
    db_session = models.Session(id=session_id, user_id=user_id)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

def create_turn(db: Session, session_id: str, role: str, text: str, audio_url: str = None, stt_ms: int = None, llm_ms: int = None, tts_ms: int = None):
    db_turn = models.Turn(
        session_id=session_id,
        role=role,
        text=text,
        audio_url=audio_url,
        stt_ms=stt_ms,
        llm_ms=llm_ms,
        tts_ms=tts_ms
    )
    db.add(db_turn)
    db.commit()
    db.refresh(db_turn)
    return db_turn

def get_session_history(db: Session, session_id: str):
    return db.query(models.Turn).filter(models.Turn.session_id == session_id).order_by(models.Turn.created_at).all()

def get_session_history_formatted(db: Session, session_id: str) -> List[schemas.HistoryItem]:
    history_db = get_session_history(db, session_id)
    history_formatted = []
    for turn in history_db:
        # The LLM expects a 'content' key, not 'text'
        history_formatted.append(schemas.HistoryItem(role=turn.role, content=turn.text))
    return history_formatted