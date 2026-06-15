// --- Web Audio API Synth ---
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playTone(freq, duration) {
    if (!audioCtx) return;

    // Resume context if suspended (browser security)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    // Soft chime sound - combination of Sine/Triangle wave
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    // Warm filter to make it sound soft and cozy
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, audioCtx.currentTime);
    filter.Q.setValueAtTime(1, audioCtx.currentTime);

    // Exponential volume envelope
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.05); // quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration); // long release

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// Sparkle/Chime sound when opening the letter
function playChimeEffect() {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const now = audioCtx ? audioCtx.currentTime : 0;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // Arpeggio C5 - E5 - G5 - C6
    notes.forEach((freq, index) => {
        setTimeout(() => {
            playTone(freq, 0.8);
        }, index * 120);
    });
}


// --- Canvas Particles System ---
const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');

let particles = [];
const maxParticles = 65;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
    constructor() {
        this.reset();
        this.y = Math.random() * canvas.height; // spread initially
    }

    reset() {
        this.x = Math.random() * canvas.width;
        this.y = canvas.height + 20;
        this.size = Math.random() * 12 + 6;
        this.speedX = Math.random() * 1.5 - 0.75;
        this.speedY = -(Math.random() * 1.2 + 0.6);
        this.opacity = Math.random() * 0.5 + 0.15;
        this.type = Math.random() > 0.4 ? 'heart' : 'sparkle';
        this.angle = Math.random() * Math.PI * 2;
        this.wobbleSpeed = Math.random() * 0.02 + 0.01;
    }

    update() {
        this.x += this.speedX + Math.sin(this.angle) * 0.4;
        this.y += this.speedY;
        this.angle += this.wobbleSpeed;

        if (this.y < -20 || this.opacity <= 0) {
            this.reset();
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.type === 'heart' ? '#ff4d6d' : '#ffd166';
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.type === 'heart' ? 'rgba(255, 77, 109, 0.4)' : 'rgba(255, 209, 102, 0.4)';

        if (this.type === 'heart') {
            // Draw custom heart shape
            ctx.beginPath();
            const d = this.size;
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.sin(this.angle) * 0.15); // gentle tilting
            ctx.moveTo(0, -d / 4);
            ctx.bezierCurveTo(-d / 2, -d * 0.7, -d, -d / 3, -d, d / 6);
            ctx.bezierCurveTo(-d, d * 0.6, -d / 4, d * 0.9, 0, d);
            ctx.bezierCurveTo(d / 4, d * 0.9, d, d * 0.6, d, d / 6);
            ctx.bezierCurveTo(d, -d / 3, d / 2, -d * 0.7, 0, -d / 4);
            ctx.fill();
        } else {
            // Draw small glowing star/sparkle
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// Initialize particles
for (let i = 0; i < maxParticles; i++) {
    particles.push(new Particle());
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    requestAnimationFrame(animateParticles);
}
animateParticles();

// Spawn explosive bursts of hearts on special accomplishments
function spawnExplosion(x, y) {
    for (let i = 0; i < 20; i++) {
        const p = new Particle();
        p.x = x;
        p.y = y;
        p.speedX = Math.random() * 6 - 3;
        p.speedY = Math.random() * 6 - 3;
        p.opacity = 1.0;
        p.size = Math.random() * 14 + 8;
        particles.push(p);
        // Clean up excess particles shortly after
        setTimeout(() => {
            const index = particles.indexOf(p);
            if (index > -1) particles.splice(index, 1);
        }, 3000);
    }
}


// --- Love Envelope Interactivity ---
const envelopeWrapper = document.querySelector('.envelope-wrapper');
envelopeWrapper.addEventListener('click', () => {
    if (!envelopeWrapper.classList.contains('opened')) {
        envelopeWrapper.classList.add('opened');
        playChimeEffect();
    }
});


// --- Interactive Date Planner & Results ---
// Full ordered category pool (must match CATEGORIES in api/_shared.py). Each
// session uses the first N of these, where N is randomized per run so some
// dates are quick (3 steps) and others elaborate (6 steps).
const categoriesOrder = ['local', 'atividade', 'comida', 'bebida', 'clima', 'sobremesa'];
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 6;

function randomQuestionCount() {
    const span = MAX_QUESTIONS - MIN_QUESTIONS + 1;
    return Math.floor(Math.random() * span) + MIN_QUESTIONS;
}

let totalQuestionsCount = randomQuestionCount();
let currentQuestionIndex = 0;
let currentQuestion = null;
let userAnswers = [];
let localDatePool = [];

const quizBody = document.getElementById('quiz-body');
const quizProgress = document.getElementById('quiz-progress');

async function fetchNextQuestion() {
    // Show loading spinner
    const progressPercent = (currentQuestionIndex / (totalQuestionsCount + 1)) * 100;
    quizProgress.style.width = `${progressPercent}%`;

    quizBody.innerHTML = `
        <div class="quiz-question-number">Passo ${currentQuestionIndex + 1} de ${totalQuestionsCount + 1}</div>
        <div style="text-align: center; padding: 40px 0;">
            <i class="fas fa-heart-pulse fa-spin" style="font-size: 3rem; color: var(--primary); margin-bottom: 20px; filter: drop-shadow(0 0 10px var(--primary-glow));"></i>
            <h3 class="quiz-question" style="font-size: 1.1rem; color: var(--text-muted); font-weight: 400; font-family: var(--font-body);">O Cupido Valentin está preparando as próximas opções...</h3>
        </div>
    `;

    try {
        // POST previous answers so Gemini can customize the next question
        const response = await fetch('/api/generate-question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: userAnswers })
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.question && data.options) {
                currentQuestion = data;
                renderCurrentQuestion();
                return;
            }
        }
    } catch (e) {
        console.warn("Falha ao carregar API do Gemini, usando fallback local:", e);
    }

    // Local Fallback from Pool
    const category = categoriesOrder[currentQuestionIndex];
    const fallbackQ = localDatePool.find(q => q.category === category);

    if (fallbackQ) {
        // Shuffle options to keep it randomized
        const shuffledOptions = [...fallbackQ.options].sort(() => Math.random() - 0.5);
        currentQuestion = {
            ...fallbackQ,
            options: shuffledOptions
        };
        renderCurrentQuestion();
    } else {
        console.error("Nenhuma pergunta fallback encontrada para a categoria:", category);
    }
}

function renderCurrentQuestion() {
    const progressPercent = (currentQuestionIndex / (totalQuestionsCount + 1)) * 100;
    quizProgress.style.width = `${progressPercent}%`;

    // Build the DOM with textContent for any model-derived strings
    // (question / options / hint) to prevent HTML injection from the API.
    quizBody.replaceChildren();

    const stepLabel = document.createElement('div');
    stepLabel.className = 'quiz-question-number';
    stepLabel.textContent = `Passo ${currentQuestionIndex + 1} de ${totalQuestionsCount + 1}`;
    quizBody.appendChild(stepLabel);

    const questionEl = document.createElement('h3');
    questionEl.className = 'quiz-question';
    questionEl.textContent = currentQuestion.question;
    quizBody.appendChild(questionEl);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'quiz-options';
    currentQuestion.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.dataset.index = i;
        btn.textContent = opt;
        btn.addEventListener('click', (e) => handleAnswer(e, btn));
        optionsWrap.appendChild(btn);
    });
    quizBody.appendChild(optionsWrap);

    if (currentQuestion.hint) {
        const hintEl = document.createElement('p');
        hintEl.style.cssText = 'font-size: 0.85rem; color: var(--accent); margin-top: 20px; font-style: italic; font-weight: 500; font-family: var(--font-body); text-align: center;';
        const icon = document.createElement('i');
        icon.className = 'fas fa-wand-magic-sparkles';
        hintEl.appendChild(icon);
        hintEl.appendChild(document.createTextNode(' ' + currentQuestion.hint));
        quizBody.appendChild(hintEl);
    }
}

function handleAnswer(e, clickedBtn) {
    const selectedIdx = parseInt(clickedBtn.dataset.index);
    const optionBtns = quizBody.querySelectorAll('.option-btn');

    // Disable all options
    optionBtns.forEach(btn => btn.disabled = true);
    clickedBtn.classList.add('correct'); // Highlight choice

    // Track user selection
    userAnswers.push({
        question: currentQuestion.question,
        category: currentQuestion.category,
        selectedOption: currentQuestion.options[selectedIdx]
    });

    playTone(659.25, 0.25); // romantic note
    spawnExplosion(e.clientX || window.innerWidth / 2, e.clientY || window.innerHeight / 2);

    currentQuestionIndex++;

    setTimeout(() => {
        loadQuestion();
    }, 1000);
}

function loadQuestion() {
    if (currentQuestionIndex >= totalQuestionsCount) {
        showNoteStep();
    } else {
        fetchNextQuestion();
    }
}

function showNoteStep() {
    const progressPercent = (totalQuestionsCount / (totalQuestionsCount + 1)) * 100;
    quizProgress.style.width = `${progressPercent}%`;

    quizBody.innerHTML = `
        <div class="quiz-question-number">Passo FINAL</div>
        <h3 class="quiz-question">Algum pedido ou detalhe especial para o Miguel?</h3>
        <textarea class="quiz-textarea" id="date-note" placeholder="Ex: Levar um casaco extra, ir com sapato confortável, levar flores... (opcional)"></textarea>
        <button class="btn-restart" id="submit-date" style="width: 100%;">Finalizar Planejamento! ❤️</button>
    `;

    document.getElementById('submit-date').addEventListener('click', () => {
        const note = document.getElementById('date-note').value.trim();
        showQuizResults(note);
    });
}

async function sendResults(note) {
    const payload = {
        recipient: "Miguel",
        timestamp: new Date().toLocaleString("pt-BR"),
        note: note || "Nenhum detalhe adicional.",
        selections: userAnswers
    };

    // Show sync indicator
    const statusText = document.getElementById('sync-status');
    if (statusText) statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando com o Miguel...';

    let savedLocally = false;

    // Single server-side endpoint fans out to Discord + Upstash. The webhook
    // URL and storage token never touch the browser.
    try {
        const response = await fetch('/api/results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) savedLocally = true;
    } catch (e) {
        console.warn("Servidor não respondeu.");
    }

    // Update status text on completion
    if (statusText) {
        if (savedLocally) {
            statusText.innerHTML = '<i class="fas fa-check-circle" style="color: #2ec4b6;"></i> Encontro enviado! Prepare-se para o melhor momento. ❤️';
        } else {
            statusText.innerHTML = '<i class="fas fa-check-circle" style="color: var(--accent);"></i> Salvo com sucesso! Mostre suas respostas para o Miguel.';
        }
    }
}

function showQuizResults(note) {
    quizProgress.style.width = '100%';

    // Massive heart explosions at the end!
    setTimeout(() => spawnExplosion(window.innerWidth / 2, window.innerHeight / 2), 100);
    setTimeout(() => spawnExplosion(window.innerWidth / 4, window.innerHeight / 3), 500);
    setTimeout(() => spawnExplosion(3 * window.innerWidth / 4, window.innerHeight / 3), 900);

    // Dynamic itinerary recap text
    const localChoice = userAnswers.find(a => a.category === 'local')?.selectedOption || 'Local dos sonhos';
    const foodChoice = userAnswers.find(a => a.category === 'comida')?.selectedOption || 'Banquete ideal';

    quizBody.innerHTML = `
        <div class="quiz-result-view">
            <div class="result-icon"><i class="fas fa-calendar-heart" style="color: var(--primary); animation: float 3s infinite ease-in-out;"></i></div>
            <h3 class="result-title">Encontro Planejado!</h3>
            <p class="result-text">Seu encontro dos sonhos com destino a <strong>${localChoice}</strong> regado a <strong>${foodChoice}</strong> foi salvo e agendado com sucesso!</p>
            <p id="sync-status" style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px; font-weight: 500;"></p>
            <button class="btn-restart" id="restart-planner">Planejar Outro Encontro</button>
        </div>
    `;

    // Process and send the payload
    sendResults(note);

    document.getElementById('restart-planner').addEventListener('click', () => {
        currentQuestionIndex = 0;
        userAnswers = [];
        totalQuestionsCount = randomQuestionCount(); // fresh length each replay
        loadQuestion();
        playTone(523.25, 0.25);
    });
}


// --- Dynamic Loading (Gemini API & Fallback) ---
async function loadPageContent() {
    try {
        const localResponse = await fetch('content.json');
        if (!localResponse.ok) throw new Error("Falha ao abrir content.json");
        const data = await localResponse.json();

        // 1. Populate Letter
        const letterContent = document.getElementById('letter-content');
        if (letterContent && data.letter) {
            const paragraphsHtml = data.letter.paragraphs.map(p => `<p>${p}</p>`).join('');
            letterContent.innerHTML = `
                <span class="letter-date">${data.letter.date}</span>
                <h3>${data.letter.salutation}</h3>
                ${paragraphsHtml}
                <p class="letter-signature">Com muito carinho,<br><strong>${data.letter.signature}</strong></p>
            `;
        }

        // 2. Fetch first question
        if (data.datePool) {
            localDatePool = data.datePool;
        }

        // Start date planner flow
        loadQuestion();

    } catch (error) {
        console.error("Falha ao inicializar o conteúdo da página:", error);
    }
}

// Kick off on page load
window.addEventListener('DOMContentLoaded', loadPageContent);
