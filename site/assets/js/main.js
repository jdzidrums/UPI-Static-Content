(function () {
  "use strict";

  document.documentElement.classList.add("js");

  const menuButton = document.querySelector("[data-menu-button]");
  const primaryNav = document.querySelector("[data-primary-nav]");

  if (menuButton && primaryNav) {
    const closeMenu = () => {
      menuButton.setAttribute("aria-expanded", "false");
      primaryNav.classList.remove("is-open");
      document.body.classList.remove("nav-open");
    };

    menuButton.addEventListener("click", () => {
      const willOpen = menuButton.getAttribute("aria-expanded") !== "true";
      menuButton.setAttribute("aria-expanded", String(willOpen));
      primaryNav.classList.toggle("is-open", willOpen);
      document.body.classList.toggle("nav-open", willOpen);
    });

    primaryNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1050) closeMenu();
    });
  }

  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  const revealItems = Array.from(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px" }
    );
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const trustContainers = document.querySelectorAll("#trust-documents, [data-trust-documents]");
  if (trustContainers.length) {
    loadTrustDocuments(trustContainers);
  }

  async function loadTrustDocuments(containers) {
    try {
      const response = await fetch("data/trust-documents.json", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Document availability could not be loaded.");
      const manifest = await response.json();
      const items = Array.isArray(manifest.documents) ? manifest.documents : [];
      containers.forEach((container) => renderTrustDocuments(container, items));
    } catch (_error) {
      containers.forEach((container) => {
        container.innerHTML = "<p>Current document availability could not be loaded. Email <a href=\"mailto:__EDI_SUPPORT_EMAIL__\">__EDI_SUPPORT_EMAIL__</a> for assistance.</p>";
      });
    }
  }

  function renderTrustDocuments(container, documents) {
    container.textContent = "";

    documents.forEach((documentItem) => {
      const article = document.createElement("article");
      article.className = "document-item";

      const copy = document.createElement("div");
      const heading = document.createElement("h4");
      heading.textContent = documentItem.title;
      const description = document.createElement("p");
      description.textContent = documentItem.description;
      copy.append(heading, description);

      const action = document.createElement("a");
      action.className = "document-item__badge";

      if (documentItem.status === "published" && documentItem.href) {
        action.classList.add("document-item__badge--published");
        action.textContent = "Download";
        action.href = documentItem.href;
        action.setAttribute("download", "");
      } else {
        action.textContent = documentItem.statusLabel || "Request access";
        action.href = "mailto:__EDI_SUPPORT_EMAIL__?subject=" + encodeURIComponent("Security document request: " + documentItem.title);
      }

      article.append(copy, action);
      container.append(article);
    });
  }
})();
