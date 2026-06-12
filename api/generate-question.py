from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import urllib.request
import urllib.error

def generate_next_question(api_key, previous_answers):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    categories = ['local', 'atividade', 'comida', 'clima']
    num_answers = len(previous_answers)
    
    if num_answers >= len(categories):
        return None
        
    next_category = categories[num_answers]
    
    history_str = ""
    if num_answers > 0:
        history_str = "Decisões que já foram tomadas até o momento:\n"
        for ans in previous_answers:
            history_str += f"- Categoria '{ans.get('category')}': Escolha: '{ans.get('selectedOption')}' (da pergunta: '{ans.get('question')}')\n"
            
    prompt = (
        "Você é o cupido Valentin encarregado de ajudar Miguel e sua namorada Dudinha a planejar o encontro perfeito de Dia dos Namorados. "
        f"Gere a próxima pergunta de planejamento em português para a categoria '{next_category}'. "
        "Você deve ler com muita atenção as escolhas anteriores e gerar uma pergunta e 4 alternativas fofas que façam sentido "
        "e se conectem diretamente com as decisões tomadas até agora de forma criativa, romântica e bem-humorada.\n\n"
        f"{history_str}\n"
        "Exemplos de personalização:\n"
        "- Se escolheram o 'sofá' no passo 1, as atividades no passo 2 devem envolver ficar em casa (como maratona de filmes fofos ou receitas de preguiça).\n"
        "- Se escolheram 'praia' no passo 1, as comidas no passo 3 devem combinar com praia (ex: água de coco, piquenique na areia, peixe).\n"
        "- Se escolheram 'restaurante chique' e 'se arrumar', as comidas no passo 3 devem combinar com um banquete requintado.\n\n"
        "Você deve retornar apenas um objeto JSON com a seguinte estrutura de chaves (sem formatação markdown):\n"
        "{\n"
        "  \"question\": \"Pergunta em português customizada com base nas escolhas anteriores (se existirem)\",\n"
        f"  \"category\": \"{next_category}\",\n"
        "  \"options\": [\n"
        "    \"Opção criativa 1 com emojis\",\n"
        "    \"Opção criativa 2 com emojis\",\n"
        "    \"Opção criativa 3 com emojis\",\n"
        "    \"Opção criativa 4 com emojis\"\n"
        "  ],\n"
        "  \"hint\": \"Uma dica fofa de uma linha em português comentando a escolha anterior (se houver)\"\n"
        "}"
    )
    
    payload = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            text_response = res_data['candidates'][0]['content']['parts'][0]['text']
            return json.loads(text_response)
    except Exception as e:
        print(f"[GEMINI ERROR] Erro na requisição ao Gemini API: {e}", file=sys.stderr)
        return None

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            payload = json.loads(post_data.decode('utf-8'))
            previous_answers = payload.get('answers', [])
            
            api_key = os.environ.get('GEMINI_API_KEY')
            if not api_key:
                self.send_response(503)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "No API key configured"}).encode('utf-8'))
                return
            
            next_q = generate_next_question(api_key, previous_answers)
            if next_q:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(next_q).encode('utf-8'))
            else:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Failed to generate next question"}).encode('utf-8'))
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
