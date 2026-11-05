import uuid
from typing import Any

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    question: str
    db_id: str
    top_k_schema: int = 5
    top_k_examples: int = 3


class ExecutionMetadata(BaseModel):
    success: bool
    row_count: int = 0
    latency_ms: float = 0.0
    error: str | None = None


class QueryResponse(BaseModel):
    question: str
    generated_sql: str
    answer: str
    column_names: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)
    retrieved_schema_summary: list[str] = Field(default_factory=list)
    retrieved_examples_summary: list[str] = Field(default_factory=list)
    execution_metadata: ExecutionMetadata | None = None
    confidence: float | None = None
    flags: list[str] = Field(default_factory=list)
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    step_timings: dict[str, Any] | None = None
    retry_count: int | None = None
    draft_sql: str | None = None


class TableColumnInfo(BaseModel):
    name: str
    data_type: str
    is_primary_key: bool = False
    is_nullable: bool = True


class TableSummary(BaseModel):
    name: str
    row_count: int = 0
    columns: list[TableColumnInfo] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)


class DatabaseInfo(BaseModel):
    db_id: str
    name: str
    source: str = "uploaded"  # "uploaded" or "spider"
    tables: list[TableSummary] = Field(default_factory=list)
    file_size_bytes: int | None = None


class UploadResponse(BaseModel):
    success: bool
    message: str
    db_id: str
    tables: list[TableSummary] = Field(default_factory=list)


class DatabaseListResponse(BaseModel):
    databases: list[DatabaseInfo] = Field(default_factory=list)


class TableDataResponse(BaseModel):
    table_name: str
    total_rows: int
    column_names: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)
    offset: int = 0
    limit: int = 50


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
