from pydantic import BaseModel
from typing import List, Optional

class TurnBase(BaseModel):
    role: str
    text: str

class Turn(TurnBase):
    class Config:
        orm_mode = True

class SessionStartResponse(BaseModel):
    session_id: str

class HistoryItem(BaseModel):
    role: str
    content: str