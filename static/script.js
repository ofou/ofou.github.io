document.addEventListener('DOMContentLoaded', function() {
  const path = window.location.pathname;
  if (path === '/' || path === '/index.html') {
    document.body.classList.add('home');
  } else if (path.startsWith('/blog/')) {
    document.body.classList.add('blog');
  } else if (path.startsWith('/projects/')) {
    document.body.classList.add('projects');
  } else if (path.startsWith('/contact/')) {
    document.body.classList.add('contact');
  }
}); 