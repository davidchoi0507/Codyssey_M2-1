"""코디세이 LLM 어댑터 (OpenAI 호환, https://copa.codyssey.kr/v1).

LangChain ChatOpenAI로 감싼다. 에이전트는 여기서 받은 모델만 쓴다.
키가 여러 개면 요청마다 돌려 쓰고, 한도·권한 오류가 난 키는 건너뛴다 (app/adapters/codyssey_keys.py).
"""
import logging
from collections.abc import Sequence

import openai
from langchain_core.messages import AIMessage, BaseMessage
from langchain_openai import ChatOpenAI

from app.adapters.codyssey_keys import key_pool, key_tail
from app.core.config import Settings

log = logging.getLogger(__name__)


class CodysseyChat:
    """ask_json 이 쓰는 ainvoke 만 있는 얇은 래퍼. 키가 하나면 ChatOpenAI 하나와 똑같이 동작한다."""

    def __init__(self, settings: Settings, model: str):
        self.s, self.model = settings, model
        self.pool = key_pool(settings)

    def _llm(self, key: str, *, last: bool) -> ChatOpenAI:
        return ChatOpenAI(
            model=self.model,
            base_url=self.s.codyssey_base_url,
            api_key=key,
            # openai SDK가 429/5xx를 지수 백오프로 재시도 — 다음 키가 남아 있으면 기다리지 않고 넘긴다
            max_retries=self.s.api_max_retries if last else 0,
            timeout=120,
        )

    async def ainvoke(self, messages: Sequence[BaseMessage]) -> AIMessage:
        keys = self.pool.order()
        for i, key in enumerate(keys):
            last = i == len(keys) - 1
            try:
                return await self._llm(key, last=last).ainvoke(messages)
            except openai.APIStatusError as e:
                if not (self.pool.rest(key, e.status_code) or e.status_code >= 500) or last:
                    raise
            except openai.APIConnectionError:
                if last:
                    raise
            log.warning("코디세이 LLM: 키 %s 실패 → 다음 키 %s", key_tail(key), key_tail(keys[i + 1]))
        raise AssertionError("unreachable")  # 마지막 키에서 실패하면 위에서 raise


def chat_model(settings: Settings, *, fast: bool = False) -> CodysseyChat:
    model = (settings.codyssey_llm_model_fast if fast else None) or settings.codyssey_llm_model
    return CodysseyChat(settings, model)


def model_label(settings: Settings, *, fast: bool = False) -> str:
    """AI 생성 표기용 모델명."""
    model = (settings.codyssey_llm_model_fast if fast else None) or settings.codyssey_llm_model
    return f"codyssey:{model}"
