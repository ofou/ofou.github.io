// Detect if we're on a projects page and add class to body
(function () {
  // Check if current URL contains /projects/
  if (window.location.pathname.includes('/projects/')) {
    document.body.classList.add('projects-page');
  }

  // Also check on navigation changes (for SPA-like behavior)
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function () {
      if (window.location.pathname.includes('/projects/')) {
        document.body.classList.add('projects-page');
      } else {
        document.body.classList.remove('projects-page');
      }
    });
  }
})();
