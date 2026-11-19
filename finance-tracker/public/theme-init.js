// Applies the saved theme before first paint. Loaded as a blocking external
// script so the CSP can drop script-src 'unsafe-inline'.
// Cached 1y by nginx: bump ?v= in index.html when editing this file.
(function () {
  try {
    var theme = localStorage.getItem('theme_preference') || 'dark';
    var resolved = theme === 'system' ? 'dark' : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.add(resolved);
    // Returning user hint: lets the static shell show a dashboard skeleton, not the logo.
    if (localStorage.getItem('finvu_session_id') || localStorage.getItem('auth_remember')) {
      document.documentElement.classList.add('has-session');
    }
  } catch (e) {}
})();
