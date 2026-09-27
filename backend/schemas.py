from typing import List, Optional
from pydantic import BaseModel, Field

"""
====================================================================
[공통 규격] Pydantic Data Transfer Objects (schemas.py)
====================================================================
프론트엔드와 백엔드 간에 오고 가는 모든 데이터 구조의 '단 하나의 약속'입니다.
팀원 1, 2, 3은 이 스키마에 정의된 필드명을 엄격히 준수합니다.
"""

class AudioFeatures(BaseModel):
    file_name: str
    duration_seconds: float
    bpm: float
    tempo_feel: str
    spectral_centroid_hz: float
    spectral_brightness: str
    rms_energy: float
    dynamic_range: str
    detected_genres: List[str]
    gemini_audio_insight: str

class ColorItem(BaseModel):
    name: str
    hex: str
    role: str

class ConceptReport(BaseModel):
    project_title: str
    logline: str
    core_narrative: str
    color_palette: List[ColorItem]
    art_movement_keywords: List[str]

class Artwork(BaseModel):
    id: str
    style_name: str
    description: str
    image_url: str
    dalle_prompt_summary: str

class MarketingCopy(BaseModel):
    melon_intro: str
    insta_caption: str

class BrandingPackageResponse(BaseModel):
    status: str = "SUCCESS"
    task_id: str
    created_at: str
    audio_features: AudioFeatures
    concept_report: ConceptReport
    artworks: List[Artwork]
    marketing_copy: MarketingCopy

class TaskStatusResponse(BaseModel):
    task_id: str
    status: str  # "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
    progress: int = Field(ge=0, le=100)
    current_step: str
    result: Optional[BrandingPackageResponse] = None
    error_message: Optional[str] = None
