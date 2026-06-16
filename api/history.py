from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shared import get_history


def _valid_token(token):
    """Either the Duda (read) token or the admin token grants read access."""
    history_token = os.environ.get("HISTORY_TOKEN")
    admin_token = os.environ.get("ADMIN_TOKEN")
    return bool(token) and token in {t for t in (history_token, admin_token) if t}


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode('utf-8'))

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        token = (params.get('token') or [None])[0]
        if not _valid_token(token):
            self._send(403, {"error": "forbidden"})
            return
        try:
            self._send(200, get_history())
        except Exception as e:
            self._send(500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
