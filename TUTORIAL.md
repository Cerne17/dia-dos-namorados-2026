# Guia de Implantação Completo: Vercel (Python Serverless + Gemini AI)

Este guia orientará você passo a passo sobre como colocar o site do Dia dos Namorados no ar usando a **Vercel** de forma 100% gratuita, com suporte completo ao **Gemini API** para geração dinâmica de perguntas sequenciais e sincronização segura das respostas pelo servidor — enviadas para o seu **Discord** e guardadas de forma permanente em um banco de dados **Upstash Redis** (para você nunca perder um encontro planejado).

---

## Estrutura do Projeto para Deploy na Vercel

O projeto foi preparado com suporte nativo a Vercel Serverless Functions. Os arquivos chave para o deploy são:
- **`/api/generate-question.py`**: Handler em Python que se comunica de forma segura com o Gemini API.
- **`/api/results.py`**: Handler em Python que recebe o itinerário final e o envia para o seu Discord **e** salva no banco de dados Upstash Redis.
- **`/api/_shared.py`**: Módulo compartilhado com toda a lógica (Gemini, Discord, Upstash). Tanto a Vercel quanto o servidor local (`server.py`) usam este mesmo arquivo, então o que você testa localmente é exatamente o que roda em produção.
- **`vercel.json`**: Mapeia as URLs de `/api/generate-question` e `/api/results` para os arquivos serverless do projeto.
- **`requirements.txt`**: Lista as dependências Python (apenas `certifi`, para validação de certificados HTTPS). A Vercel instala isso automaticamente.

Ao fazer o deploy na Vercel, o seu webhook do Discord, a chave do Gemini e as credenciais do Upstash ficam salvos **apenas no servidor**, garantindo que não sejam expostos no navegador da Dudinha.

---

## Passo 1: Criar as Chaves Necessárias

### 1. Obter a Chave de API do Gemini (Gratuita)
1. Acesse o [Google AI Studio](https://aistudio.google.com/) e faça login com sua conta do Google.
2. Clique no botão azul **Get API key** no canto superior esquerdo.
3. Clique em **Create API Key**.
4. Copie a chave gerada (ex: `AIzaSy...`) e guarde-a em um local seguro.

### 2. Obter a URL do Webhook do Discord
1. No Discord, vá até o canal de texto onde deseja receber os resultados.
2. Abra as **Configurações do Canal** (ícone de engrenagem).
3. Selecione **Integrações** no menu esquerdo e clique em **Webhooks**.
4. Clique em **Criar Webhook** (ou **Novo Webhook**).
5. Defina o nome (ex: *Cupido Valentin*) e clique em **Copiar URL do Webhook**.

### 3. Criar o Banco de Dados Upstash Redis (Gratuito)

> **O que é isso, e por que precisamos?**
> O Discord te dá uma *notificação* na hora — ótimo para saber que a Dudinha planejou o encontro. Mas uma mensagem no Discord pode se perder no meio de outras, e você não consegue consultar tudo de forma organizada depois. Por isso, além do Discord, salvamos cada encontro num **banco de dados** permanente.
>
> **Redis** é um tipo de banco de dados muito simples e rápido que guarda informações no formato "chave → valor" (pense numa agenda: você procura por um nome e encontra o telefone). No nosso caso, usamos uma estrutura chamada **lista**: existe uma única chave, `valentine:results`, e cada vez que a Dudinha finaliza um planejamento, adicionamos mais um item nessa lista. No fim, você tem todos os encontros enfileirados, em ordem.
>
> **Upstash** é uma empresa que hospeda esse banco Redis para você na nuvem, de graça, sem precisar instalar nada. Nós conversamos com ele pela internet (via "REST API"), usando duas credenciais: um **endereço** (URL) e uma **senha** (TOKEN).

Passo a passo:

1. Acesse [https://upstash.com](https://upstash.com) e clique em **Sign Up**. O mais fácil é entrar com sua conta do **GitHub** ou **Google** (o mesmo login que você usará na Vercel).
2. No painel (console) do Upstash, no menu superior, selecione **Redis** e depois clique no botão **Create Database**.
3. Preencha:
   - **Name**: um nome qualquer para você se localizar, ex: `dudinea-encontros`.
   - **Primary Region**: escolha a região mais perto do Brasil que aparecer (ex: `us-east-1` / N. Virginia). Isso só afeta a velocidade; qualquer uma funciona.
   - **Plan / Type**: deixe no plano **Free**. Não é preciso cartão de crédito.
4. Clique em **Create**.
5. Você cairá na página do banco recém-criado. Role a página até a seção **REST API** (ou aba **REST**). Lá aparecem exatamente as duas credenciais que precisamos:
   - **`UPSTASH_REDIS_REST_URL`** — o endereço. Algo como `https://xxxx-yyyy-12345.upstash.io`.
   - **`UPSTASH_REDIS_REST_TOKEN`** — a senha. Um texto longo e secreto. Clique no ícone de "olho" para revelar e no ícone de copiar.
6. Guarde esses dois valores junto com a chave do Gemini e a URL do Discord. **Nunca** os coloque diretamente no código ou compartilhe — eles vão apenas nas variáveis de ambiente (Passo 3).

---

## Passo 2: Publicar o Código no GitHub

A forma mais recomendada e simples de usar a Vercel é integrando-a ao seu GitHub para deploy automático a cada alteração.

1. Crie um novo repositório (pode ser privado) no seu GitHub.
2. Inicialize o repositório localmente e faça o push dos arquivos:
   ```bash
   git init
   git add .
   git commit -m "feat: Vercel + Gemini integration"
   git branch -M main
   git remote add origin git@github.com:seu-usuario/dudinea-valentine.git
   git push -u origin main
   ```

---

## Passo 3: Criar o Projeto e Configurar as Variáveis na Vercel

1. Acesse o painel da [Vercel](https://vercel.com/) e faça login (recomenda-se usar a conta do GitHub).
2. Clique no botão **Add New...** no canto superior direito e selecione **Project**.
3. Importe o repositório `dudinea-valentine` que você acabou de criar.
4. Na tela de configuração anterior ao deploy, abra a aba **Environment Variables** (Variáveis de Ambiente).
5. Adicione as **quatro** variáveis seguintes (a chave é o nome à esquerda; o valor é o que você copiou nos passos anteriores). Para cada uma, digite a Key, cole o Value e clique em **Add**:
   - **Variável 1**:
     - **Key**: `GEMINI_API_KEY`
     - **Value**: *[Cole sua chave obtida no Google AI Studio]*
   - **Variável 2**:
     - **Key**: `DISCORD_WEBHOOK_URL`
     - **Value**: *[Cole a URL do webhook do Discord]*
   - **Variável 3**:
     - **Key**: `UPSTASH_REDIS_REST_URL`
     - **Value**: *[Cole o endereço (URL) copiado do Upstash]*
   - **Variável 4**:
     - **Key**: `UPSTASH_REDIS_REST_TOKEN`
     - **Value**: *[Cole o token (senha) copiado do Upstash]*
6. Clique em **Deploy** no rodapé da página.

> **Importante:** os nomes das variáveis (`Key`) precisam ser **exatamente** esses, em maiúsculas, sem espaços. O código procura por esses nomes específicos.
>
> Se faltar a chave do Gemini, o site ainda funciona usando as perguntas fixas do `content.json` (modo de segurança). Se faltarem as credenciais do Upstash ou do Discord, o envio simplesmente é pulado, sem quebrar o site — mas você não receberá/guardará os resultados. Por isso, preencha todas as quatro.

---

## Passo 4: Testar o Fluxo Dinâmico

1. Assim que a Vercel concluir a compilação, ela gerará um link público (ex: `https://dudinea-valentine.vercel.app`).
2. Abra o site, acesse a carta e navegue até a seção do planejador de encontros.
3. Você verá o coração pulsante carregando cada passo dinamicamente através da API do Gemini.
4. No último passo, escreva um comentário de teste e envie.
5. Verifique seu servidor do Discord: o webhook deve enviar o itinerário fofo completo e formatado.
6. O mesmo encontro também já foi salvo no Upstash. Veja como consultar no Passo 5.

---

## Passo 5: Ver os Encontros Salvos no Upstash

Toda vez que alguém finaliza o planejador, o encontro é adicionado a uma lista chamada `valentine:results` no seu banco Redis. Para ler essa lista:

1. Acesse o [console do Upstash](https://console.upstash.com/), clique em **Redis** e abra o banco que você criou (`dudinea-encontros`).
2. Abra a aba **Data Browser** (Navegador de Dados). Você verá a chave `valentine:results` do tipo **List**. Clique nela para ver cada encontro salvo (cada item é um texto em formato JSON com as escolhas e a nota).
3. Alternativa para quem prefere comando: abra a aba **CLI** (dentro da página do banco) e digite:
   ```
   LRANGE valentine:results 0 -1
   ```
   Isso lista **todos** os itens da lista, do primeiro ao último. (`LRANGE` = "ler um trecho da lista"; `0` é o início e `-1` significa "até o fim".)

> Cada item é um JSON parecido com:
> ```json
> {"recipient":"Miguel","timestamp":"...","note":"Levar vinho tinto","selections":[{"question":"Onde...","category":"local","selectedOption":"No aconchego do nosso sofá"}]}
> ```

---

## Testando Localmente (Opcional)

Antes de publicar, você pode rodar tudo no seu computador. O servidor local usa exatamente a mesma lógica da Vercel.

1. Crie um arquivo `.env` na raiz do projeto (ele já está no `.gitignore`, então nunca será enviado ao GitHub) com as quatro variáveis:
   ```
   GEMINI_API_KEY=sua_chave_aqui
   DISCORD_WEBHOOK_URL=sua_url_aqui
   UPSTASH_REDIS_REST_URL=seu_endereco_aqui
   UPSTASH_REDIS_REST_TOKEN=seu_token_aqui
   ```
2. No terminal, carregue as variáveis e suba o servidor:
   ```bash
   set -a; . ./.env; set +a
   python3 server.py
   ```
3. Abra [http://localhost:8000](http://localhost:8000) no navegador. Localmente, cada encontro é salvo em três lugares: no arquivo `results.json` (apenas para conferência local — também ignorado pelo Git), no Discord e no Upstash.
