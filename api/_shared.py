"""Shared logic for both the local dev server (server.py) and the Vercel
serverless handlers (api/*.py). Single source of truth — keep all Gemini,
Discord and Upstash logic here so the two entry points never drift.

The leading underscore tells Vercel this file is not a route, while still
bundling it alongside the handlers in the api/ directory.
"""
import json
import os
import ssl
import sys
import urllib.request
import urllib.error

# Some Python installs (e.g. python.org builds on macOS) ship without a usable
# CA bundle, so urllib raises CERTIFICATE_VERIFY_FAILED. Prefer certifi's bundle
# when available; fall back to the system default (works on Vercel/Linux).
try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL_CTX = ssl.create_default_context()

# Tried in order. If one is overloaded (HTTP 503 "high demand") or rate-limited
# (429), we fall through to the next — failures return fast, so this is cheap
# and greatly improves availability. The themed offline fallback covers the
# case where every model is down.
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]
# Ordered pool of planner categories. A session uses the first N of these,
# where N (3-6) is chosen by the client per run, so some dates are shorter and
# others longer. The client's fallback order in app.js must match this list.
CATEGORIES = ["local", "atividade", "comida", "bebida", "clima", "sobremesa"]
UPSTASH_LIST_KEY = "valentine:results"


def _request_gemini(model, api_key, payload):
    """Single Gemini call. Returns the parsed question dict or raises."""
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=8, context=_SSL_CTX) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        text_response = res_data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text_response)


def generate_next_question(api_key, previous_answers):
    """Ask Gemini for the next planner question, customized by prior picks.

    Tries each model in GEMINI_MODELS until one succeeds. Returns the parsed
    question dict, or None on total failure (caller should fall back to the
    static pool in content.json)."""
    num_answers = len(previous_answers)
    if num_answers >= len(CATEGORIES):
        return None

    next_category = CATEGORIES[num_answers]

    history_str = ""
    if num_answers > 0:
        history_str = "Decisões que já foram tomadas até o momento:\n"
        for ans in previous_answers:
            history_str += (
                f"- Categoria '{ans.get('category')}': Escolha: "
                f"'{ans.get('selectedOption')}' (da pergunta: '{ans.get('question')}')\n"
            )

    prompt = (
        "Você está ajudando a Dudinha (a Duda) a montar o encontro de Dia dos Namorados dela com o namorado, o Miguel. "
        "Fale SEMPRE com a Duda na segunda pessoa ('você'). Quem escolhe é a DUDA — as perguntas e alternativas são dirigidas a ela, perguntando o que ELA quer para o encontro. NUNCA trate o Miguel como quem responde.\n\n"
        "TOM: natural, leve e descontraído, como uma amiga animada conversando — com um toque romântico e bom humor, mas SEM exagero. "
        "EVITE: linguagem cafona ou melosa, clichês de cupido, bordões repetitivos (NÃO comece com 'Ah, Dudinha...', 'Meu coração de cupido...' e parecidos), adjetivos grudentos empilhados ('mágico', 'dos sonhos', 'perfeito', 'derretendo'). "
        "Seja direto, gostoso de ler e com personalidade. No máximo 1 emoji por opção (e só se ficar natural; pode não ter nenhum).\n\n"
        "VARIEDADE (muito importante): a cada geração, traga alternativas BEM diferentes das óbvias e diferentes entre si. "
        "Misture o esperado com o inusitado e espontâneo — surpreenda. Fuja do lugar-comum, evite sempre as mesmas 4 ideias. "
        "Pense em opções específicas e com cara de vida real (lugares, pratos, atividades concretas), não genéricas.\n\n"
        "Exemplos do estilo e da VARIEDADE que queremos (são só inspiração de formato e energia — NÃO copie, crie outras):\n\n"
        "Exemplo A (categoria 'local', sem escolhas anteriores):\n"
        "{\"question\": \"Bora decidir o cenário: onde rola esse encontro?\", \"category\": \"local\", "
        "\"options\": [\"Rooftop com vista da cidade e luzinhas\", \"Trilha curta até uma cachoeira escondida\", \"Piquenique de toalha xadrez no parque\", \"Bar de vinho escondido numa viela\"], "
        "\"hint\": \"Pode ser do mais agitado ao mais sossegado, escolhe o clima\"}\n\n"
        "Exemplo B (categoria 'atividade', depois que ela escolheu 'praia'):\n"
        "{\"question\": \"Já que é praia, o que vocês aprontam por lá?\", \"category\": \"atividade\", "
        "\"options\": [\"Caçar o pôr do sol com a câmera na mão\", \"Construir um castelo de areia ridiculamente grande 🏖️\", \"Stand up paddle e cair na água rindo\", \"Rede na sombra lendo um pro outro\"], "
        "\"hint\": \"Da adrenalina à preguiça boa, tem de tudo\"}\n\n"
        "Exemplo C (categoria 'comida', depois de 'sofá' + 'maratona de série'):\n"
        "{\"question\": \"Maratona pede companhia certa: o que vai de comida?\", \"category\": \"comida\", "
        "\"options\": [\"Rodízio de pizza no capricho\", \"Tábua de petiscos pra beliscar a noite toda\", \"Miojo gourmet incrementado (sem julgamentos)\", \"Sushi pra dividir no sofá\"], "
        "\"hint\": \"Combina com episódio atrás de episódio\"}\n\n"
        f"Agora gere a PRÓXIMA pergunta, em português, para a categoria '{next_category}'. "
        "Leia as escolhas anteriores e conecte a pergunta e as 4 alternativas ao que a Duda já escolheu.\n\n"
        f"{history_str}\n"
        "Retorne APENAS um objeto JSON com esta estrutura (sem markdown):\n"
        "{\n"
        "  \"question\": \"Pergunta curta e natural, conectada às escolhas anteriores (se houver)\",\n"
        f"  \"category\": \"{next_category}\",\n"
        "  \"options\": [\"Alternativa 1\", \"Alternativa 2\", \"Alternativa 3\", \"Alternativa 4\"],\n"
        "  \"hint\": \"Uma frase curta e leve comentando a escolha anterior (se houver), sem ser melosa\"\n"
        "}"
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            # gemini-2.5-flash "thinks" before answering by default, which is
            # the main source of latency here. We don't need reasoning for short
            # creative JSON, so disable it for a big speedup.
            "thinkingConfig": {"thinkingBudget": 0},
            "maxOutputTokens": 800,
            # Higher temperature + topP for more spontaneous, varied options.
            # The few-shot examples keep the tone in check despite the heat.
            "temperature": 1.2,
            "topP": 0.97,
        },
    }

    for model in GEMINI_MODELS:
        try:
            return _request_gemini(model, api_key, payload)
        except Exception as e:
            print(f"[GEMINI ERROR] modelo {model} falhou: {e}", file=sys.stderr)
            continue
    return None


def forward_to_discord(webhook_url, payload):
    """Send the finished plan to Discord as a rich embed. Best-effort."""
    selections = payload.get("selections", [])
    note = payload.get("note", "Nenhum detalhe adicional.")
    timestamp = payload.get("timestamp", "")

    fields = []
    for idx, ans in enumerate(selections):
        fields.append({
            "name": f"✨ Passo {idx + 1}: {ans.get('question')}",
            "value": f"Escolhida: **{ans.get('selectedOption')}**",
            "inline": False,
        })

    body_data = {
        "username": "Cupido Valentin",
        "avatar_url": "https://images.unsplash.com/photo-1518199266791-5375a83190b7",
        "embeds": [{
            "title": "❤️ A Dudinha acabou de planejar um encontro dos sonhos!",
            "description": f"**Nota Especial:** _\"{note}\"_",
            "color": 16731501,  # Rose pink
            "fields": fields,
            "footer": {"text": f"Sincronizado via Cupido Valentin - {timestamp}"},
        }],
    }

    req = urllib.request.Request(
        webhook_url,
        data=json.dumps(body_data).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            # Discord 403s the default Python-urllib User-Agent; send a real one.
            "User-Agent": "CupidoValentin/1.0 (+https://github.com/Cerne17)",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10, context=_SSL_CTX) as res:
            return res.status in (200, 204)
    except Exception as e:
        print(f"[DISCORD ERROR] Falha ao enviar para o Discord: {e}", file=sys.stderr)
        return False


def push_to_upstash(payload):
    """Append the plan to a durable Upstash Redis list via REST. Best-effort."""
    url = os.environ.get("UPSTASH_REDIS_REST_URL")
    token = os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    if not url or not token:
        return False

    value = json.dumps(payload, ensure_ascii=False)
    command = json.dumps(["RPUSH", UPSTASH_LIST_KEY, value]).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=command,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10, context=_SSL_CTX) as res:
            return res.status == 200
    except Exception as e:
        print(f"[UPSTASH ERROR] Falha ao persistir no Upstash: {e}", file=sys.stderr)
        return False


def persist_results(payload):
    """Fan out a finished plan to every sink. Each is best-effort and
    independent — one failing never blocks the others. Returns a status dict."""
    discord_url = os.environ.get("DISCORD_WEBHOOK_URL")
    return {
        "discord_synced": forward_to_discord(discord_url, payload) if discord_url else False,
        "upstash_synced": push_to_upstash(payload),
    }
