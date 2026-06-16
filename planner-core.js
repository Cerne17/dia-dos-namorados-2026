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

    // --- Calendar (.ics) ------------------------------------------------
    function pad2(n) { return String(n).padStart(2, '0'); }

    // Format a Date to an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ.
    function toICSDateUTC(d) {
        return d.getUTCFullYear()
            + pad2(d.getUTCMonth() + 1)
            + pad2(d.getUTCDate())
            + 'T' + pad2(d.getUTCHours())
            + pad2(d.getUTCMinutes())
            + pad2(d.getUTCSeconds()) + 'Z';
    }

    function escapeICS(text) {
        return String(text)
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\r?\n/g, '\\n');
    }

    // Build an .ics string for a planned date. `plan` = { eventDate (parseable
    // local datetime string), selections:[{category,selectedOption}], note }.
    // Returns null if there's no usable date. durationHours defaults to 3.
    function buildICS(plan, durationHours) {
        if (!plan || !plan.eventDate) return null;
        const start = new Date(plan.eventDate);
        if (isNaN(start.getTime())) return null;
        const end = new Date(start.getTime() + (durationHours || 3) * 3600 * 1000);

        const selections = plan.selections || [];
        const localPick = selections.find(s => s.category === 'local');
        const summary = 'Encontro com o Miguel ❤️' + (localPick ? ' — ' + localPick.selectedOption : '');
        const lines = selections.map(s => `${s.category}: ${s.selectedOption}`);
        if (plan.note) lines.push('Nota: ' + plan.note);
        const description = lines.join('\n');

        const uid = 'cupido-' + start.getTime() + '@dudinea-valentine';
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Cupido Valentin//PT-BR//EN',
            'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT',
            'UID:' + uid,
            'DTSTAMP:' + toICSDateUTC(new Date()),
            'DTSTART:' + toICSDateUTC(start),
            'DTEND:' + toICSDateUTC(end),
            'SUMMARY:' + escapeICS(summary),
            'DESCRIPTION:' + escapeICS(description),
            localPick ? 'LOCATION:' + escapeICS(localPick.selectedOption) : null,
            'END:VEVENT',
            'END:VCALENDAR',
        ].filter(Boolean);
        return ics.join('\r\n');
    }

    // --- Countdown ------------------------------------------------------
    // Returns { past, days, hours, minutes, seconds } or null if no/invalid date.
    function countdown(targetDateStr, nowMs) {
        if (!targetDateStr) return null;
        const target = new Date(targetDateStr).getTime();
        if (isNaN(target)) return null;
        const now = nowMs != null ? nowMs : Date.now();
        let diff = Math.floor((target - now) / 1000);
        if (diff <= 0) return { past: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
        const days = Math.floor(diff / 86400); diff -= days * 86400;
        const hours = Math.floor(diff / 3600); diff -= hours * 3600;
        const minutes = Math.floor(diff / 60);
        const seconds = diff - minutes * 60;
        return { past: false, days, hours, minutes, seconds };
    }

    return { shuffle, inferTheme, buildFallbackQuestion, buildICS, countdown, escapeICS, toICSDateUTC };
});
