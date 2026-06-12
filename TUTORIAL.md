# Guia de Implantação Completo: Vercel (Python Serverless + Gemini AI)

Este guia orientará você passo a passo sobre como colocar o site do Dia dos Namorados no ar usando a **Vercel** de forma 100% gratuita, com suporte completo ao **Gemini API** para geração dinâmica de perguntas sequenciais e sincronização de respostas segura pelo servidor.

---

## Estrutura do Projeto para Deploy na Vercel

O projeto foi preparado com suporte nativo a Vercel Serverless Functions. Os arquivos chave para o deploy são:
- **`/api/generate-question.py`**: Handler em Python que se comunica de forma segura com o Gemini API.
- **`/api/results.py`**: Handler em Python que recebe o itinerário final e o envia de forma segura para o seu Discord.
- **`vercel.json`**: Mapeia as URLs de `/api/generate-question` e `/api/results` para os arquivos serverless do projeto.

Ao fazer o deploy na Vercel, o seu webhook do Discord e a chave do Gemini ficam salvos **apenas no servidor**, garantindo que não sejam expostos no navegador da Dudinha.

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
5. Adicione as duas variáveis seguintes:
   - **Variável 1**:
     - **Key**: `GEMINI_API_KEY`
     - **Value**: *[Cole sua chave obtida no Google AI Studio]*
   - **Variável 2**:
     - **Key**: `DISCORD_WEBHOOK_URL`
     - **Value**: *[Cole a URL do webhook do Discord]*
6. Clique em **Deploy** no rodapé da página.

*Nota: Não é necessário preencher o campo `"webhookUrl"` no arquivo `content.json` quando implantado na Vercel. O arquivo `/api/results.py` utilizará a chave `DISCORD_WEBHOOK_URL` salva na Vercel para enviar os resultados de forma invisível e segura!*

---

## Passo 4: Testar o Fluxo Dinâmico

1. Assim que a Vercel concluir a compilação, ela gerará um link público (ex: `https://dudinea-valentine.vercel.app`).
2. Abra o site, acesse a carta e navegue até a seção do planejador de encontros.
3. Você verá o coração pulsante carregando cada passo dinamicamente através da API do Gemini.
4. No último passo, escreva um comentário de teste e envie.
5. Verifique seu servidor do Discord: o webhook deve enviar o itinerário fofo completo e formatado.
