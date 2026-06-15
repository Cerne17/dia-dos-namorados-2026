from http.server import BaseHTTPRequestHandler
import json
import os
import sys

# Ensure the sibling _shared.py is importable regardless of the runtime's
# working directory (Vercel's Python runtime doesn't always put the function's
# own folder on sys.path).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shared import persist_results


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

            # Fan out to every sink (Discord + Upstash), each best-effort.
            sync = persist_results(data)
            print(f"[SERVER] Resultado sincronizado: {sync}")

            self._send(200, {
                "status": "success",
                "message": "Resultados processados.",
                **sync,
            })
        except Exception as e:
            self._send(500, {"status": "error", "message": str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
