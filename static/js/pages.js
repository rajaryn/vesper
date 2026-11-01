// Shared behaviour for the standalone pages (About, Privacy):
// the theme toggle and the fade-in/fade-out page curtain, matching the app.

const themeBtn = document.getElementById("page-theme-toggle");
const sunIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg> Light mode`;
const moonIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> Dark mode`;

function updateThemeButton() {
  const isDark = document.documentElement.classList.contains("dark-mode");
  if (themeBtn) themeBtn.innerHTML = isDark ? sunIcon : moonIcon;
  // Same browser-bar colours as the app
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#1c1f22" : "#fafaf8");
}

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    updateThemeButton();
  });
}
updateThemeButton();

// Fade in when the page loads
window.addEventListener("load", () => {
  document.getElementById("page-curtain")?.classList.add("reveal");
});

// Fade out before going back to the map
document.querySelectorAll(".smooth-nav").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const targetUrl = e.currentTarget.href;
    document.getElementById("page-curtain")?.classList.remove("reveal");
    setTimeout(() => {
      window.location.href = targetUrl;
    }, 400);
  });
});
