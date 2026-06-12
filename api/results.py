from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import urllib.request
import urllib.error

def forward_to_discord(webhook_url, payload):
    selections = payload.get('selections', [])
    note = payload.get('note', 'Nenhum detalhe adicional.')
    timestamp = payload.get('timestamp', '')
    
    fields = []
    for idx, ans in enumerate(selections):
        fields.append({
            "name": f"✨ Passo {idx + 1}: {ans.get('question')}",
            "value": f"Escolhida: **{ans.get('selectedOption')}**",
            "inline": False
        })
        
    body_data = {
        "username": "Cupido Valentin",
        "avatar_url": "https://images.unsplash.com/photo-1518199266791-5375a83190b7",
        "embeds": [{
            "title": "❤️ A Dudinha acabou de planejar um encontro dos sonhos!",
            "description": f"**Nota Especial:** _\"{note}\"_",
            "color": 16731501, # Rose pink
            "fields": fields,
            "footer": { "text": f"Sincronizado via Vercel Serverless - {timestamp}" }
        }]
    }
    
    req = urllib.request.Request(
        webhook_url,
        data=json.dumps(body_data).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.status == 200 or res.status == 204
    except Exception as e:
        print(f"[DISCORD ERROR] Falha ao enviar para o Discord: {e}", file=sys.stderr)
        return False

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data.decode('utf-8'))
            
            # 1. Try to log to Discord webhook securely from server
            webhook_url = os.environ.get('DISCORD_WEBHOOK_URL')
            webhook_sent = False
            
            if webhook_url:
                webhook_sent = forward_to_discord(webhook_url, data)
                print(f"[SERVER] Webhook de produção enviado com sucesso: {webhook_sent}")
            
            # Send HTTP success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {
                "status": "success", 
                "message": "Resultados processados.",
                "webhook_synced": webhook_sent
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {"status": "error", "message": str(e)}
            self.wfile.write(json.dumps(response).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
