/**
 * env-banner.js
 *
 * Top-of-page banner that screams "you are NOT on production" when the
 * page is loaded from a Vercel preview / staging URL. Hidden silently
 * when the hostname is the real production domain so customers never
 * see it.
 *
 * Detection is purely client-side by hostname so it works for static
 * pages without needing a build step or env injection. The hostname
 * matchers below cover every Vercel preview shape:
 *
 *   - frenzycreator.com                                → PRODUCTION (no banner)
 *   - www.frenzycreator.com                            → PRODUCTION (no banner)
 *   - <project>-git-staging-<team>.vercel.app          → STAGING
 *   - <project>-<hash>-<team>.vercel.app               → PREVIEW
 *   - staging.frenzycreator.com                        → STAGING
 *   - localhost / 127.0.0.1                            → LOCAL
 *
 * If the deployment exposes /api/_meta/environment we'll fetch it on
 * load and decorate the banner with the actual VERCEL_ENV +
 * VERCEL_GIT_COMMIT_REF + commit SHA so devs know exactly which build
 * they're hitting (no more "wait, did my push deploy yet?" guessing).
 */
(function() {
    if (typeof window === 'undefined') return;

    var host = String(window.location.hostname || '').toLowerCase();

    // Production allowlist — anything else is treated as non-prod.
    // If you add prod aliases (e.g. www.frenzycreator.com), append them here.
    var PROD_HOSTS = ['frenzycreator.com', 'www.frenzycreator.com'];
    if (PROD_HOSTS.indexOf(host) !== -1) return;

    var label, color;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
        label = 'LOCAL DEV';
        color = '#3b82f6';
    } else if (host.indexOf('git-staging') !== -1 || host.indexOf('-staging') !== -1 || host.indexOf('staging.') === 0) {
        label = 'STAGING';
        color = '#f59e0b';
    } else if (host.indexOf('.vercel.app') !== -1) {
        label = 'PREVIEW';
        color = '#a855f7';
    } else {
        // Unknown non-prod host. Still warn — better safe than sorry.
        label = 'NON-PROD';
        color = '#ef4444';
    }

    function buildBanner(extra) {
        var banner = document.createElement('div');
        banner.id = 'cf-env-banner';
        banner.setAttribute('data-env', label.toLowerCase());
        banner.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'right:0',
            'z-index:2147483647',
            'background:' + color,
            'color:#0a0a0a',
            'font:600 12px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
            'padding:6px 14px',
            'text-align:center',
            'letter-spacing:0.04em',
            'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
            'cursor:pointer',
            'user-select:none'
        ].join(';');
        banner.innerHTML =
            '<span style="background:rgba(0,0,0,0.18);padding:2px 8px;border-radius:99px;margin-right:8px;font-weight:700;">' + label + '</span>' +
            '<span style="opacity:0.9;">' + (extra || 'Test environment &mdash; not real users, not real money. Click to dismiss.') + '</span>';
        banner.addEventListener('click', function() {
            banner.style.display = 'none';
            try { document.body.style.paddingTop = ''; } catch(e) {}
        });
        return banner;
    }

    function attach(banner) {
        var insert = function() {
            if (!document.body) return setTimeout(insert, 30);
            // Don't insert twice if the script accidentally loads twice.
            if (document.getElementById('cf-env-banner')) return;
            document.body.insertBefore(banner, document.body.firstChild);
            // Push the rest of the page down so the banner doesn't cover
            // fixed-position headers / nav bars.
            try { document.body.style.paddingTop = (banner.offsetHeight || 28) + 'px'; } catch(e) {}
        };
        insert();
    }

    var initial = buildBanner();
    attach(initial);

    // Decorate with deployment metadata if the API is reachable. Best-effort —
    // a 404 just leaves the basic banner in place.
    try {
        fetch('/api/_meta/environment', { credentials: 'omit', cache: 'no-store' })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(j) {
                if (!j || !j.ok) return;
                var refShort = j.gitRef ? j.gitRef.replace(/^refs\/heads\//, '') : '';
                var shaShort = j.gitSha ? j.gitSha.substring(0, 7) : '';
                var env = j.env || '';
                var pieces = [];
                if (env) pieces.push('env=' + env);
                if (refShort) pieces.push('branch=' + refShort);
                if (shaShort) pieces.push('sha=' + shaShort);
                if (pieces.length === 0) return;
                var b = document.getElementById('cf-env-banner');
                if (!b) return;
                var detail = document.createElement('span');
                detail.style.cssText = 'opacity:0.75;margin-left:10px;font-family:ui-monospace,Menlo,monospace;font-size:11px;';
                detail.textContent = pieces.join(' · ');
                b.appendChild(detail);
            })
            .catch(function() { /* ignore */ });
    } catch (e) { /* ignore */ }
})();
