#!/usr/bin/env python3
import json
import os
import re
import signal
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from db import connect, is_postgres

ROOT = Path(__file__).resolve().parent / "public"
PORT = int(os.environ.get("PORT", "8080"))
INITIALS_RE = re.compile(r"^[A-Z0-9]{5}$")


def normalize_initials(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())[:5]


def json_response(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler):
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0 or length > 4096:
        return None
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def list_ranking(limit=10):
    placeholder = "%s" if is_postgres() else "?"
    sql = f"""
        SELECT initials, wins, losses
        FROM players
        ORDER BY wins DESC, losses ASC, updated_at DESC
        LIMIT {placeholder}
    """
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, (limit,))
        rows = cur.fetchall()
    return [
        {
            "initials": row["initials"],
            "wins": int(row["wins"]),
            "losses": int(row["losses"]),
        }
        for row in rows
    ]


def record_result(initials: str, won: bool):
    now_expr = "NOW()" if is_postgres() else "CURRENT_TIMESTAMP"
    win_inc = 1 if won else 0
    loss_inc = 0 if won else 1
    if is_postgres():
        sql = f"""
            INSERT INTO players (initials, wins, losses)
            VALUES (%s, %s, %s)
            ON CONFLICT (initials) DO UPDATE SET
              wins = players.wins + EXCLUDED.wins,
              losses = players.losses + EXCLUDED.losses,
              updated_at = {now_expr}
            RETURNING initials, wins, losses
        """
        params = (initials, win_inc, loss_inc)
    else:
        sql = f"""
            INSERT INTO players (initials, wins, losses, updated_at)
            VALUES (?, ?, ?, {now_expr})
            ON CONFLICT(initials) DO UPDATE SET
              wins = wins + excluded.wins,
              losses = losses + excluded.losses,
              updated_at = {now_expr}
        """
        params = (initials, win_inc, loss_inc)

    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        if is_postgres():
            row = cur.fetchone()
        else:
            cur.execute(
                "SELECT initials, wins, losses FROM players WHERE initials = ?",
                (initials,),
            )
            row = cur.fetchone()
    return {
        "initials": row["initials"],
        "wins": int(row["wins"]),
        "losses": int(row["losses"]),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_OPTIONS(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/healthz":
            body = b"ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/api/ranking":
            try:
                ranking = list_ranking()
                json_response(self, 200, {"ranking": ranking})
            except Exception as exc:
                print(f"ranking error: {exc}")
                json_response(self, 500, {"error": "failed to load ranking"})
            return

        if path in ("/", ""):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/result":
            json_response(self, 404, {"error": "not found"})
            return

        payload = read_json(self)
        if not isinstance(payload, dict):
            json_response(self, 400, {"error": "invalid json"})
            return

        initials = normalize_initials(str(payload.get("initials", "")))
        if not INITIALS_RE.match(initials):
            json_response(self, 400, {"error": "initials must be exactly 5 A-Z/0-9"})
            return

        if "won" not in payload or not isinstance(payload["won"], bool):
            json_response(self, 400, {"error": "won must be a boolean"})
            return

        try:
            player = record_result(initials, payload["won"])
            ranking = list_ranking()
            json_response(self, 200, {"player": player, "ranking": ranking})
        except Exception as exc:
            print(f"result error: {exc}")
            json_response(self, 500, {"error": "failed to save result"})

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}")


def main():
    if not os.environ.get("DATABASE_URL") and os.environ.get("RUNNING_IN_SHPYRD") == "true":
        raise SystemExit("DATABASE_URL is required in shpyrd")

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)

    def shutdown(signum, frame):
        print(f"shutting down on signal {signum}")
        server.shutdown()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    print(f"dealpong listening on 0.0.0.0:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
