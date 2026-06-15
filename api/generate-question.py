from http.server import BaseHTTPRequestHandler
import json
import os

from _shared import generate_next_question


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
            payload = json.loads(post_data.decode('utf-8'))
            previous_answers = payload.get('answers', [])

            api_key = os.environ.get('GEMINI_API_KEY')
            if not api_key:
                self._send(503, {"error": "No API key configured"})
                return

            next_q = generate_next_question(api_key, previous_answers)
            if next_q:
                self._send(200, next_q)
            else:
                self._send(500, {"error": "Failed to generate next question"})
        except Exception as e:
            self._send(500, {"status": "error", "message": str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
