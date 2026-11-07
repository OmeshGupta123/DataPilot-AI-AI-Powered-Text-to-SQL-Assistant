from langchain_core.embeddings import Embeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_openai import OpenAIEmbeddings

from app.core.config import get_settings


def get_embeddings(provider: str, model: str) -> Embeddings:
    """Return an Embeddings instance for the specified provider and model."""
    settings = get_settings()

    if provider in ("google", "gemini"):
        emb_model = model if (model and "embedding" in model) else "models/text-embedding-004"
        return GoogleGenerativeAIEmbeddings(
            model=emb_model,
            google_api_key=settings.gemini_api_key,
        )

    if provider == "openai":
        return OpenAIEmbeddings(model=model)

    if provider == "sentence-transformers":
        # Lazy import so PyTorch / Transformers is never loaded unless explicitly requested
        from langchain_huggingface import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(model_name=model)

    raise ValueError(f"Unsupported embedding provider: {provider!r}")
