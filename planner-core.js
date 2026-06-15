/**
 * planner-core.js — pure logic for the themed offline fallback planner.
 *
 * No DOM, no globals, no side effects: every function takes its inputs as
 * arguments and returns plain data. This is the SAME code the browser (app.js)
 * and the node test suite run, so the tests exercise the real behaviour.
 *
 * Works as a browser global (window.PlannerCore) and as a CommonJS module
 * (require('./planner-core')).
 */
(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.PlannerCore = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {

    function shuffle(arr) {
        return [...arr].sort(() => Math.random() - 0.5);
    }

    // Map a local choice (even one phrased freely by Gemini) to a fallback
    // theme, so if Gemini drops out mid-quiz the offline questions stay
    // coherent with the chosen vibe. Falls back to a random valid theme.
    function inferTheme(planner, text) {
        const t = (text || '').toLowerCase();
        if (/praia|mar |areia|coco|ilha|litor|snorkel/.test(t)) return 'praia';
        if (/serra|montanha|frio|lareira|pousada|cabana|mato|neblina|cachoeira/.test(t)) return 'serra';
        if (/chique|sofistic|restaurante|requintad|elegante|balada|rooftop|badalad/.test(t)) return 'chique';
        if (/sof[áa]|casa|cobert|cantinho|pijama|pregui/.test(t)) return 'casa';
        const themes = planner && planner.themes ? Object.keys(planner.themes) : ['casa'];
        return themes[Math.floor(Math.random() * themes.length)];
    }

    // Build a coherent fallback question for the given category. For 'local' the
    // returned object also carries a parallel `_themes` array (theme per option).
    // For other categories, options are drawn only from the locked/inferred theme.
    function buildFallbackQuestion(planner, category, theme, firstAnswerText) {
        if (!planner) return null;
        const question = planner.questions[category];

        if (category === 'local') {
            const picked = shuffle(planner.localOptions).slice(0, 4);
            return {
                question,
                category,
                options: picked.map(o => o.label),
                _themes: picked.map(o => o.theme),
            };
        }

        const resolvedTheme = theme || inferTheme(planner, firstAnswerText);
        const themeData = planner.themes[resolvedTheme];
        const pool = (themeData && themeData[category]) || [];
        if (!pool.length) return null;
        return { question, category, options: shuffle(pool).slice(0, 4) };
    }

    return { shuffle, inferTheme, buildFallbackQuestion };
});
