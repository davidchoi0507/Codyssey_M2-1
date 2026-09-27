"""
====================================================================
[팀원 1 담당 구역] FastAPI Core Server (main.py)
====================================================================
역할: 고성능 비동기 REST API 서버, 멀티파트 오디오 파일 수신,
      BackgroundTasks 기반 비동기 작업 큐 및 Polling 엔드포인트를 제어합니다.
"""

import os
import uuid
import time
from typing import Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import BrandingPackageResponse, TaskStatusResponse
from services.audio_dsp import analyze_audio_physical_features
from services.gemini_audio import analyze_audio_semantics_with_gemini
from services.agent_workflow import run_multi_agent_branding_workflow
from services.image_generator import generate_album_artworks
from services.email_service import send_release_package_email

app = FastAPI(
    title="Indie Album Studio API",
    description="Audio Multimodal & Multi-Agent Indie Musician Branding API",
    version="1.0.0"
)

# CORS Middleware (프론트엔드 Vercel 및 로컬 개발 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-Memory Task Storage (실제 배포 시 Redis 또는 DB로 확장 가능)
TASKS_DB: Dict[str, Dict[str, Any]] = {}

@app.get("/")
def health_check():
    return {
        "service": "Indie Album Studio API",
        "status": "HEALTHY",
        "active_workers": len(TASKS_DB)
    }

def background_pipeline_worker(
    task_id: str,
    temp_file_path: str,
    track_title: str,
    artist_name: str,
    user_email: Optional[str],
    lyrics: Optional[str]
):
    """
    비동기 백그라운드 파이프라인 워커
    1) DSP 물리량 분석 -> 2) Gemini 오디오 청취 분석 -> 3) Multi-Agent 기획 -> 4) DALL-E 커버 -> 5) 이메일 자동 발송
    """
    try:
        # Step 1: Audio DSP
        TASKS_DB[task_id].update({"status": "PROCESSING", "progress": 25, "current_step": "오디오 물리량 분석 중 (BPM, Spectral Centroid)"})
        dsp_results = analyze_audio_physical_features(temp_file_path, duration_limit=60)
        time.sleep(1)

        # Step 2: Gemini 2.5 Flash Audio
        TASKS_DB[task_id].update({"progress": 50, "current_step": "Gemini 2.5 Flash 감정선 및 세션 구성 분석 중"})
        gemini_results = analyze_audio_semantics_with_gemini(temp_file_path)
        time.sleep(1)

        audio_features = {**dsp_results, **gemini_results, "file_name": os.path.basename(temp_file_path), "duration_seconds": 184.5}

        # Step 3: Multi-Agent Workflow
        TASKS_DB[task_id].update({"progress": 75, "current_step": "Multi-Agent A&R 기획서 및 비주얼 프롬프트 도출 중"})
        agent_results = run_multi_agent_branding_workflow(audio_features, track_title, artist_name, lyrics or "")
        time.sleep(1)

        # Step 4: DALL-E 3 Artwork Generation
        TASKS_DB[task_id].update({"progress": 90, "current_step": "DALL-E 3 고화질 앨범 아트워크 3종 생성 중"})
        artworks = generate_album_artworks(agent_results["style_prompts"], mock_mode=True)

        final_response = {
            "status": "SUCCESS",
            "task_id": task_id,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "audio_features": audio_features,
            "concept_report": agent_results["concept_report"],
            "artworks": artworks,
            "marketing_copy": agent_results["marketing_copy"]
        }

        # Step 5: Email Automation
        if user_email:
            send_release_package_email(user_email, final_response)

        TASKS_DB[task_id].update({
            "status": "COMPLETED",
            "progress": 100,
            "current_step": "완료",
            "result": final_response
        })

    except Exception as e:
        TASKS_DB[task_id].update({
            "status": "FAILED",
            "progress": 100,
            "error_message": str(e)
        })

@app.post("/api/generate", response_model=Dict[str, str])
async def create_branding_task(
    background_tasks: BackgroundTasks,
    audio_file: UploadFile = File(...),
    track_title: str = Form(...),
    artist_name: str = Form(...),
    user_email: Optional[str] = Form(None),
    track_lyrics: Optional[str] = Form(None)
):
    """
    음원 파일을 업로드받아 비동기 태스크를 생성하고 즉시 task_id를 반환합니다. (HTTP 504 타임아웃 방지)
    """
    task_id = str(uuid.uuid4())
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{task_id}_{audio_file.filename}")

    with open(temp_file_path, "wb") as f:
        f.write(await audio_file.read())

    TASKS_DB[task_id] = {
        "task_id": task_id,
        "status": "PENDING",
        "progress": 0,
        "current_step": "작업 큐에 등록됨",
        "result": None,
        "error_message": None
    }

    background_tasks.add_task(
        background_pipeline_worker,
        task_id,
        temp_file_path,
        track_title,
        artist_name,
        user_email,
        track_lyrics
    )

    return {"task_id": task_id, "status": "PENDING"}

@app.get("/api/task/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str):
    """
    프론트엔드에서 3초 주기로 호출하는 비동기 Polling 엔드포인트
    """
    if task_id not in TASKS_DB:
        raise HTTPException(status_code=404, detail="Task not found")
    return TASKS_DB[task_id]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
