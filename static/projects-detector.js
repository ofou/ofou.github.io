// Detect if we're on a projects page or blog index and add class to body
(function() {
  // Check if current URL contains /projects/ or /blog/
  if (window.location.pathname.includes('/projects/') || window.location.pathname === '/blog/' || window.location.pathname.startsWith('/blog/')) {
    document.body.classList.add('projects-page');
  }

  // Also check on navigation changes (for SPA-like behavior)
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function() {
      if (window.location.pathname.includes('/projects/') || window.location.pathname === '/blog/' || window.location.pathname.startsWith('/blog/')) {
        document.body.classList.add('projects-page');
      } else {
        document.body.classList.remove('projects-page');
      }
    });
  }
})();
