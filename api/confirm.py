from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shared import set_confirmed


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode('utf-8'))

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        try:
            data = json.loads(post_data.decode('utf-8'))
        except Exception:
            self._send(400, {"error": "invalid json"})
            return

        admin_token = os.environ.get('ADMIN_TOKEN')
        if not admin_token or data.get('token') != admin_token:
            self._send(403, {"error": "forbidden"})
            return

        event_date = data.get('eventDate')
        if not event_date:
            self._send(400, {"error": "eventDate obrigatório"})
            return

        confirmed = {
            "eventDate": event_date,
            "selections": data.get('selections', []),
            "note": data.get('note', ''),
            "confirmedAt": datetime.datetime.utcnow().isoformat() + "Z",
        }
        ok = set_confirmed(confirmed)
        self._send(200 if ok else 502, {"status": "ok" if ok else "falha", "confirmed": confirmed})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
