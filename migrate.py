#!/usr/bin/env python3
"""Apply schema migrations before each release."""

from db import connect, is_postgres, require_database


def bootstrap_statements():
    if is_postgres():
        return [
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version TEXT PRIMARY KEY,
              applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS players (
              id BIGSERIAL PRIMARY KEY,
              initials VARCHAR(5) NOT NULL UNIQUE,
              wins DOUBLE PRECISION NOT NULL DEFAULT 0,
              losses DOUBLE PRECISION NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            "CREATE INDEX IF NOT EXISTS players_wins_idx ON players (wins DESC, losses ASC, updated_at DESC)",
        ]
    return [
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          initials TEXT NOT NULL UNIQUE,
          wins REAL NOT NULL DEFAULT 0,
          losses REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
        "CREATE INDEX IF NOT EXISTS players_wins_idx ON players (wins DESC, losses ASC, updated_at DESC)",
    ]


def migration_002_statements():
    if is_postgres():
        return [
            "ALTER TABLE players ALTER COLUMN wins TYPE DOUBLE PRECISION USING wins::double precision",
            "ALTER TABLE players ALTER COLUMN losses TYPE DOUBLE PRECISION USING losses::double precision",
        ]
    return []


def applied(cur):
    cur.execute("SELECT version FROM schema_migrations")
    rows = cur.fetchall()
    return {row["version"] if isinstance(row, dict) else row[0] for row in rows}


def mark(cur, version):
    if is_postgres():
        cur.execute(
            "INSERT INTO schema_migrations (version) VALUES (%s) ON CONFLICT DO NOTHING",
            (version,),
        )
    else:
        cur.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
            (version,),
        )


def run_statements(cur, statements):
    for statement in statements:
        stmt = statement.strip()
        if stmt:
            cur.execute(stmt)


def main():
    require_database()
    with connect() as conn:
        cur = conn.cursor()
        run_statements(cur, bootstrap_statements())
        mark(cur, "001_players")
        versions = applied(cur)
        if "002_speed_points" not in versions:
            run_statements(cur, migration_002_statements())
            mark(cur, "002_speed_points")
    print("migrations applied")


if __name__ == "__main__":
    main()
