//the entry point

import { initApp, fetchAllPins, map } from "./map.js";
import { initThemeLogic } from "./ui.js";
import { openMomentView } from "./moment-view.js";

// Importing these triggers their top-level event listeners automatically
import "./upload.js";
import "./gallery.js";

// Opened from a shared /m/<pin> link: show that spot and open the moment over it
function openSharedMoment() {
  const data = document.getElementById("shared-moment");
  if (!data) return;
  const { pinId, lat, lon, imageId, placeName } = JSON.parse(data.textContent);
  // The app lives at "/"; the moment view pushes its own /m/ URL on top, so
  // Back closes the moment instead of leaving the site
  history.replaceState({}, "", "/");
  map.setView([lat, lon], 16);
  openMomentView(pinId, lat, lon, imageId, placeName);
}

window.onload = () => {
  initApp();
  initThemeLogic();
  openSharedMoment();
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") fetchAllPins();
});
