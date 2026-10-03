"""코디세이 LLM 어댑터 (OpenAI 호환, https://copa.codyssey.kr/v1).

LangChain ChatOpenAI로 감싼다. 에이전트는 여기서 받은 모델만 쓴다.
"""
from langchain_openai import ChatOpenAI

from app.core.config import Settings


def chat_model(settings: Settings, *, fast: bool = False) -> ChatOpenAI:
    model = (settings.codyssey_llm_model_fast if fast else None) or settings.codyssey_llm_model
    return ChatOpenAI(
        model=model,
        base_url=settings.codyssey_base_url,
        api_key=settings.codyssey_api_key,
        max_retries=settings.api_max_retries,  # openai SDK가 429/5xx를 지수 백오프로 재시도
        timeout=120,
    )


def model_label(settings: Settings, *, fast: bool = False) -> str:
    """AI 생성 표기용 모델명."""
    model = (settings.codyssey_llm_model_fast if fast else None) or settings.codyssey_llm_model
    return f"codyssey:{model}"
