import os
import sqlite3
from contextlib import contextmanager

DATABASE_URL = os.environ.get("DATABASE_URL", "file:./dev.db")


def _is_sqlite(url: str) -> bool:
    return url.startswith("file:") or url.startswith("sqlite:")


def _sqlite_path(url: str) -> str:
    if url.startswith("sqlite:///"):
        return url[len("sqlite:///") :]
    if url.startswith("file:"):
        return url[len("file:") :]
    return "./dev.db"


@contextmanager
def connect():
    if _is_sqlite(DATABASE_URL):
        path = _sqlite_path(DATABASE_URL)
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        return

    import psycopg
    from psycopg.rows import dict_row

    # psycopg accepts postgres:// and postgresql://
    url = DATABASE_URL
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    conn = psycopg.connect(url, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def is_postgres() -> bool:
    return not _is_sqlite(DATABASE_URL)


def require_database():
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is required")
