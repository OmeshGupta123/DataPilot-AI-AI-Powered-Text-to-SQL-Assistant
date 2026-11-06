import contextlib
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.api.models import (
    DatabaseInfo,
    DatabaseListResponse,
    ExecuteRequest,
    ExecuteResponse,
    QueryRequest,
    QueryResponse,
    TableDataResponse,
    UploadResponse,
)
from app.db.executor import SQLExecutor
from app.db.ingest import ingest_uploaded_file
from app.db.introspection import extract_schema
from app.db.storage import (
    delete_uploaded_database,
    get_database_info,
    get_table_data,
    list_all_databases,
    resolve_db_path,
)
from app.db.validator import SQLValidator
from app.pipeline.guardrails import check_input_guardrail
from app.pipeline.protocol import Pipeline
from app.retrieval.schema_retriever import SchemaRetriever

router = APIRouter()

# Module-level instances set during app lifespan
_pipeline: Pipeline | None = None
_schema_retriever: SchemaRetriever | None = None


def set_pipeline(pipeline: Pipeline) -> None:
    global _pipeline
    _pipeline = pipeline


def get_pipeline() -> Pipeline:
    if _pipeline is None:
        raise RuntimeError("Pipeline not initialized")
    return _pipeline


def set_schema_retriever(retriever: SchemaRetriever) -> None:
    global _schema_retriever
    _schema_retriever = retriever


def get_schema_retriever() -> SchemaRetriever | None:
    return _schema_retriever


@router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    result = check_input_guardrail(request.question)
    if not result.passed:
        raise HTTPException(status_code=422, detail=result.reason)
    pipeline = get_pipeline()
    return await pipeline.run(request)


@router.post("/execute", response_model=ExecuteResponse)
async def execute_sql(request: ExecuteRequest) -> ExecuteResponse:
    """Directly execute a user-authored or edited read-only SQL query against the specified database."""
    db_path = resolve_db_path(request.db_id)
    if not Path(db_path).is_file():
        raise HTTPException(status_code=404, detail=f"Database '{request.db_id}' not found.")

    validator = SQLValidator()
    validation = validator.validate(request.sql)
    if not validation.valid:
        return ExecuteResponse(
            success=False,
            sql=request.sql,
            error=f"SQL validation error: {validation.error}",
            latency_ms=0.0,
        )

    executor = SQLExecutor(max_rows=request.max_rows)
    exec_result = await executor.execute(request.sql, db_path)

    return ExecuteResponse(
        success=exec_result.success,
        sql=request.sql,
        column_names=exec_result.column_names,
        rows=exec_result.rows,
        row_count=exec_result.row_count,
        latency_ms=round(exec_result.latency_ms, 2),
        error=exec_result.error,
    )


@router.post("/upload", response_model=UploadResponse)
async def upload_table_file(
    file: UploadFile = File(...),  # noqa: B008
    db_id: str | None = Form(None),  # noqa: B008
    table_name: str | None = Form(None),  # noqa: B008
) -> UploadResponse:
    """Upload a table file (CSV, TSV, Excel, JSON, Parquet, or SQLite) and ingest into SQLite."""
    resolved_db_id, db_path, created_tables = await ingest_uploaded_file(
        file=file,
        db_id=db_id,
        table_name=table_name,
    )

    # Introspect schema for the ingested database
    docs = extract_schema(db_path, db_id=resolved_db_id)

    # Index into vector store if schema retriever is initialized
    retriever = get_schema_retriever()
    if retriever is not None and docs:
        with contextlib.suppress(Exception):
            await retriever.index(docs)

    # Gather database summary info
    db_info = get_database_info(resolved_db_id, db_path, source="uploaded")

    return UploadResponse(
        success=True,
        message=f"Successfully ingested {len(created_tables)} table(s) into database '{resolved_db_id}'.",
        db_id=resolved_db_id,
        tables=db_info.tables,
    )


@router.get("/databases", response_model=DatabaseListResponse)
async def list_databases() -> DatabaseListResponse:
    """List all available databases, both user-uploaded and Spider benchmark databases."""
    databases = list_all_databases()
    return DatabaseListResponse(databases=databases)


@router.get("/databases/{db_id}", response_model=DatabaseInfo)
async def get_database_details(db_id: str) -> DatabaseInfo:
    """Get metadata, table schemas, and sample preview rows for a specific database."""
    db_path = resolve_db_path(db_id)
    if not Path(db_path).is_file():
        raise HTTPException(status_code=404, detail=f"Database '{db_id}' not found.")

    source = "uploaded" if "uploads" in db_path else "spider"
    return get_database_info(db_id, db_path, source=source)


@router.get("/databases/{db_id}/tables/{table_name}/data", response_model=TableDataResponse)
async def get_table_rows(
    db_id: str,
    table_name: str,
    limit: int = Query(50, ge=1, le=1000),  # noqa: B008
    offset: int = Query(0, ge=0),  # noqa: B008
) -> TableDataResponse:
    """Get paginated tabular rows from an existing database table."""
    db_path = resolve_db_path(db_id)
    if not Path(db_path).is_file():
        raise HTTPException(status_code=404, detail=f"Database '{db_id}' not found.")

    try:
        total_rows, cols, rows = get_table_data(db_path, table_name, limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to query table '{table_name}': {e}") from e

    return TableDataResponse(
        table_name=table_name,
        total_rows=total_rows,
        column_names=cols,
        rows=rows,
        offset=offset,
        limit=limit,
    )


@router.delete("/databases/{db_id}")
async def delete_database(db_id: str) -> dict[str, str]:
    """Delete a user-uploaded database."""
    deleted = delete_uploaded_database(db_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Uploaded database '{db_id}' not found or cannot be deleted.",
        )
    return {"status": "deleted", "db_id": db_id}
