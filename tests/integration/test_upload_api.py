import io
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.models import QueryResponse
from app.main import create_app


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.mark.asyncio
async def test_full_upload_and_query_flow(app: FastAPI, tmp_path: Path) -> None:
    csv_data = b"customer_id,name,city,total_spend\n1,Alice,New York,1200.50\n2,Bob,London,850.00\n3,Charlie,Paris,2400.00\n"

    from app.core.config import get_settings

    custom_settings = get_settings().model_copy(update={"upload_dir": str(tmp_path)})
    with (
        patch("app.core.config.get_settings", return_value=custom_settings),
        patch("app.db.storage.get_settings", return_value=custom_settings),
        patch("app.db.ingest.get_settings", return_value=custom_settings),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Upload the CSV file
            files = {"file": ("customers.csv", io.BytesIO(csv_data), "text/csv")}
            data = {"db_id": "test_crm", "table_name": "customers"}
            upload_res = await client.post("/upload", files=files, data=data)

            assert upload_res.status_code == 200, upload_res.text
            upload_json = upload_res.json()
            assert upload_json["success"] is True
            assert upload_json["db_id"] == "test_crm"
            assert len(upload_json["tables"]) == 1
            table = upload_json["tables"][0]
            assert table["name"] == "customers"
            assert table["row_count"] == 3
            assert len(table["columns"]) == 4

            # 2. List databases
            list_res = await client.get("/databases")
            assert list_res.status_code == 200
            db_ids = [d["db_id"] for d in list_res.json()["databases"]]
            assert "test_crm" in db_ids

            # 3. Get database details
            detail_res = await client.get("/databases/test_crm")
            assert detail_res.status_code == 200
            detail_json = detail_res.json()
            assert detail_json["db_id"] == "test_crm"
            assert len(detail_json["tables"]) == 1
            assert len(detail_json["tables"][0]["sample_rows"]) == 3

            # 4. Get table rows with pagination
            rows_res = await client.get("/databases/test_crm/tables/customers/data?limit=2&offset=0")
            assert rows_res.status_code == 200
            rows_json = rows_res.json()
            assert rows_json["total_rows"] == 3
            assert rows_json["column_names"] == ["customer_id", "name", "city", "total_spend"]
            assert len(rows_json["rows"]) == 2

            # 5. Execute query on the uploaded database
            mock_pipeline_response = QueryResponse(
                question="Show customers in London",
                generated_sql="SELECT customer_id, name, city, total_spend FROM customers WHERE city = 'London'",
                answer="[[2, 'Bob', 'London', 850.0]]",
                column_names=["customer_id", "name", "city", "total_spend"],
                rows=[[2, "Bob", "London", 850.0]],
            )

            with patch("app.api.routes.get_pipeline") as mock_get_pipeline:
                mock_pipeline = MagicMock()
                mock_pipeline.run = AsyncMock(return_value=mock_pipeline_response)
                mock_get_pipeline.return_value = mock_pipeline

                query_res = await client.post(
                    "/query",
                    json={"question": "Show customers in London", "db_id": "test_crm"},
                )
                assert query_res.status_code == 200
                q_json = query_res.json()
                assert q_json["generated_sql"] == "SELECT customer_id, name, city, total_spend FROM customers WHERE city = 'London'"
                assert q_json["column_names"] == ["customer_id", "name", "city", "total_spend"]
                assert q_json["rows"] == [[2, "Bob", "London", 850.0]]

            # 5b. Direct SQL execution via /execute
            exec_res = await client.post(
                "/execute",
                json={
                    "sql": "SELECT name, total_spend FROM customers ORDER BY total_spend DESC",
                    "db_id": "test_crm",
                },
            )
            assert exec_res.status_code == 200
            e_json = exec_res.json()
            assert e_json["success"] is True
            assert e_json["column_names"] == ["name", "total_spend"]
            assert len(e_json["rows"]) == 3
            assert e_json["rows"][0] == ["Charlie", 2400.0]

            # 5c. SQL validation failure on non-SELECT
            bad_exec_res = await client.post(
                "/execute",
                json={
                    "sql": "DROP TABLE customers",
                    "db_id": "test_crm",
                },
            )
            assert bad_exec_res.status_code == 200
            bad_json = bad_exec_res.json()
            assert bad_json["success"] is False
            assert "validation error" in bad_json["error"]

            # 6. Delete the database
            del_res = await client.delete("/databases/test_crm")
            assert del_res.status_code == 200
            assert del_res.json()["status"] == "deleted"

            # 7. Verify 404 after deletion
            detail_after_del = await client.get("/databases/test_crm")
            assert detail_after_del.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_database(app: FastAPI) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/databases/nonexistent_xyz")
        assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_database(app: FastAPI) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.delete("/databases/nonexistent_xyz")
        assert res.status_code == 404
