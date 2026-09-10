import { API_BASE, svgSun, svgMoon } from "./constants.js";
import { showToast, isNetworkSlow } from "./utils.js";
import {
  map,
  currentUserLat,
  currentUserLon,
  fetchAllPins,
  fetchSilentGPS,
} from "./map.js";

const mainCaptureBtn = document.getElementById("main-capture-btn");
const uploadSheet = document.getElementById("upload-sheet");
const drawerOverlay = document.getElementById("drawer-overlay");
const btnCamera = document.getElementById("btn-camera");
const btnGallery = document.getElementById("btn-gallery");
const fileInputCamera = document.getElementById("file-input-camera");
const fileInputGallery = document.getElementById("file-input-gallery");

const stagingArea = document.getElementById("staging-area");
const stagingImg = document.getElementById("staging-img");
const stagingBadge = document.getElementById("staging-badge");
const manualSearchWrapper = document.getElementById("manual-search-wrapper");
const manualSearch = document.getElementById("manual-search");
const manualSearchResults = document.getElementById("manual-search-results");
const btnShareMap = document.getElementById("btn-share-map");
const btnLiveLocation = document.getElementById("btn-live-location");
const closeStagingBtn = document.getElementById("close-staging");
const topUiLayer = document.querySelector(".top-ui-layer");
const galleryModal = document.getElementById("gallery-modal");
const lightboxModal = document.getElementById("lightbox-modal");

// Air Datepicker Instance
let airPickerInstance = null;
const pickerInput = document.getElementById("vesper-datetime-picker");

let selectedFile = null;
let finalLat = null;
let finalLon = null;
let finalDate = null;
let selectedType = "sun";
let uploadSource = "";
let stagingSearchTimeout;

if (mainCaptureBtn) {
  mainCaptureBtn.addEventListener("click", () => {
    if (isNetworkSlow()) showToast("Weak signal detected.");
    history.pushState({ modal: "upload" }, "");
    uploadSheet.classList.add("show");
    drawerOverlay.classList.add("show");
    fetchSilentGPS();
  });
}

if (btnCamera)
  btnCamera.addEventListener("click", () => {
    uploadSource = "camera";
    fileInputCamera.click();
  });
if (btnGallery)
  btnGallery.addEventListener("click", () => {
    uploadSource = "gallery";
    fileInputGallery.click();
  });

const uploadHandle = document.getElementById("upload-handle");
if (uploadHandle)
  uploadHandle.addEventListener("click", () => {
    uploadSheet.classList.remove("show");
    drawerOverlay.classList.remove("show");
    history.replaceState({}, "", window.location.pathname);
  });

const handleFileSelection = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  selectedFile = file;
  selectedType =
    document.querySelector('input[name="capture_type"]:checked')?.value ||
    "sun";

  history.replaceState({ modal: "staging" }, "");
  uploadSheet.classList.remove("show");
  drawerOverlay.classList.remove("show");
  stagingArea.classList.add("show");

  if (topUiLayer) {
    topUiLayer.style.transition =
      "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease";
    topUiLayer.style.transform = "translateY(-150%)";
    topUiLayer.style.opacity = "0";
  }

  stagingImg.removeAttribute("src");
  stagingImg.style.opacity = "0";
  stagingImg.style.display = "block";
  stagingImg.style.background = "";

  const previewContainer = stagingImg.parentElement;
  const existingFallback = previewContainer.querySelector(
    ".heic-fallback-wrapper",
  );
  if (existingFallback) existingFallback.remove();

  if (stagingBadge) {
    stagingBadge.innerHTML = selectedType === "moon" ? svgMoon : svgSun;
  }

  const fileExt = file.name.split(".").pop().toLowerCase();
  const isHeic =
    fileExt === "heic" || fileExt === "heif" || file.type.includes("heic");

  processExif(file).catch((err) => console.warn("EXIF silently failed:", err));

  if (isHeic) {
    stagingImg.style.display = "none";

    const fallbackDiv = document.createElement("div");
    fallbackDiv.className = "heic-fallback-wrapper";
    fallbackDiv.innerHTML = `
        <div class="heic-icon-pulse">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
        </div>
        <div class="heic-fallback-text">
            <span class="heic-filename">${file.name}</span>
            <span class="heic-subtext">Ready to place.</span>
        </div>
    `;
    previewContainer.appendChild(fallbackDiv);
  } else {
    stagingImg.src = URL.createObjectURL(file);
    stagingImg.style.opacity = "1";

    stagingImg.onerror = () => {
      const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'><rect width='100%' height='100%' fill='rgba(0,0,0,0.05)'/><text x='50%' y='50%' font-family='sans-serif' font-weight='bold' font-size='14' text-anchor='middle' alignment-baseline='middle' fill='%23666'>Photo Selected</text></svg>`;
      stagingImg.src = fallbackSvg;
    };
  }
};

if (fileInputCamera)
  fileInputCamera.addEventListener("change", handleFileSelection);
if (fileInputGallery)
  fileInputGallery.addEventListener("change", handleFileSelection);

// ==========================================
// AIR DATEPICKER LOGIC (UNIFIED FIX)
// ==========================================
const localeEn = {
  days: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  daysMin: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  months: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  monthsShort: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  today: "Today",
  clear: "Clear",
  dateFormat: "MMM d, yyyy",
  timeFormat: "HH:mm",
  firstDay: 0,
};

function formatLocalDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    d = new Date();
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function showDatePicker(dateToUse) {
  if (!(dateToUse instanceof Date) || isNaN(dateToUse.getTime())) {
    dateToUse = new Date();
  }

  const container = document.getElementById("date-picker-container");
  if (container) container.style.display = "block";

  // 1. Initialize ONLY once. Never destroy it.
  if (!airPickerInstance) {
    airPickerInstance = new AirDatepicker("#vesper-datetime-picker", {
      locale: localeEn,
      timepicker: true,
      timeFormat: "HH:mm", // Strict 24h format
      maxHours: 23,
      minutesStep: 1,
      position: "bottom center",
      autoClose: false,
      isMobile: false,
      container: "#date-picker-container",
      onSelect: ({ date }) => {
        if (date && !Array.isArray(date)) {
          finalDate = formatLocalDate(date);
        }
      },
    });
  }

  // 2. Safely update the date without recreating the UI instance
  airPickerInstance.clear();
  airPickerInstance.selectDate(dateToUse);

  finalDate = formatLocalDate(dateToUse);
}

// ==========================================
// END AIR DATEPICKER LOGIC
// ==========================================

async function processExif(fileToParse) {
  manualSearchWrapper.style.display = "none";
  btnShareMap.style.display = "none";
  btnShareMap.disabled = true;
  if (btnLiveLocation) btnLiveLocation.style.display = "none";

  const container = document.getElementById("date-picker-container");
  if (container) container.style.display = "none";

  const defaultDate = new Date();
  finalDate = defaultDate.toISOString();

  finalLat = null;
  finalLon = null;

  try {
    const exifData = await exifr.parse(fileToParse, {
      gps: true,
      thumbnail: false,
    });

    let photoDate = defaultDate;
    if (exifData && exifData.DateTimeOriginal) {
      if (
        exifData.DateTimeOriginal instanceof Date &&
        !isNaN(exifData.DateTimeOriginal.getTime())
      ) {
        photoDate = exifData.DateTimeOriginal;
      }
    }

    showDatePicker(photoDate);

    if (exifData && exifData.latitude && exifData.longitude) {
      finalLat = exifData.latitude;
      finalLon = exifData.longitude;

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${finalLat}&lon=${finalLon}`,
        );
        const data = await res.json();
        if (data && data.display_name) {
          manualSearch.value = data.display_name
            .split(",")
            .slice(0, 3)
            .join(",");
          manualSearchWrapper.style.display = "flex";
        }
      } catch (err) {
        manualSearchWrapper.style.display = "flex";
      }

      btnShareMap.style.display = "flex";
      btnShareMap.disabled = false;
      btnShareMap.innerText = "Place this moment";
      return;
    }

    triggerFallbackLocation(photoDate);
  } catch (err) {
    console.warn(
      "EXIF parsing failed. Using default date and manual location.",
    );
    triggerFallbackLocation(defaultDate);
  }
}

function triggerFallbackLocation(dateToKeep) {
  if (!(dateToKeep instanceof Date) || isNaN(dateToKeep.getTime())) {
    dateToKeep = new Date();
  }

  showDatePicker(dateToKeep);

  showToast("No location found in photo.", true);
  manualSearchWrapper.style.display = "flex";
  manualSearch.value = "";
  manualSearchResults.innerHTML = "";
  manualSearchResults.classList.remove("show");

  btnShareMap.style.display = "flex";
  btnShareMap.disabled = true;
  btnShareMap.innerText = "Select a location first";
  if (btnLiveLocation) btnLiveLocation.style.display = "flex";
}

if (closeStagingBtn) {
  closeStagingBtn.addEventListener("click", () => {
    closeStagingArea();
    history.replaceState({}, "", window.location.pathname);
  });
}

if (btnLiveLocation) {
  btnLiveLocation.addEventListener("click", async () => {
    if (currentUserLat && currentUserLon)
      applyLiveLocation(currentUserLat, currentUserLon);
    else {
      showToast("Fetching live location...");
      navigator.geolocation.getCurrentPosition(
        (pos) => applyLiveLocation(pos.coords.latitude, pos.coords.longitude),
        () =>
          showToast("Please allow location access to use this feature.", true),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }
  });
}

async function applyLiveLocation(lat, lon) {
  finalLat = lat;
  finalLon = lon;
  manualSearch.value = "Pinpointing location...";

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
    );
    const data = await res.json();
    if (data && data.display_name)
      manualSearch.value = data.display_name.split(",").slice(0, 3).join(",");
    else manualSearch.value = "Current Live Location";
  } catch (err) {
    manualSearch.value = "Current Live Location";
  }

  if (manualSearchResults) manualSearchResults.classList.remove("show");
  btnShareMap.style.display = "flex";
  btnShareMap.disabled = false;
  btnShareMap.innerText = "Upload Here";
}

if (manualSearch) {
  manualSearch.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearTimeout(stagingSearchTimeout);
    manualSearchResults.innerHTML = "";
    finalLat = null;
    finalLon = null;
    btnShareMap.disabled = true;
    btnShareMap.innerText = "Select a location...";

    if (query.length < 3) {
      manualSearchResults.classList.remove("show");
      return;
    }

    stagingSearchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        );
        const data = await res.json();
        manualSearchResults.innerHTML = "";

        if (data.length === 0) {
          manualSearchResults.innerHTML = `<div class="search-result-item" style="color: #aaa; text-align:center;">No places found</div>`;
          manualSearchResults.classList.add("show");
          return;
        }

        data.forEach((place) => {
          const item = document.createElement("div");
          item.className = "search-result-item";
          item.innerText = place.display_name.split(",").slice(0, 3).join(",");
          item.addEventListener("click", () => {
            finalLat = parseFloat(place.lat);
            finalLon = parseFloat(place.lon);
            manualSearch.value = item.innerText;
            manualSearchResults.classList.remove("show");
            btnShareMap.style.display = "flex";
            btnShareMap.disabled = false;
            btnShareMap.innerText = "Place this moment";
          });
          manualSearchResults.appendChild(item);
        });
        manualSearchResults.classList.add("show");
      } catch (err) {}
    }, 500);
  });
}

if (btnShareMap) {
  btnShareMap.addEventListener("click", async () => {
    if (!finalLat || !finalLon)
      return showToast("Please provide a valid location.", true);

    const originalText = btnShareMap.innerText;
    btnShareMap.innerText = "Saving your moment...";
    btnShareMap.disabled = true;

    let uploadDate = finalDate;
    if (
      airPickerInstance &&
      airPickerInstance.selectedDates &&
      airPickerInstance.selectedDates.length > 0
    ) {
      const selected = airPickerInstance.selectedDates[0];
      if (selected instanceof Date && !isNaN(selected.getTime())) {
        uploadDate = formatLocalDate(selected);
      }
    }

    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("lat", finalLat);
    formData.append("lon", finalLon);
    formData.append("captured_at", uploadDate);
    formData.append("capture_type", selectedType);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          btnShareMap.innerText = `Saving... ${percent}%`;
          btnShareMap.style.backgroundImage = `linear-gradient(to right, rgba(255, 94, 58, 0.9) ${percent}%, rgba(255, 255, 255, 0.1) ${percent}%)`;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          btnShareMap.innerText = "Saved!";
          showToast("Archived successfully.");
          fetchAllPins();
          map.flyTo([finalLat, finalLon], 16, { animate: true, duration: 1.5 });
          setTimeout(() => {
            stagingArea.classList.remove("show");
            if (topUiLayer) {
              topUiLayer.style.transform = "translateY(0)";
              topUiLayer.style.opacity = "1";
            }
          }, 1000);
        } else {
          showToast("Upload failed.", true);
          btnShareMap.innerText = "Place this moment";
          btnShareMap.style.backgroundImage = "";
        }
      };
      xhr.onerror = () => {
        showToast("Network error.", true);
        btnShareMap.innerText = "Place this moment";
        btnShareMap.style.backgroundImage = "";
      };
      xhr.send(formData);
    } catch (error) {
      showToast("Upload failed.", true);
      btnShareMap.innerText = "Place this moment";
      btnShareMap.style.backgroundImage = "";
    }
  });
}

export function closeStagingArea() {
  if (stagingArea) stagingArea.classList.remove("show");

  if (
    topUiLayer &&
    galleryModal &&
    lightboxModal &&
    !galleryModal.classList.contains("show-modal") &&
    !lightboxModal.classList.contains("show")
  ) {
    topUiLayer.style.transform = "translateY(0)";
    topUiLayer.style.opacity = "1";
  }

  // Visual Cleanup
  selectedFile = null;
  if (stagingImg) {
    stagingImg.style.display = "block";
    const existingFallback = stagingImg.parentElement?.querySelector(
      ".heic-fallback-wrapper",
    );
    if (existingFallback) existingFallback.remove();
  }

  if (fileInputCamera) fileInputCamera.value = "";
  if (fileInputGallery) fileInputGallery.value = "";
  if (manualSearch) manualSearch.value = "";
  if (manualSearchResults) {
    manualSearchResults.innerHTML = "";
    manualSearchResults.classList.remove("show");
  }
  if (btnLiveLocation) btnLiveLocation.style.display = "none";

  // ==========================================
  // SAFE DATEPICKER CLEANUP
  // ==========================================
  // Do NOT use .destroy() and do NOT clone the input.
  // Just hide the calendar UI and reset the value.
  if (airPickerInstance) {
    airPickerInstance.hide();
    airPickerInstance.clear();
  }

  const pickerInput = document.getElementById("vesper-datetime-picker");
  if (pickerInput) pickerInput.value = "";

  if (btnShareMap) {
    btnShareMap.innerText = "Place this moment";
    btnShareMap.disabled = false;
    btnShareMap.style.background = "";
  }
}
