"""
====================================================================
[팀원 3 담당 구역] DALL-E 3 Image Generator (image_generator.py)
====================================================================
역할: DALL-E 3 API를 호출하여 3종의 고화질 정방형 아트워크를 생성합니다.
      비용 절감을 위해 MOCK_MODE=True일 때는 Unsplash 더미 이미지를 반환합니다.
"""

import os
from typing import List, Dict, Any

MOCK_COVERS = [
    {
        "id": "cover-a",
        "style_name": "Style A: 미니멀 & 네오 타이포그래피",
        "description": "감각적인 여백과 세련된 그래픽 레이아웃으로 도시의 공허함을 형상화한 디자인",
        "image_url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop",
        "dalle_prompt_summary": "Minimalist graphic design album cover, abstract architectural geometry"
    },
    {
        "id": "cover-b",
        "style_name": "Style B: 초현실 사이키델릭 몽환",
        "description": "주파수 파형의 왜곡과 몽환적인 액체 네온 텍스처를 결합한 사이키델릭 무드",
        "image_url": "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop",
        "dalle_prompt_summary": "Surreal fluid psychedelic liquid wave album artwork, iridescent chromatic aberration"
    },
    {
        "id": "cover-c",
        "style_name": "Style C: 시네마틱 35mm 필름 그레인",
        "description": "비에 젖은 밤거리와 네온사인의 아날로그 감성을 35mm 필름 룩으로 표현",
        "image_url": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop",
        "dalle_prompt_summary": "Cinematic 35mm film photography album cover, lonely rainy city street at midnight"
    }
]

def generate_album_artworks(prompts: List[str], mock_mode: bool = True) -> List[Dict[str, Any]]:
    """
    3개의 프롬프트를 받아 DALL-E 3 API를 병렬 호출하거나,
    mock_mode가 True일 경우 고화질 더미 이미지를 즉시 반환합니다.
    """
    if mock_mode or os.getenv("MOCK_MODE", "true").lower() == "true":
        print("[ImageGenerator] MOCK_MODE 활성화: OpenAI 크레딧 비용 $0 방어 모드 동작")
        return MOCK_COVERS

    # TODO: [팀원 3 구현]
    # from openai import OpenAI
    # client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    # results = []
    # for p in prompts:
    #     res = client.images.generate(model="dall-e-3", prompt=p, size="1024x1024", quality="standard", n=1)
    #     results.append(res.data[0].url)
    return MOCK_COVERS
