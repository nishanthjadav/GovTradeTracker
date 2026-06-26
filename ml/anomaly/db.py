from __future__ import annotations

import os

import psycopg


def _normalize(url: str) -> str:
    # strip jdbc: prefix that sometimes leaks in from spring config
    if url.startswith("jdbc:"):
        url = url[len("jdbc:"):]
    return url


def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL env var is not set. Set it to the Postgres "
            "connection string (postgres://user:pass@host:port/dbname)."
        )
    return psycopg.connect(_normalize(url))
