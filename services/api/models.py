from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True, index=True)
    role = Column(String, nullable=False, server_default='user')
    created_at = Column(DateTime, server_default=func.now())
    sessions = relationship("Session", back_populates="user")

class Session(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, nullable=False, server_default='active')
    created_at = Column(DateTime, server_default=func.now())
    user = relationship("User", back_populates="sessions")
    turns = relationship("Turn", back_populates="session", cascade="all, delete-orphan")

class Turn(Base):
    __tablename__ = "turns"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    role = Column(String, nullable=False)  # 'user' or 'assistant'
    text = Column(String, nullable=False)
    audio_url = Column(String, nullable=True)
    stt_ms = Column(Integer, nullable=True)
    llm_ms = Column(Integer, nullable=True)
    tts_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    session = relationship("Session", back_populates="turns")

class Voice(Base):
    __tablename__ = "voices"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String)
    ref = Column(String, nullable=False) # Path or reference to the voice model

class Audit(Base):
    __tablename__ = "audit"
    id = Column(Integer, primary_key=True, index=True)
    actor = Column(String, nullable=True)
    action = Column(String, nullable=False)
    details_json = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())