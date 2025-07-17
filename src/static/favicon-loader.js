(function () {
  "use strict";

  // Configuration
  const config = {
    excludeDomains: ["olivares.cl", "localhost"],

    excludeClasses: ["no-favicon", "book-grid", "md-author", "md-source"],

    excludeExtensions: [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".svg",
      ".pdf",
      ".mp4",
      ".webm",
    ],

    faviconServices: [
      "https://www.google.com/s2/favicons?domain_url=",
      "https://icons.duckduckgo.com/ip3/",
      "https://favicon.yandex.net/favicon/",
    ],

    cacheDuration: 24 * 60 * 60 * 1000,
  };

  const faviconCache = new Map();

  function extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return null;
    }
  }

  function shouldExclude(link, url) {
    for (const className of config.excludeClasses) {
      if (link.classList.contains(className)) return true;
    }

    if (
      link.querySelector('svg, img:not(.favicon-icon), .icon, [class*="icon"]')
    )
      return true;

    if (
      link.classList.contains("md-icon") ||
      link.classList.contains("icon") ||
      link.className.includes("icon")
    )
      return true;

    const parent = link.closest(".book-grid, .md-author, img");
    if (parent) return true;

    const domain = extractDomain(url);
    if (!domain || config.excludeDomains.some((d) => domain.includes(d)))
      return true;

    if (config.excludeExtensions.some((ext) => url.toLowerCase().endsWith(ext)))
      return true;

    if (link.querySelector(".favicon-icon")) return true;

    if (!link.textContent.trim()) return true;

    return false;
  }

  function createFaviconElement(domain, serviceIndex = 0) {
    const favicon = document.createElement("img");
    favicon.className = "favicon-icon";
    favicon.style.cssText = `
      width: 16px;
      height: 16px;
      margin-left: 0.35em;
      margin-right: 0.1em;
      vertical-align: middle;
      display: inline-block;
      flex-shrink: 0;
    `;

    const service = config.faviconServices[serviceIndex];
    favicon.src = service + domain;

    favicon.onerror = () => {
      if (serviceIndex + 1 < config.faviconServices.length) {
        const nextFavicon = createFaviconElement(domain, serviceIndex + 1);
        favicon.parentNode?.replaceChild(nextFavicon, favicon);
      } else {
        favicon.src =
          "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMUMxMS4zMTM3IDEgMTQgMy42ODYzIDE0IDdWOUMxNCA5LjU1MjI4IDEzLjU1MjMgMTAgMTMgMTBIMTFWMTFDMTEgMTEuNTUyMyAxMC41NTIzIDEyIDEwIDEySDZDNS40NDc3MiAxMiA1IDExLjU1MjMgNSAxMVYxMEgzQzIuNDQ3NzIgMTAgMiA5LjU1MjI4IDIgOVY3QzIgMy42ODYzIDQuNjg2MyAxIDggMVoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+";
      }
    };

    return favicon;
  }

  function addFaviconToLink(link) {
    const url = link.href;
    const domain = extractDomain(url);

    if (!domain || shouldExclude(link, url)) return;

    const cacheKey = domain;
    const cached = faviconCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < config.cacheDuration) {
      const favicon = createFaviconElement(domain);
      favicon.src = cached.url;
      link.appendChild(favicon);
      return;
    }

    const favicon = createFaviconElement(domain);

    favicon.onload = () => {
      faviconCache.set(cacheKey, {
        url: favicon.src,
        timestamp: Date.now(),
      });
    };

    link.appendChild(favicon);
  }

  function processLinks() {
    const links = document.querySelectorAll('a[href^="http"]');

    links.forEach((link) => {
      addFaviconToLink(link);
    });
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", processLinks);
    } else {
      processLinks();
    }

    if (window.MutationObserver) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === "A" && node.href?.startsWith("http")) {
                addFaviconToLink(node);
              }
              const links = node.querySelectorAll?.('a[href^="http"]');
              links?.forEach(addFaviconToLink);
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  window.FaviconLoader = {
    processLinks,
    addFaviconToLink,
    config,
  };

  init();
})();
