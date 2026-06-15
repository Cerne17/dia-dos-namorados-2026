/**
 * Exhaustive test for the themed offline fallback planner.
 *
 * Runs the SAME code the browser uses (planner-core.js) against the real
 * content.json, simulating complete date-planning sessions. The hard
 * requirement: no date may fail before reaching finalization (the note step).
 *
 * Run: node test/fallback.test.js
 * Exit code 0 = all good, 1 = at least one failure.
 */
const fs = require('fs');
const path = require('path');
const PlannerCore = require('../planner-core');

const ROOT = path.join(__dirname, '..');
const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'content.json'), 'utf8'));
const planner = content.fallbackPlanner;

// Mirror app.js constants.
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 6;
const OPTIONS_PER_STEP = 4;

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
let checks = 0;
const ok = () => { checks++; };

function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }

// ---------------------------------------------------------------------------
// 1. DATA INTEGRITY
// ---------------------------------------------------------------------------
function testIntegrity() {
    const order = planner.categoryOrder;
    if (!Array.isArray(order) || order.length === 0) return fail('integridade', 'categoryOrder vazio');
    ok();
    if (order[0] !== 'local') fail('integridade', `categoryOrder deve começar com 'local', veio '${order[0]}'`); else ok();
    if (order.length < MAX_QUESTIONS) fail('integridade', `categoryOrder (${order.length}) < MAX_QUESTIONS (${MAX_QUESTIONS}) — encontros longos ficariam sem categoria`); else ok();

    // Every category in the order has a question text.
    for (const cat of order) {
        if (!planner.questions[cat] || !planner.questions[cat].trim()) fail('integridade', `sem texto de pergunta para categoria '${cat}'`); else ok();
    }

    // localOptions present, each tagged with a real theme.
    if (!Array.isArray(planner.localOptions) || planner.localOptions.length < OPTIONS_PER_STEP) {
        fail('integridade', `localOptions precisa de >= ${OPTIONS_PER_STEP} itens`);
    } else ok();
    const themeKeys = Object.keys(planner.themes);
    for (const o of planner.localOptions) {
        if (!o.label || !o.label.trim()) fail('integridade', 'localOption com label vazio');
        else if (!themeKeys.includes(o.theme)) fail('integridade', `localOption '${o.label}' tem theme inválido '${o.theme}'`);
        else ok();
    }
    // Every theme must cover every non-local category with a pool >= OPTIONS_PER_STEP,
    // with non-empty, unique options (so slice(0,4) always yields 4 distinct).
    const nonLocal = order.filter(c => c !== 'local');
    for (const th of themeKeys) {
        for (const cat of nonLocal) {
            const pool = planner.themes[th][cat];
            if (!Array.isArray(pool)) { fail('integridade', `tema '${th}' sem categoria '${cat}'`); continue; }
            if (pool.length < OPTIONS_PER_STEP) fail('integridade', `tema '${th}'/'${cat}' tem só ${pool.length} opções (< ${OPTIONS_PER_STEP})`);
            else ok();
            if (new Set(pool).size !== pool.length) fail('integridade', `tema '${th}'/'${cat}' tem opções duplicadas`); else ok();
            if (pool.some(x => !x || !String(x).trim())) fail('integridade', `tema '${th}'/'${cat}' tem opção vazia`); else ok();
        }
    }

    // Every theme must be reachable from at least one localOption.
    for (const th of themeKeys) {
        if (!planner.localOptions.some(o => o.theme === th)) fail('integridade', `tema '${th}' inalcançável (nenhum localOption aponta pra ele)`); else ok();
    }
}

// ---------------------------------------------------------------------------
// Validate a single produced question (one step of a date).
// ---------------------------------------------------------------------------
function validateStep(where, q, expectedCat, lockedTheme) {
    if (q === null || q === undefined) { fail(where, `passo '${expectedCat}' retornou null (encontro quebraria aqui)`); return false; }
    if (q.category !== expectedCat) { fail(where, `categoria errada: esperado '${expectedCat}', veio '${q.category}'`); return false; }
    if (!q.question || !q.question.trim()) { fail(where, `passo '${expectedCat}' sem texto de pergunta`); return false; }
    if (!Array.isArray(q.options) || q.options.length !== OPTIONS_PER_STEP) { fail(where, `passo '${expectedCat}' tem ${q.options ? q.options.length : 'N/A'} opções (esperado ${OPTIONS_PER_STEP})`); return false; }
    if (q.options.some(o => !o || !String(o).trim())) { fail(where, `passo '${expectedCat}' tem opção vazia`); return false; }
    if (new Set(q.options).size !== q.options.length) { fail(where, `passo '${expectedCat}' tem opção repetida na tela`); return false; }

    if (expectedCat === 'local') {
        if (!Array.isArray(q._themes) || q._themes.length !== q.options.length) { fail(where, `local sem _themes paralelo às opções`); return false; }
        if (q._themes.some(t => !planner.themes[t])) { fail(where, `local com theme inválido em _themes`); return false; }
    } else {
        // Coherence: every shown option must belong to the locked theme's pool.
        const poolSet = new Set(planner.themes[lockedTheme][expectedCat]);
        const stray = q.options.filter(o => !poolSet.has(o));
        if (stray.length) { fail(where, `INCOERENTE: tema '${lockedTheme}'/'${expectedCat}' mostrou opções de fora: ${JSON.stringify(stray)}`); return false; }
    }
    ok();
    return true;
}

// ---------------------------------------------------------------------------
// Simulate one full date. mode: 'menu' (local choice from our list) or
// 'gemini' (local answered by a free-text string -> theme inferred).
// Returns true if the date completed all N steps to finalization.
// ---------------------------------------------------------------------------
function simulateDate(where, N, mode, geminiLocalText, forcedLocalOption) {
    const order = planner.categoryOrder;
    let theme = null;
    const answers = [];

    for (let idx = 0; idx < N; idx++) {
        const cat = order[idx];
        const q = PlannerCore.buildFallbackQuestion(planner, cat, theme, answers[0] && answers[0].selectedOption);
        if (!validateStep(where, q, cat, theme)) return false;

        if (cat === 'local') {
            let chosenIdx, selectedLabel;
            if (mode === 'gemini') {
                // Gemini phrased the local question itself; theme must be inferred
                // ONCE from the chosen text (mirrors app.js handleAnswer).
                selectedLabel = geminiLocalText;
                theme = PlannerCore.inferTheme(planner, selectedLabel);
            } else {
                chosenIdx = forcedLocalOption != null ? forcedLocalOption : rand(q.options.length);
                selectedLabel = q.options[chosenIdx];
                theme = q._themes[chosenIdx] || PlannerCore.inferTheme(planner, selectedLabel);
            }
            if (!planner.themes[theme]) { fail(where, `tema travado inválido: '${theme}'`); return false; }
            answers.push({ category: cat, selectedOption: selectedLabel });
        } else {
            answers.push({ category: cat, selectedOption: pick(q.options) });
        }
    }

    // Reached finalization (note step) iff we produced all N steps.
    if (answers.length !== N) { fail(where, `encontro terminou com ${answers.length}/${N} passos`); return false; }
    ok();
    return true;
}

// ---------------------------------------------------------------------------
// 2. EXHAUSTIVE DETERMINISTIC COVERAGE: every localOption x every N.
// ---------------------------------------------------------------------------
function testDeterministic() {
    const results = {}; // theme -> {ok, fail}
    for (let li = 0; li < planner.localOptions.length; li++) {
        const lo = planner.localOptions[li];
        results[lo.theme] = results[lo.theme] || { ok: 0, fail: 0 };
        for (let N = MIN_QUESTIONS; N <= MAX_QUESTIONS; N++) {
            const where = `det[local='${lo.label.slice(0, 25)}...' N=${N}]`;
            // Force this exact local option so we cover every theme entry point.
            const before = failures.length;
            const passed = simulateDate(where, N, 'menu', null, li);
            if (passed && failures.length === before) results[lo.theme].ok++; else results[lo.theme].fail++;
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// 3. RANDOM FUZZ: many random sessions, both menu and gemini-first modes.
// ---------------------------------------------------------------------------
function testFuzz(runs) {
    const geminiSamples = [
        'Na praia tomando água de coco ao pôr do sol',
        'Num chalé na serra com a lareira acesa',
        'Jantar elegante num restaurante badalado',
        'No sofá de casa enrolados na coberta',
        'Numa ilha deserta só nós dois',
        'Subindo uma montanha gelada de mãos dadas',
        'Algo completamente surpreendente e fora da caixa', // unknown -> random theme
        'Rooftop sofisticado com vista da cidade',
        'Maratona de série de pijama',
        'piquenique no litoral com peixe fresco',
    ];
    let pass = 0, total = 0;
    const byMode = { menu: { ok: 0, fail: 0 }, gemini: { ok: 0, fail: 0 } };
    for (let i = 0; i < runs; i++) {
        const N = MIN_QUESTIONS + rand(MAX_QUESTIONS - MIN_QUESTIONS + 1);
        const mode = Math.random() < 0.5 ? 'menu' : 'gemini';
        const gtext = pick(geminiSamples);
        const before = failures.length;
        const passed = simulateDate(`fuzz#${i}(${mode})`, N, mode, gtext, null);
        total++;
        if (passed && failures.length === before) { pass++; byMode[mode].ok++; }
        else { byMode[mode].fail++; }
    }
    return { pass, total, byMode };
}

// ---------------------------------------------------------------------------
// 3b. MID-QUIZ FAILURE: Gemini answers the first steps, then drops out at a
// random point; the rest must come from the offline fallback and stay coherent
// with the theme locked at the (Gemini-phrased) local step.
// ---------------------------------------------------------------------------
function testMidQuizFailure(runs) {
    const order = planner.categoryOrder;
    const geminiSamples = [
        'Na praia tomando água de coco', 'Num chalé na serra com lareira',
        'Jantar chique num restaurante badalado', 'No sofá de casa na coberta',
        'Algo surpreendente e fora da caixa',
    ];
    let pass = 0, total = 0;
    for (let i = 0; i < runs; i++) {
        const N = MIN_QUESTIONS + rand(MAX_QUESTIONS - MIN_QUESTIONS + 1);
        const switchAt = 1 + rand(N - 1); // Gemini handles steps [0..switchAt-1], fallback the rest
        const where = `mid#${i}(N=${N},cai@${switchAt})`;
        const before = failures.length;

        // Step 0 (local) answered by Gemini -> theme inferred once.
        let theme = PlannerCore.inferTheme(planner, pick(geminiSamples));
        if (!planner.themes[theme]) { fail(where, `tema inferido inválido '${theme}'`); total++; continue; }

        let okRun = true;
        for (let idx = 1; idx < N; idx++) {
            const cat = order[idx];
            if (idx < switchAt) continue; // Gemini still up: its output isn't our concern here
            const q = PlannerCore.buildFallbackQuestion(planner, cat, theme, null);
            if (!validateStep(where, q, cat, theme)) { okRun = false; break; }
        }
        total++;
        if (okRun && failures.length === before) pass++;
    }
    return { pass, total };
}

// ---------------------------------------------------------------------------
// RUN + REPORT
// ---------------------------------------------------------------------------
const FUZZ_RUNS = 50000;
console.log('========================================================');
console.log(' TESTE EXAUSTIVO — FALLBACK DE ENCONTROS (offline)');
console.log('========================================================\n');

testIntegrity();
const intFails = failures.length;
console.log(`1) INTEGRIDADE DOS DADOS .......... ${intFails === 0 ? 'OK' : intFails + ' FALHA(S)'}`);
console.log(`   temas: ${Object.keys(planner.themes).join(', ')}`);
console.log(`   categorias: ${planner.categoryOrder.join(' > ')}`);
console.log(`   localOptions: ${planner.localOptions.length}\n`);

const det = testDeterministic();
const detFails = failures.length - intFails;
console.log(`2) COBERTURA DETERMINÍSTICA (todo localOption x N=${MIN_QUESTIONS}..${MAX_QUESTIONS}) ... ${detFails === 0 ? 'OK' : detFails + ' FALHA(S)'}`);
for (const th of Object.keys(det)) {
    console.log(`   tema ${th.padEnd(7)} -> ${det[th].ok} encontros ok, ${det[th].fail} falha(s)`);
}
console.log();

const fz = testFuzz(FUZZ_RUNS);
const fuzzFails = failures.length - intFails - detFails;
console.log(`3) FUZZ ALEATÓRIO (${FUZZ_RUNS} encontros, menu + gemini) ... ${fuzzFails === 0 ? 'OK' : fuzzFails + ' FALHA(S)'}`);
console.log(`   completos: ${fz.pass}/${fz.total}`);
console.log(`   modo menu  : ${fz.byMode.menu.ok} ok / ${fz.byMode.menu.fail} falha`);
console.log(`   modo gemini: ${fz.byMode.gemini.ok} ok / ${fz.byMode.gemini.fail} falha\n`);

const mid = testMidQuizFailure(20000);
const midFails = failures.length - intFails - detFails - fuzzFails;
console.log(`4) QUEDA DO GEMINI NO MEIO (20000 encontros, troca em ponto aleatório) ... ${midFails === 0 ? 'OK' : midFails + ' FALHA(S)'}`);
console.log(`   completos e coerentes: ${mid.pass}/${mid.total}\n`);

console.log('--------------------------------------------------------');
console.log(`ASSERTIONS executadas: ${checks}`);
console.log(`FALHAS totais: ${failures.length}`);
if (failures.length) {
    console.log('\nDETALHE DAS FALHAS (até 20):');
    failures.slice(0, 20).forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log('--------------------------------------------------------');
console.log(failures.length === 0
    ? '\n✅ SUCESSO TOTAL: nenhum encontro falhou antes da finalização.'
    : `\n❌ ${failures.length} FALHA(S) detectada(s) — ver acima.`);

process.exit(failures.length === 0 ? 0 : 1);
