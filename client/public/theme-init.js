/* Runs before the page paints so the saved or phone theme shows without a flash.
   Kept as a separate file because the Content-Security-Policy blocks inline scripts. */
(function () {
  try {
    var saved = localStorage.getItem('ff-theme');
    var dark =
      saved === 'dark' ||
      (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var theme = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#121633' : '#EEF3FF');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
