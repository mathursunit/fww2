const APP_VERSION = '2.0.7';

if (typeof document !== 'undefined') {
    const badge = document.getElementById('version-badge');
    if (badge) {
        badge.innerText = 'v' + APP_VERSION;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APP_VERSION };
}
