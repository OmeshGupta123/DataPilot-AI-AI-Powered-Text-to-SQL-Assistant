from langchain_anthropic import ChatAnthropic
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from app.core.config import get_settings


def get_llm(provider: str, model: str) -> BaseChatModel:
    if provider == "anthropic":
        return ChatAnthropic(model=model)  # pyright: ignore[reportCallIssue]
    if provider == "openai":
        return ChatOpenAI(model=model)
    if provider in ("gemini", "google"):
        settings = get_settings()
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=settings.gemini_api_key,
        )
    raise ValueError(
        f"Unsupported LLM provider: {provider!r}. Use 'anthropic' or 'openai' or 'gemini' ."
    )
