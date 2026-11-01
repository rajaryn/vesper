//Global navigation, Dark mode, Popstate (Back Button), and Top Search bar.


import { map, setMapTheme, flyToGently } from "./map.js";
import { closeStagingArea } from "./upload.js";

const topUiLayer = document.querySelector(".top-ui-layer");
const brandToggle = document.getElementById("brand-toggle");
const sideMenu = document.getElementById("side-menu");
const globalSearchInput = document.getElementById("global-search-input");
const globalSearchResults = document.getElementById("global-search-results");
const drawerOverlay = document.getElementById("drawer-overlay");
const uploadSheet = document.getElementById("upload-sheet");
const galleryModal = document.getElementById("gallery-modal");
const galleryContent = document.getElementById("gallery-content");
const lightboxModal = document.getElementById("lightbox-modal");
const manualSearch = document.getElementById("manual-search");
const manualSearchResults = document.getElementById("manual-search-results");

let globalSearchTimeout = null;

export function initThemeLogic() {
  const themeToggle = document.getElementById("theme-toggle");
  const body = document.body;
  if (!themeToggle) return;

  function applyTheme(isDark) {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const moonIcon =
      '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    const sunIcon =
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';

    if (isDark) {
      body.classList.add("dark-mode");
      themeToggle.innerHTML = `<span class="menu-icon">${sunIcon}</span> Light mode`;
      if (themeMeta) themeMeta.setAttribute("content", "#1c1f22");
    } else {
      body.classList.remove("dark-mode");
      themeToggle.innerHTML = `<span class="menu-icon">${moonIcon}</span> Dark mode`;
      if (themeMeta) themeMeta.setAttribute("content", "#fafaf8");
    }
    setMapTheme(isDark);
  }

  const savedTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  if (savedTheme === "dark" || (!savedTheme && systemPrefersDark))
    applyTheme(true);
  else applyTheme(false);

  themeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    const isCurrentlyDark = body.classList.contains("dark-mode");
    applyTheme(!isCurrentlyDark);
    localStorage.setItem("theme", !isCurrentlyDark ? "dark" : "light");

    if (sideMenu) sideMenu.classList.remove("show");
    if (brandToggle) brandToggle.classList.remove("open");
    if (drawerOverlay && uploadSheet && !uploadSheet.classList.contains("show"))
      drawerOverlay.classList.remove("show");

    const searchContainer = document.querySelector(".glass-search-container");
    if (searchContainer) {
      searchContainer.style.opacity = "1";
      searchContainer.style.pointerEvents = "auto";
    }
  });

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (!localStorage.getItem("theme")) applyTheme(e.matches);
    });
}

if (brandToggle && sideMenu) {
  const searchContainer = document.querySelector(".glass-search-container");
  brandToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (sideMenu.classList.contains("show")) {
      sideMenu.classList.remove("show");
      brandToggle.classList.remove("open");
      if (drawerOverlay) drawerOverlay.classList.remove("show");
      if (searchContainer) {
        searchContainer.style.opacity = "1";
        searchContainer.style.pointerEvents = "auto";
      }
    } else {
      sideMenu.classList.add("show");
      brandToggle.classList.add("open");
      if (drawerOverlay) drawerOverlay.classList.add("show");
      if (searchContainer) {
        searchContainer.style.opacity = "0";
        searchContainer.style.pointerEvents = "none";
      }
    }
  });

  if (drawerOverlay) {
    drawerOverlay.addEventListener("click", () => {
      if (sideMenu.classList.contains("show")) brandToggle.click();
    });
  }
}

if (globalSearchInput) {
  globalSearchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearTimeout(globalSearchTimeout);
    if (globalSearchResults) globalSearchResults.innerHTML = "";

    if (query.length < 3) {
      if (globalSearchResults) globalSearchResults.classList.remove("show");
      return;
    }

    globalSearchTimeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        );
        const results = await response.json();
        if (globalSearchResults) globalSearchResults.innerHTML = "";

        if (results.length === 0 && globalSearchResults) {
          globalSearchResults.innerHTML = `<div class="search-result-item" style="color: #aaa; text-align:center;">No places found</div>`;
          globalSearchResults.classList.add("show");
          return;
        }

        results.forEach((place) => {
          const item = document.createElement("div");
          item.className = "search-result-item";
          item.innerText = place.display_name.split(",").slice(0, 3).join(",");
          item.addEventListener("click", () => {
            const lat = parseFloat(place.lat);
            const lon = parseFloat(place.lon);
            globalSearchInput.value = "";
            if (globalSearchResults)
              globalSearchResults.classList.remove("show");
            globalSearchInput.blur();
            if (map) flyToGently([lat, lon], 12);
          });
          if (globalSearchResults) globalSearchResults.appendChild(item);
        });
        if (globalSearchResults) globalSearchResults.classList.add("show");
      } catch (error) {
        console.error("Search error:", error);
      }
    }, 500);
  });
}

// Global Hardware Back Button Override
window.addEventListener("popstate", (e) => {
  const state = e.state ? e.state.modal : null;
  if (state !== "lightbox" && lightboxModal)
    lightboxModal.classList.remove("show");
  if (state !== "staging") closeStagingArea();
  if (state !== "gallery" && state !== "lightbox" && galleryModal) {
    galleryModal.classList.remove("show-modal");
    setTimeout(() => {
      if (!galleryModal.classList.contains("show-modal") && galleryContent)
        galleryContent.innerHTML = "";
    }, 400);
  }
  if (state !== "upload" && uploadSheet) uploadSheet.classList.remove("show");
  if (
    state !== "upload" &&
    (!sideMenu || !sideMenu.classList.contains("show")) &&
    drawerOverlay
  )
    drawerOverlay.classList.remove("show");
  if (
    state !== "gallery" &&
    state !== "lightbox" &&
    state !== "staging" &&
    topUiLayer
  ) {
    topUiLayer.style.transform = "translateY(0)";
    topUiLayer.style.opacity = "1";
  }
});

// Click outside helper
document.addEventListener("click", (e) => {
  if (
    globalSearchInput &&
    e.target !== globalSearchInput &&
    globalSearchResults &&
    !globalSearchResults.contains(e.target)
  ) {
    globalSearchResults.classList.remove("show");
  }
  if (
    manualSearch &&
    e.target !== manualSearch &&
    manualSearchResults &&
    !manualSearchResults.contains(e.target)
  ) {
    manualSearchResults.classList.remove("show");
  }
});

// --- PAGE TRANSITION LOGIC ---
// Fade in when the page loads
window.addEventListener('load', () => {
    const curtain = document.getElementById('page-curtain');
    if (curtain) curtain.classList.add('reveal');
});

// Fade out before navigating away
document.querySelectorAll('.smooth-nav').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetUrl = e.currentTarget.href;
        const curtain = document.getElementById('page-curtain');
        
        // Close the side menu cleanly if it's open
        const sideMenu = document.getElementById("side-menu");
        if (sideMenu && sideMenu.classList.contains("show")) {
            document.getElementById("brand-toggle").click();
        }
        
        if (curtain) curtain.classList.remove('reveal');
        
        setTimeout(() => {
            window.location.href = targetUrl;
        }, 400); // Wait for the fade
    });
});