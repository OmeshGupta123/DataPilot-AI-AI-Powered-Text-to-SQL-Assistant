import functools
from typing import Literal

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "google"
    llm_model: str = "gemini-3.5-flash-lite"
    gemini_api_key: str = ""
    embedding_provider: str = "sentence-transformers"
    embedding_model: str = "all-MiniLM-L6-v2"
    chroma_persist_dir: str = ".chroma"
    spider_data_dir: str = "spider_data"
    upload_dir: str = "uploads"
    log_level: str = "INFO"
    max_result_rows: int = 100
    query_timeout_seconds: int = 30
    postgres_profiler_url: str = "postgresql://text2sql:text2sql@localhost:5433/text2sql_profiler"
    pipeline_variant: Literal["baseline", "deterministic", "agent"] = "baseline"
    max_retries: int = 2
    agent_max_iterations: int = 10
    langsmith_project: str = "text2sql"
    max_schema_docs: int = 10
    max_example_docs: int = 5
    schema_similarity_threshold: float | None = None


@functools.lru_cache
def get_settings() -> AppSettings:
    return AppSettings()
