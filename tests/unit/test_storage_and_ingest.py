import io
from pathlib import Path

import openpyxl
import pandas as pd
import pytest
from fastapi import UploadFile

from app.db.ingest import (
    clean_dataframe_columns,
    ingest_uploaded_file,
    sanitize_identifier,
)
from app.db.storage import (
    delete_uploaded_database,
    get_database_info,
    get_table_data,
    get_table_sample,
    resolve_db_path,
)


def test_sanitize_identifier() -> None:
    assert sanitize_identifier("User Sales Data!") == "user_sales_data"
    assert sanitize_identifier("123_test") == "t_123_test"
    assert sanitize_identifier("   ") == "table"
    assert sanitize_identifier("Total $ Revenue") == "total_revenue"


def test_clean_dataframe_columns() -> None:
    df = pd.DataFrame(columns=["User Name", "User Name", "Age", "123Score", ""])
    cleaned_df = clean_dataframe_columns(df)
    assert list(cleaned_df.columns) == [
        "user_name",
        "user_name_1",
        "age",
        "t_123score",
        "col_5",
    ]


@pytest.mark.asyncio
async def test_ingest_csv_file(tmp_path: Path) -> None:
    csv_content = b"id,name,salary\n1,Alice,75000\n2,Bob,82000\n3,Charlie,95000\n"
    file = UploadFile(filename="employees.csv", file=io.BytesIO(csv_content))

    db_id, db_path, tables = await ingest_uploaded_file(
        file=file,
        db_id="test_company",
        table_name="staff",
        upload_dir=str(tmp_path),
    )

    assert db_id == "test_company"
    assert Path(db_path).exists()
    assert tables == ["staff"]

    total, cols, rows = get_table_data(db_path, "staff")
    assert total == 3
    assert cols == ["id", "name", "salary"]
    assert len(rows) == 3
    assert rows[0] == [1, "Alice", 75000]


@pytest.mark.asyncio
async def test_ingest_tsv_file(tmp_path: Path) -> None:
    tsv_content = b"product\tprice\tstock\nWidget\t19.99\t100\nGadget\t29.99\t50\n"
    file = UploadFile(filename="products.tsv", file=io.BytesIO(tsv_content))

    db_id, db_path, tables = await ingest_uploaded_file(
        file=file,
        upload_dir=str(tmp_path),
    )

    assert Path(db_path).exists()
    assert len(tables) == 1
    total, cols, rows = get_table_data(db_path, tables[0])
    assert total == 2
    assert cols == ["product", "price", "stock"]


@pytest.mark.asyncio
async def test_ingest_excel_file_multiple_sheets(tmp_path: Path) -> None:
    wb = openpyxl.Workbook()
    # Sheet 1: Orders
    ws1 = wb.active
    ws1.title = "Orders"
    ws1.append(["order_id", "customer", "amount"])
    ws1.append([101, "Acme Corp", 500])
    ws1.append([102, "Beta LLC", 1200])

    # Sheet 2: Customers
    ws2 = wb.create_sheet(title="Customers")
    ws2.append(["cust_id", "cust_name", "country"])
    ws2.append([1, "Acme Corp", "USA"])
    ws2.append([2, "Beta LLC", "Canada"])

    excel_buffer = io.BytesIO()
    wb.save(excel_buffer)
    excel_bytes = excel_buffer.getvalue()

    file = UploadFile(filename="business_data.xlsx", file=io.BytesIO(excel_bytes))
    db_id, db_path, tables = await ingest_uploaded_file(
        file=file,
        upload_dir=str(tmp_path),
    )

    assert "orders" in tables
    assert "customers" in tables

    info = get_database_info(db_id, db_path)
    assert len(info.tables) == 2
    orders_table = next(t for t in info.tables if t.name == "orders")
    assert orders_table.row_count == 2
    assert len(orders_table.sample_rows) == 2


@pytest.mark.asyncio
async def test_ingest_json_file(tmp_path: Path) -> None:
    json_content = b'[{"user": "u1", "score": 95}, {"user": "u2", "score": 88}]'
    file = UploadFile(filename="leaderboard.json", file=io.BytesIO(json_content))

    db_id, db_path, tables = await ingest_uploaded_file(
        file=file,
        upload_dir=str(tmp_path),
    )

    assert Path(db_path).exists()
    total, cols, rows = get_table_data(db_path, tables[0])
    assert total == 2
    assert cols == ["user", "score"]


@pytest.mark.asyncio
async def test_storage_operations(tmp_path: Path) -> None:
    csv_content = b"col_a,col_b\n10,20\n30,40\n"
    file = UploadFile(filename="sample.csv", file=io.BytesIO(csv_content))
    db_id, db_path, tables = await ingest_uploaded_file(
        file=file,
        db_id="storage_test_db",
        upload_dir=str(tmp_path),
    )

    resolved = resolve_db_path(db_id, upload_dir=str(tmp_path))
    assert Path(resolved).resolve() == Path(db_path).resolve()

    sample = get_table_sample(db_path, tables[0], limit=1)
    assert len(sample) == 1
    assert sample[0] == {"col_a": 10, "col_b": 20}

    deleted = delete_uploaded_database("storage_test_db", upload_dir=str(tmp_path))
    assert deleted is True
    assert not Path(db_path).exists()
