#!/usr/bin/env python3
"""Apply schema migrations before each release."""

from db import connect, is_postgres, require_database

PG_SQL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  initials VARCHAR(5) NOT NULL UNIQUE,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS players_wins_idx ON players (wins DESC, losses ASC, updated_at DESC);
"""

SQLITE_SQL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  initials TEXT NOT NULL UNIQUE,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS players_wins_idx ON players (wins DESC, losses ASC, updated_at DESC);
"""


def main():
    require_database()
    sql = PG_SQL if is_postgres() else SQLITE_SQL
    with connect() as conn:
        cur = conn.cursor()
        for statement in sql.split(";"):
            stmt = statement.strip()
            if stmt:
                cur.execute(stmt)
        cur.execute(
            "INSERT INTO schema_migrations (version) VALUES (%s) ON CONFLICT DO NOTHING"
            if is_postgres()
            else "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
            ("001_players",),
        )
    print("migrations applied")


if __name__ == "__main__":
    main()
