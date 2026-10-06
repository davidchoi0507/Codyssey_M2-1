"""코디세이 LLM에서 JSON 받기 (모든 에이전트 공용).

코디세이 프록시는 response_format·tools를 지원하지 않으므로(400 unsupported_feature)
프롬프트에 형식을 지시하고 PydanticOutputParser로 파싱한다. 형식·내용 검사에 걸리면
문제를 알려주고 한 번 다시 쓰게 한다. 그래도 남으면 repair(코드로 고칠 수 있는 문제만)를 해 보고,
고쳐지면 그 결과를 쓴다. 이 다시 쓰기는 사용자 재생성 횟수와 무관하다.
"""
import json
from collections.abc import Callable
from typing import TypeVar

from langchain_core.exceptions import OutputParserException
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel

from app.core.errors import AppError

M = TypeVar("M", bound=BaseModel)


async def ask_json(llm: BaseChatModel, system: str, payload: dict, schema: type[M], *,
                   check: Callable[[M], list[str]] | None = None, repair: Callable[[M], M] | None = None,
                   what: str = "결과") -> tuple[M, dict]:
    """반환: (파싱된 결과, 토큰 사용량)."""
    parser = PydanticOutputParser(pydantic_object=schema)
    messages = [SystemMessage(system + "\n\n" + parser.get_format_instructions()),
                HumanMessage(json.dumps(payload, ensure_ascii=False))]
    problems: list[str] = []
    raw: AIMessage | None = None
    for _ in range(2):
        raw = await llm.ainvoke(messages)
        try:
            out = parser.parse(raw.content)
            problems = check(out) if check else []
        except OutputParserException as e:
            out, problems = None, [f"JSON 형식 오류: {str(e)[:300]}"]
        if not problems:
            return out, _usage(raw)
        messages += [raw, HumanMessage("형식 문제를 고쳐서 다시 써 줘: " + "; ".join(problems))]
    if out is not None and repair:
        fixed = repair(out)
        if not (check(fixed) if check else []):
            return fixed, _usage(raw) | {"repaired": problems}
    raise AppError("LLM_BAD_OUTPUT", f"{what}를 정리하지 못했어요. 다시 시도해 주세요.", True)


def _usage(raw: AIMessage) -> dict:
    usage = getattr(raw, "usage_metadata", None) or {}
    return {"input_tokens": usage.get("input_tokens"), "output_tokens": usage.get("output_tokens")}
