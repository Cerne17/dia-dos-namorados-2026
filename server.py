import http.server
import socketserver
import json
import os
import sys

# Reuse the exact same logic the Vercel handlers run, so local dev behaves
# identically to production.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'api'))
from _shared import generate_next_question, persist_results, get_history, set_confirmed
import datetime
from urllib.parse import urlparse, parse_qs

PORT = 8000
RESULTS_FILE = 'results.json'


def save_to_file(data):
    """Local-only convenience: append the plan to results.json on disk."""
    results = []
    if os.path.exists(RESULTS_FILE):
        try:
            with open(RESULTS_FILE, 'r', encoding='utf-8') as f:
                results = json.load(f)
                if not isinstance(results, list):
                    results = []
        except Exception:
            results = []

    results.append(data)
    with open(RESULTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def _send(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode('utf-8'))

    def do_GET(self):
        if urlparse(self.path).path == '/api/history':
            params = parse_qs(urlparse(self.path).query)
            token = (params.get('token') or [None])[0]
            valid = {t for t in (os.environ.get('HISTORY_TOKEN'), os.environ.get('ADMIN_TOKEN')) if t}
            if not token or token not in valid:
                self._send(403, {"error": "forbidden"})
                return
            try:
                self._send(200, get_history())
            except Exception as e:
                self._send(500, {"error": str(e)})
            return
        # Static files
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/confirm':
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
            if not data.get('eventDate'):
                self._send(400, {"error": "eventDate obrigatório"})
                return
            confirmed = {
                "eventDate": data.get('eventDate'),
                "selections": data.get('selections', []),
                "note": data.get('note', ''),
                "confirmedAt": datetime.datetime.utcnow().isoformat() + "Z",
            }
            ok = set_confirmed(confirmed)
            self._send(200 if ok else 502, {"status": "ok" if ok else "falha", "confirmed": confirmed})
            return

        if self.path == '/api/results':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                data = json.loads(post_data.decode('utf-8'))

                # Dev parity: persist to disk AND fan out to Discord + Upstash.
                save_to_file(data)
                sync = persist_results(data)
                print(f"[SERVER] Encontro salvo em {RESULTS_FILE}; sync: {sync}")

                self._send(200, {
                    "status": "success",
                    "message": "Respostas salvas com sucesso.",
                    **sync,
                })
            except Exception as e:
                print(f"[SERVER] Erro ao salvar POST de respostas: {e}", file=sys.stderr)
                self._send(500, {"status": "error", "message": str(e)})

        elif self.path == '/api/generate-question':
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
                print(f"[SERVER] Erro ao gerar pergunta: {e}", file=sys.stderr)
                self._send(500, {"status": "error", "message": str(e)})
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


if __name__ == '__main__':
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print(f"[SERVER] Servidor rodando na porta {PORT}...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[SERVER] Servidor finalizado.")
            sys.exit(0)
