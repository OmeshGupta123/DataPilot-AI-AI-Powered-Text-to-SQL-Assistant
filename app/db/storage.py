import contextlib
import os
from pathlib import Path
from typing import Any

import sqlalchemy
from sqlalchemy import inspect as sa_inspect

from app.api.models import DatabaseInfo, TableColumnInfo, TableSummary
from app.core.config import get_settings


def resolve_db_path(
    db_id: str, spider_data_dir: str | None = None, upload_dir: str | None = None
) -> str:
    """Resolve a db_id into an absolute or relative SQLite database file path.

    Checks:
    1. Direct file path if db_id points to an existing file.
    2. Upload directory ({upload_dir}/{db_id}.sqlite or {upload_dir}/{db_id}/{db_id}.sqlite).
    3. Spider database directory ({spider_data_dir}/database/{db_id}/{db_id}.sqlite).
    4. Defaults to standard Spider database path if not found.
    """
    # 1. Direct path
    p = Path(db_id)
    if p.is_file():
        return str(p)

    settings = get_settings()
    effective_upload_dir = upload_dir or getattr(settings, "upload_dir", "uploads")
    effective_spider_dir = spider_data_dir or getattr(settings, "spider_data_dir", "spider_data")

    if db_id == "sales_demo":
        seed_demo_database(effective_upload_dir)

    # 2. Upload directory checks
    upload_sqlite = Path(effective_upload_dir) / f"{db_id}.sqlite"
    if upload_sqlite.is_file():
        return str(upload_sqlite)

    upload_db = Path(effective_upload_dir) / f"{db_id}.db"
    if upload_db.is_file():
        return str(upload_db)

    upload_nested = Path(effective_upload_dir) / db_id / f"{db_id}.sqlite"
    if upload_nested.is_file():
        return str(upload_nested)

    # 3. Spider database directory check
    spider_db = Path(effective_spider_dir) / "database" / db_id / f"{db_id}.sqlite"
    if spider_db.is_file():
        return str(spider_db)

    # Fallback to spider path
    return str(spider_db)


def get_table_sample(db_path: str, table_name: str, limit: int = 5) -> list[dict[str, Any]]:
    """Retrieve up to `limit` rows from `table_name` formatted as dicts."""
    engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
    sample_rows: list[dict[str, Any]] = []
    try:
        with engine.connect() as conn:
            # Table name is quoted to avoid SQL syntax errors on spaces/special characters
            result = conn.execute(sqlalchemy.text(f'SELECT * FROM "{table_name}" LIMIT :limit'), {"limit": limit})
            cols = list(result.keys())
            for row in result.fetchall():
                sample_rows.append(dict(zip(cols, list(row), strict=False)))
    except Exception:
        pass
    finally:
        engine.dispose()
    return sample_rows


def get_table_data(
    db_path: str, table_name: str, limit: int = 50, offset: int = 0
) -> tuple[int, list[str], list[list[Any]]]:
    """Retrieve total count and paginated rows from `table_name`."""
    engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
    total_count = 0
    column_names: list[str] = []
    rows: list[list[Any]] = []
    try:
        with engine.connect() as conn:
            count_res = conn.execute(sqlalchemy.text(f'SELECT COUNT(*) FROM "{table_name}"'))
            total_count = int(count_res.scalar() or 0)

            result = conn.execute(
                sqlalchemy.text(f'SELECT * FROM "{table_name}" LIMIT :limit OFFSET :offset'),
                {"limit": limit, "offset": offset},
            )
            column_names = list(result.keys())
            rows = [list(r) for r in result.fetchall()]
    finally:
        engine.dispose()
    return total_count, column_names, rows


def get_database_info(
    db_id: str, db_path: str, source: str = "uploaded"
) -> DatabaseInfo:
    """Introspect a SQLite database and return a comprehensive DatabaseInfo summary."""
    engine = sqlalchemy.create_engine(f"sqlite:///{db_path}")
    inspector = sa_inspect(engine)
    tables: list[TableSummary] = []

    try:
        table_names = inspector.get_table_names()
        with engine.connect() as conn:
            for tbl in table_names:
                pk_cols = set(inspector.get_pk_constraint(tbl).get("constrained_columns", []))
                columns = [
                    TableColumnInfo(
                        name=str(col["name"]),
                        data_type=str(col["type"]),
                        is_primary_key=col["name"] in pk_cols,
                        is_nullable=bool(col.get("nullable", True)),
                    )
                    for col in inspector.get_columns(tbl)
                ]

                # Row count
                try:
                    count_res = conn.execute(sqlalchemy.text(f'SELECT COUNT(*) FROM "{tbl}"'))
                    row_count = int(count_res.scalar() or 0)
                except Exception:
                    row_count = 0

                sample = get_table_sample(db_path, tbl, limit=5)
                tables.append(
                    TableSummary(
                        name=tbl,
                        row_count=row_count,
                        columns=columns,
                        sample_rows=sample,
                    )
                )
    finally:
        engine.dispose()

    file_size: int | None = None
    with contextlib.suppress(OSError):
        file_size = os.path.getsize(db_path)

    return DatabaseInfo(
        db_id=db_id,
        name=Path(db_path).stem,
        source=source,
        tables=tables,
        file_size_bytes=file_size,
    )


def seed_demo_database(upload_dir: str | None = None) -> None:
    """Ensure a default demo database (sales_demo.sqlite) exists with sample products and orders."""
    import sqlite3

    settings = get_settings()
    effective_upload_dir = Path(upload_dir or getattr(settings, "upload_dir", "uploads"))
    effective_upload_dir.mkdir(parents=True, exist_ok=True)
    demo_db_path = effective_upload_dir / "sales_demo.sqlite"

    if demo_db_path.exists():
        return

    try:
        conn = sqlite3.connect(str(demo_db_path))
        c = conn.cursor()
        c.execute("""CREATE TABLE IF NOT EXISTS products (
            product_id INTEGER PRIMARY KEY,
            name TEXT,
            description TEXT,
            price REAL,
            stock_quantity INTEGER
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS order_items (
            order_item_id INTEGER PRIMARY KEY,
            order_id INTEGER,
            product_id INTEGER,
            quantity INTEGER,
            price_per_unit REAL
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS orders (
            order_id INTEGER PRIMARY KEY,
            user_id INTEGER,
            order_date TEXT,
            total_amount REAL
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            email TEXT,
            created_at TEXT
        )""")
        c.executemany("INSERT INTO products VALUES (?, ?, ?, ?, ?)", [
            (1, "Wireless Noise-Canceling Headphones", "Premium over-ear audio with 30h battery", 199.99, 45),
            (2, "Ergonomic Mechanical Keyboard", "RGB mechanical keyboard with red linear switches", 129.50, 60),
            (3, "Ultra-Wide Curved Monitor 34-inch", "144Hz WQHD IPS display for productivity", 499.00, 20),
            (4, "USB-C Multi-Port Docking Station", "Dual 4K HDMI, 100W Power Delivery, Gigabit LAN", 79.99, 110),
            (5, "Precision Wireless Mouse", "High-accuracy sensor with silent click switches", 49.99, 85),
        ])
        c.executemany("INSERT INTO order_items VALUES (?, ?, ?, ?, ?)", [
            (1, 101, 1, 2, 199.99),
            (2, 101, 5, 1, 49.99),
            (3, 102, 2, 1, 129.50),
            (4, 103, 3, 1, 499.00),
            (5, 103, 4, 2, 79.99),
            (6, 104, 1, 3, 199.99),
            (7, 105, 4, 1, 79.99),
            (8, 106, 5, 4, 49.99),
        ])
        c.executemany("INSERT INTO orders VALUES (?, ?, ?, ?)", [
            (101, 1, "2026-03-01", 449.97),
            (102, 2, "2026-03-02", 129.50),
            (103, 3, "2026-03-03", 658.98),
            (104, 1, "2026-03-04", 599.97),
            (105, 4, "2026-03-05", 79.99),
            (106, 2, "2026-03-06", 199.96),
        ])
        c.executemany("INSERT INTO users VALUES (?, ?, ?, ?)", [
            (1, "sarah_tech", "sarah@example.com", "2026-01-15 10:20:00"),
            (2, "alex_dev", "alex@example.com", "2026-01-20 14:10:00"),
            (3, "elena_data", "elena@example.com", "2026-02-01 09:30:00"),
            (4, "marcus_ai", "marcus@example.com", "2026-02-10 16:45:00"),
        ])
        conn.commit()
        conn.close()
    except Exception:
        pass


def list_all_databases(
    spider_data_dir: str | None = None, upload_dir: str | None = None
) -> list[DatabaseInfo]:
    """Scan and list all databases from both uploaded directory and spider dataset."""
    seed_demo_database(upload_dir)
    settings = get_settings()
    effective_upload_dir = Path(upload_dir or getattr(settings, "upload_dir", "uploads"))
    effective_spider_dir = Path(spider_data_dir or getattr(settings, "spider_data_dir", "spider_data"))

    databases: list[DatabaseInfo] = []

    # 1. Uploaded databases
    if effective_upload_dir.exists():
        for file in effective_upload_dir.glob("*.sqlite"):
            try:
                db_id = file.stem
                databases.append(get_database_info(db_id, str(file), source="uploaded"))
            except Exception:
                continue
        for file in effective_upload_dir.glob("*.db"):
            try:
                db_id = file.stem
                databases.append(get_database_info(db_id, str(file), source="uploaded"))
            except Exception:
                continue

    # 2. Spider databases
    spider_db_root = effective_spider_dir / "database"
    if spider_db_root.exists():
        for db_folder in spider_db_root.iterdir():
            if db_folder.is_dir():
                sqlite_file = db_folder / f"{db_folder.name}.sqlite"
                if sqlite_file.is_file():
                    try:
                        databases.append(
                            get_database_info(
                                db_folder.name, str(sqlite_file), source="spider"
                            )
                        )
                    except Exception:
                        continue

    return databases


def delete_uploaded_database(db_id: str, upload_dir: str | None = None) -> bool:
    """Delete an uploaded SQLite database file if it exists."""
    settings = get_settings()
    effective_upload_dir = Path(upload_dir or getattr(settings, "upload_dir", "uploads"))
    deleted = False

    for ext in [".sqlite", ".db"]:
        target = effective_upload_dir / f"{db_id}{ext}"
        if target.is_file():
            target.unlink()
            deleted = True

    nested = effective_upload_dir / db_id
    if nested.is_dir():
        for f in nested.glob("*"):
            f.unlink()
        nested.rmdir()
        deleted = True

    return deleted
