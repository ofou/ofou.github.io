document.addEventListener('DOMContentLoaded', function() {
  const path = window.location.pathname;
  let activeNav = '';

  if (path === '/' || path === '/index.html') {
    activeNav = 'home';
  } else if (path.startsWith('/blog/')) {
    activeNav = 'blog';
  } else if (path.startsWith('/projects/')) {
    activeNav = 'projects';
  } else if (path.startsWith('/contact/')) {
    activeNav = 'contact';
  }

  if (activeNav) {
    // Add class to body (optional, keep if needed for other styling)
    document.body.classList.add(activeNav);

    // Add active class to the corresponding nav link
    const navLink = document.querySelector(`.menubar a[data-nav="${activeNav}"]`);
    if (navLink) {
      navLink.classList.add('active');
    }
  }
}); 