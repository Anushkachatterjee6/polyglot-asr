from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

Language = Literal["hi", "en", "other"]


class TranscriptWord(BaseModel):
    text: str
    language: Language
    start: float | None = None
    end: float | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)


class TranscriptResult(BaseModel):
    id: str
    filename: str
    transcript: str
    contextualTranscript: str | None = None
    durationSeconds: float | None = Field(default=None, ge=0)
    words: list[TranscriptWord] | None = None
    createdAt: datetime | None = None
    status: Literal["completed"] = "completed"


class RecordingResponse(BaseModel):
    id: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    ready: bool


class ModelInfoResponse(BaseModel):
    project: str
    dataset: str
    model: str
    status: str
    supportedLanguages: list[str]


class ContextRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=100_000)
    domain: str = Field(default="", max_length=100)
    vocabulary: list[str] = Field(default_factory=list, max_length=500)


class ContextResponse(BaseModel):
    original: str
    adapted: str


class LanguageRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=100_000)


class LanguageAnalysisResponse(BaseModel):
    words: list[TranscriptWord]
    hindiCount: int = Field(ge=0)
    englishCount: int = Field(ge=0)
    switches: int = Field(ge=0)


class ExportRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=100_000)
    format: Literal["txt", "json"]


class ExportResponse(BaseModel):
    content: str
    filename: str


class EvaluationMetric(BaseModel):
    name: str
    value: float | None
    unit: str
    experiment: str | None = None


class EvaluationResponse(BaseModel):
    metrics: list[EvaluationMetric]
    experiments: list[dict[str, str | float | int | None]]
