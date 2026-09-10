// Immersive Moment View - 2-State Physics Architecture

import { API_BASE } from "./constants.js";
import { parseAppDate } from "./utils.js";

const momentModal = document.getElementById("moment-modal");
const momentSlider = document.getElementById("moment-slider");
const momentLocation = document.getElementById("moment-location");
const momentTime = document.getElementById("moment-time");
const momentLiveBadge = document.getElementById("moment-live-badge");
const momentBackBtn = document.getElementById("moment-back-btn");
const momentLoader = document.getElementById("moment-loader");
const momentOverlay = document.querySelector(".moment-overlay");
const momentThumbnails = document.getElementById("moment-thumbnails"); // Restored Desktop Strip

let currentMomentData = null;
let allImages = [];
let currentImageIndex = 0;
let isExpanded = false;
let isDateExpanded = false;
let bgBlurElement = null;
let locationHideTimeout;
let isFirstImage = true;

export async function openMomentView(pinId, lat, lon) {
  if (!momentModal) return;

  // 1. Reset States
  isExpanded = false;
  isDateExpanded = false;
  currentImageIndex = 0;
  momentModal.classList.remove("expanded");
  history.pushState({ modal: "moment" }, "");
  momentModal.classList.add("show");
  document.body.style.overflow = "hidden";

  const topUiLayer = document.querySelector(".top-ui-layer");
  if (topUiLayer) {
    // Fade out, then instantly hide visibility
    topUiLayer.style.transition =
      "opacity 0.3s ease, visibility 0s linear 0.3s";
    topUiLayer.style.opacity = "0";
    topUiLayer.style.visibility = "hidden";
  }

  // 2. Setup YouTube-style Background Blur Element
  if (!bgBlurElement) {
    bgBlurElement = document.createElement("div");
    bgBlurElement.className = "moment-bg-blur";
    momentModal.insertBefore(bgBlurElement, momentSlider);
  }

  momentSlider.innerHTML = "";
  momentSlider.style.transform = `translateX(0px)`;
  momentLoader.style.display = "flex";
  momentLoader.classList.remove("fade-out");

  try {
    const response = await fetch(`${API_BASE}/pins/${pinId}`);
    if (!response.ok) throw new Error("Fetch failed");
    const images = await response.json();

    if (images.length === 0) {
      closeMomentView();
      return;
    }

    allImages = images;
    currentMomentData = allImages[0];

    // 3. Build Hardware-Accelerated Slides
    images.forEach((img, idx) => {
      const slide = document.createElement("div");
      slide.className = `moment-slide ${idx === 0 ? "active" : ""}`;

      const imgEl = document.createElement("img");
      imgEl.src = img.file_path;
      imgEl.loading = "lazy";
      imgEl.draggable = false; // Prevent native browser ghost dragging

      slide.appendChild(imgEl);
      momentSlider.appendChild(slide);
    });

    momentLoader.classList.add("fade-out");
    setTimeout(() => {
      momentLoader.style.display = "none";
    }, 400);

    const locationName = await fetchLocationName(lat, lon);
    momentLocation.textContent = locationName;

    // Build the Desktop Thumbnail Strip
    if (momentThumbnails && images.length > 1) {
      renderThumbnails(images);
      adjustThumbnailSize();
    } else if (momentThumbnails) {
      momentThumbnails.innerHTML = "";
    }

    goToImage(0); // Applies initial BG, UI, and Thumbnails

    // Adjust overlay position based on first image dimensions
    setTimeout(() => {
      adjustOverlayForImage();
    }, 500);
  } catch (error) {
    console.error("Moment view error:", error);
    closeMomentView();
  }
}

// --- STATE MANAGEMENT ---

function expandViewer() {
  isExpanded = true;
  momentModal.classList.add("expanded");
}

function collapseViewer() {
  isExpanded = false;
  momentModal.classList.remove("expanded");
  // Snap back to exact center when collapsing
  goToImage(currentImageIndex);
}

function goToImage(index) {
  currentImageIndex = index;
  currentMomentData = allImages[index];
  isFirstImage = index === 0;

  // 1. Move Track Smoothly
  const tx = -index * window.innerWidth;
  momentSlider.style.transition =
    "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)";
  momentSlider.style.transform = `translateX(${tx}px)`;

  // 2. Update Slide Focus
  const slides = momentSlider.querySelectorAll(".moment-slide");
  slides.forEach((slide, i) => {
    if (i === index) slide.classList.add("active");
    else slide.classList.remove("active");
  });

  // 3. Update Color Extraction Background
  if (bgBlurElement && currentMomentData) {
    bgBlurElement.style.backgroundImage = `url('${currentMomentData.file_path}')`;
  }

  // 4. Synchronize Desktop Thumbnail Strip
  syncThumbnails(index);

  // 5. Handle Location Visibility - always show on first image
  const momentHeader = document.querySelector(".moment-header");
  if (momentHeader) {
    if (isFirstImage && index === 0) {
      momentHeader.style.opacity = "1";
    } else {
      momentHeader.style.opacity = "0";
    }
  }

  updateUiForCurrentImage();
  adjustOverlayForImage();
}

// --- PHYSICS GESTURE ENGINE ---

if (momentModal) {
  let startX = 0,
    startY = 0,
    startTime = 0;
  let currentX = 0,
    currentY = 0;
  let lastTouchX = 0,
    lastTouchTime = 0,
    velocityX = 0;
  let isDragging = false;
  let isHorizontalSwiping = false;

  momentModal.addEventListener(
    "touchstart",
    (e) => {
      // Ignore if clicking UI elements
      if (
        e.target.closest(".moment-info") ||
        e.target.closest("#moment-back-btn") ||
        e.target.closest(".moment-thumbnails")
      )
        return;

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
      lastTouchX = startX;
      lastTouchTime = startTime;
      isDragging = true;
      isHorizontalSwiping = false;
      velocityX = 0;

      // Remove CSS transition so track follows finger exactly
      if (isExpanded) {
        momentSlider.style.transition = "none";
      }
    },
    { passive: true },
  );

  momentModal.addEventListener(
    "touchmove",
    (e) => {
      if (!isDragging) return;

      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
      const diffX = currentX - startX;
      const diffY = currentY - startY;

      // Calculate Gesture Velocity
      const now = Date.now();
      const dt = now - lastTouchTime;
      if (dt > 0) {
        velocityX = (currentX - lastTouchX) / dt;
      }
      lastTouchX = currentX;
      lastTouchTime = now;

      // Lock axis: If user is swiping horizontally in expanded mode, prevent vertical scroll
      if (isExpanded) {
        if (Math.abs(diffX) > Math.abs(diffY) || isHorizontalSwiping) {
          isHorizontalSwiping = true;
          e.preventDefault(); // Stop native scrolling behavior

          let tx = -currentImageIndex * window.innerWidth + diffX;

          // EDGE CASE: Apply "Resistance" (Rubber-banding) at edges
          if (currentImageIndex === 0 && diffX > 0) {
            tx = diffX * 0.25;
          } else if (currentImageIndex === allImages.length - 1 && diffX < 0) {
            tx = -currentImageIndex * window.innerWidth + diffX * 0.25;
          }

          momentSlider.style.transform = `translateX(${tx}px)`;
        }
      }
    },
    { passive: false },
  );

  momentModal.addEventListener("touchend", () => {
    if (!isDragging) return;
    isDragging = false;

    const diffX = currentX - startX;
    const diffY = currentY - startY;
    const timeElapsed = Date.now() - startTime;

    // Re-enable smooth transition for the snap
    momentSlider.style.transition =
      "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)";

    // EDGE CASE: Tiny swipe/Tap detection (Threshold < 10px)
    if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && timeElapsed < 300) {
      if (!isExpanded) expandViewer();
      else collapseViewer();
      return;
    }

    if (!isExpanded) {
      // HERO MODE Swipes
      if (diffY < -30) {
        expandViewer();
      }
      // Swipe down to close removed to enforce back-button ONLY exit.
    } else {
      // EXPANDED MODE Swipes
      if (diffY > 50 && !isHorizontalSwiping) {
        collapseViewer();
      } else if (isHorizontalSwiping) {
        const distanceThreshold = window.innerWidth * 0.2;
        const velocityThreshold = 0.5; // px/ms

        if (
          (diffX < -distanceThreshold || velocityX < -velocityThreshold) &&
          currentImageIndex < allImages.length - 1
        ) {
          currentImageIndex++;
        } else if (
          (diffX > distanceThreshold || velocityX > velocityThreshold) &&
          currentImageIndex > 0
        ) {
          currentImageIndex--;
        }

        goToImage(currentImageIndex);
      }
    }
  });
}

// --- DESKTOP THUMBNAIL LOGIC ---
function adjustThumbnailSize() {
  if (!momentThumbnails) return;

  const thumbItems = momentThumbnails.querySelectorAll(".thumbnail-item");
  const width = window.innerWidth; // Rely on width, just like CSS media queries
  let thumbSize;

  if (width > 1024) {
    thumbSize = Math.max(60, Math.min(90, width * 0.08));
  } else if (width > 768) {
    thumbSize = Math.max(50, Math.min(70, width * 0.07));
  } else {
    thumbSize = 60;
  }

  thumbItems.forEach((thumb) => {
    thumb.style.width = `${thumbSize}px`;
    thumb.style.height = `${thumbSize}px`;
  });
}

window.addEventListener("resize", adjustThumbnailSize);

function renderThumbnails(images) {
  if (!momentThumbnails) return;
  momentThumbnails.innerHTML = "";

  images.forEach((img, idx) => {
    const thumb = document.createElement("div");
    thumb.className = "thumbnail-item";
    if (idx === currentImageIndex) thumb.classList.add("active");

    const imgEl = document.createElement("img");
    imgEl.src = img.file_path;
    imgEl.loading = "lazy";
    imgEl.draggable = false;
    thumb.appendChild(imgEl);

    // Wire clicks directly into the new Physics Engine
    thumb.addEventListener("click", (e) => {
      e.stopPropagation();
      goToImage(idx);
    });

    momentThumbnails.appendChild(thumb);
  });

  adjustThumbnailSize();
}

function syncThumbnails(index) {
  if (!momentThumbnails) return;
  const thumbs = momentThumbnails.querySelectorAll(".thumbnail-item");
  thumbs.forEach((t, i) => {
    if (i === index) {
      t.classList.add("active");
      // Keep active thumbnail perfectly centered in the strip
      t.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    } else {
      t.classList.remove("active");
    }
  });
}

// --- UI & DATA UTILITIES ---

function adjustOverlayForImage() {
  if (!currentMomentData || !momentOverlay) return;

  const img = new Image();
  img.src = currentMomentData.file_path;

  img.onload = function () {
    const aspectRatio = this.naturalWidth / this.naturalHeight;
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    const screenAspect = screenWidth / screenHeight;

    let bottomPadding;
    if (aspectRatio > screenAspect) {
      bottomPadding = screenHeight * 0.15;
    } else if (aspectRatio > 1) {
      bottomPadding = screenHeight * 0.25;
    } else {
      bottomPadding = screenHeight * 0.2;
    }

    momentOverlay.style.paddingBottom = `${bottomPadding}px`;
  };
}

function updateUiForCurrentImage() {
  if (!currentMomentData) return;

  const captureType =
    currentMomentData.capture_type === "moon" ? "Night Sky" : "Sunset";
  const uploadDate = parseAppDate(currentMomentData.uploaded_at);

  // Always show date - no toggle functionality
  const smartDate = getSmartDate(currentMomentData.uploaded_at);
  const timeStr = uploadDate.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  // Base HTML string
  let timeHtml = `${timeStr} <span class="moment-capture-type">${captureType}</span> · <span class="moment-date">${smartDate}</span>`;

  // MINIMAL INLINE ADDITION: Show "+X more" cleanly beside the date ONLY on the first image
  if (allImages.length > 1 && currentImageIndex === 0) {
    const extraCount = allImages.length - 1;
    timeHtml += ` · <span style="opacity: 0.65; font-weight: 500;">+${extraCount} more</span>`;
  }

  momentTime.innerHTML = timeHtml;

  //const isToday = isWithin24Hours(uploadDate);
  if (momentLiveBadge) {
    momentLiveBadge.style.display = "none";
  }
}

function formatTimeDisplay(uploadedAt, captureType) {
  const uploadDate = parseAppDate(uploadedAt);
  const timeStr = uploadDate.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${timeStr} <span class="moment-capture-type">${captureType}</span>`;
}

function getSmartDate(uploadedAt) {
  const uploadDate = parseAppDate(uploadedAt);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const uploadDay = new Date(uploadDate);
  uploadDay.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - uploadDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (uploadDate.getFullYear() === today.getFullYear()) {
    return uploadDate.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
    });
  } else {
    return uploadDate.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
}

async function fetchLocationName(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
    );
    const data = await res.json();
    if (data && data.address) {
      const parts = [];
      if (data.address.city) parts.push(data.address.city);
      else if (data.address.town) parts.push(data.address.town);
      else if (data.address.village) parts.push(data.address.village);
      if (data.address.state) parts.push(data.address.state);
      return parts.join(", ") || "Unknown Location";
    }
    return "Unknown Location";
  } catch (err) {
    return "Unknown Location";
  }
}

function isWithin24Hours(date) {
  const diffMs = new Date() - date;
  return diffMs / (1000 * 60 * 60) <= 24;
}

// --- TEARDOWN ---

export function closeMomentView() {
  if (!momentModal) return;

  momentModal.classList.remove("show");
  document.body.style.overflow = "";

  setTimeout(() => {
    momentSlider.innerHTML = "";
    if (momentThumbnails) momentThumbnails.innerHTML = "";
    if (bgBlurElement) bgBlurElement.style.backgroundImage = "none";
    allImages = [];
    currentMomentData = null;
  }, 400);

  const topUiLayer = document.querySelector(".top-ui-layer");
  if (topUiLayer) {
    // Restore visibility instantly, then fade in
    topUiLayer.style.transition = "opacity 0.3s ease, visibility 0s linear 0s";
    topUiLayer.style.visibility = "visible";
    topUiLayer.style.opacity = "1";
  }
}

window.addEventListener("popstate", () => {
  if (momentModal && momentModal.classList.contains("show")) {
    closeMomentView();
  }
});

// --- RESIZE & ORIENTATION HANDLER ---
window.addEventListener("resize", () => {
  if (momentModal && momentModal.classList.contains("show")) {
    // 1. Instantly snap the slider track to the new window width
    const tx = -currentImageIndex * window.innerWidth;
    momentSlider.style.transition = "none";
    momentSlider.style.transform = `translateX(${tx}px)`;

    // 2. Recalculate dynamic overlay padding
    adjustOverlayForImage();

    // 3. Re-evaluate headers/thumbnails based on new dimensions
    if (
      window.innerWidth > 768 &&
      momentThumbnails.children.length === 0 &&
      allImages.length > 1
    ) {
      // Recover thumbnails if switching from mobile to desktop mode
      renderThumbnails(allImages);
    }
  }
});

// --- FAIL-PROOF EXIT: Capture Phase Global Listener ---
document.addEventListener(
  "click",
  (e) => {
    // Check if the click target is the back button (or inside it)
    const backBtn = e.target.closest("#moment-back-btn");

    if (backBtn) {
      // 1. Instantly kill all other event behaviors
      e.preventDefault();
      e.stopPropagation();

      // 2. Trigger the close sequence
      if (typeof closeMomentView === "function") {
        closeMomentView();

        // Fix history state to prevent users from getting trapped
        if (history.state && history.state.modal === "moment") {
          history.replaceState({}, "", window.location.pathname);
        } else {
          history.replaceState({}, "", window.location.pathname);
        }
      }
    }
  },
  true,
); // The 'true' forces this to run FIRST in the capture phase.
