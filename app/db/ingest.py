import io
import re
import uuid
from pathlib import Path

import pandas as pd
import sqlalchemy
from fastapi import HTTPException, UploadFile

from app.core.config import get_settings


def sanitize_identifier(name: str, fallback: str = "table") -> str:
    """Sanitize a table or column name into a clean, safe SQL identifier."""
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "_", name.strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_").lower()
    if not cleaned:
        cleaned = fallback
    if cleaned[0].isdigit():
        cleaned = f"t_{cleaned}"
    return cleaned


def clean_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Sanitize and deduplicate column names in a DataFrame."""
    new_cols: list[str] = []
    seen: dict[str, int] = {}
    for i, col in enumerate(df.columns):
        col_str = str(col)
        base = sanitize_identifier(col_str, fallback=f"col_{i+1}")
        if base in seen:
            seen[base] += 1
            unique_name = f"{base}_{seen[base]}"
        else:
            seen[base] = 0
            unique_name = base
        new_cols.append(unique_name)
    df.columns = pd.Index(new_cols)
    return df


async def ingest_uploaded_file(
    file: UploadFile,
    db_id: str | None = None,
    table_name: str | None = None,
    upload_dir: str | None = None,
) -> tuple[str, str, list[str]]:
    """Process an uploaded file and write its contents into a SQLite database.

    Returns:
        (db_id, db_path, list_of_created_table_names)
    """
    settings = get_settings()
    effective_upload_dir = Path(upload_dir or getattr(settings, "upload_dir", "uploads"))
    effective_upload_dir.mkdir(parents=True, exist_ok=True)

    filename = file.filename or "uploaded_data.csv"
    ext = Path(filename).suffix.lower()

    # Determine db_id
    if db_id and db_id.strip():
        resolved_db_id = sanitize_identifier(db_id.strip(), fallback="database")
    else:
        file_stem = sanitize_identifier(Path(filename).stem, fallback="data")
        # Generate a unique slug to prevent collisions
        resolved_db_id = f"{file_stem}_{uuid.uuid4().hex[:6]}"

    db_path = effective_upload_dir / f"{resolved_db_id}.sqlite"
    created_tables: list[str] = []

    if hasattr(file, "file") and hasattr(file.file, "read"):
        content = file.file.read()
    else:
        content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 1. Direct SQLite database upload
    if ext in [".sqlite", ".db", ".sqlite3"]:
        with open(db_path, "wb") as f:
            f.write(content)

        engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
        try:
            inspector = sqlalchemy.inspect(engine)
            created_tables = inspector.get_table_names()
        finally:
            engine.dispose()

        if not created_tables:
            raise HTTPException(status_code=400, detail="The uploaded SQLite database contains no tables.")
        return resolved_db_id, str(db_path), created_tables

    engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
    try:
        # Determine table name if not provided
        default_table_name = sanitize_identifier(
            table_name if table_name and table_name.strip() else Path(filename).stem,
            fallback="uploaded_table",
        )

        # 2. CSV / TSV / TXT
        if ext in [".csv", ".tsv", ".txt", ".tab"]:
            # Auto-detect separator
            try:
                # Try reading with automatic delimiter detection
                df = pd.read_csv(io.BytesIO(content), sep=None, engine="python")
            except Exception:
                try:
                    df = pd.read_csv(io.BytesIO(content), sep=",")
                except Exception:
                    df = pd.read_csv(io.BytesIO(content), sep="\t")

            df = clean_dataframe_columns(df)
            df.to_sql(default_table_name, con=engine, if_exists="replace", index=False)
            created_tables.append(default_table_name)

        # 3. Excel (.xlsx, .xls)
        elif ext in [".xlsx", ".xls"]:
            excel_file = pd.ExcelFile(io.BytesIO(content))
            sheet_names = excel_file.sheet_names
            if not sheet_names:
                raise HTTPException(status_code=400, detail="Excel file has no sheets.")

            for sheet in sheet_names:
                tbl = sanitize_identifier(sheet, fallback="sheet") if len(sheet_names) > 1 else default_table_name
                df = pd.read_excel(excel_file, sheet_name=sheet)
                if df.empty:
                    continue
                df = clean_dataframe_columns(df)
                df.to_sql(tbl, con=engine, if_exists="replace", index=False)
                created_tables.append(tbl)

            if not created_tables:
                raise HTTPException(status_code=400, detail="All sheets in Excel file are empty.")

        # 4. JSON
        elif ext == ".json":
            df = pd.read_json(io.BytesIO(content))
            df = clean_dataframe_columns(df)
            df.to_sql(default_table_name, con=engine, if_exists="replace", index=False)
            created_tables.append(default_table_name)

        # 5. Parquet
        elif ext == ".parquet":
            df = pd.read_parquet(io.BytesIO(content))
            df = clean_dataframe_columns(df)
            df.to_sql(default_table_name, con=engine, if_exists="replace", index=False)
            created_tables.append(default_table_name)

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format '{ext}'. Supported formats: CSV, TSV, Excel (.xlsx, .xls), JSON, Parquet, SQLite (.db, .sqlite).",
            )

    finally:
        engine.dispose()

    return resolved_db_id, str(db_path), created_tables
