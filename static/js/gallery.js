//Image loading, cards, and the lightbox carousel

import { API_BASE, svgMoon, svgSun } from "./constants.js";
import { parseAppDate } from "./utils.js";

const galleryModal = document.getElementById("gallery-modal");
const galleryContent = document.getElementById("gallery-content");
const closeBtn = document.getElementById("close-btn");
const galleryLoading = document.getElementById("gallery-loading");
const lightboxModal = document.getElementById("lightbox-modal");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxDate = document.getElementById("lightbox-date");
const topUiLayer = document.querySelector(".top-ui-layer");

let currentGalleryImages = [];
let currentImageIndex = 0;

export async function openGallery(pinId) {
  history.pushState({ modal: "gallery" }, "");
  galleryModal.classList.add("show-modal");

  if (topUiLayer) {
    topUiLayer.style.transition =
      "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease";
    topUiLayer.style.transform = "translateY(-150%)";
    topUiLayer.style.opacity = "0";
  }

  galleryContent.innerHTML = "";
  galleryLoading.style.display = "flex";
  galleryLoading.classList.remove("fade-out");
  galleryLoading.innerHTML = `<div class="orbiting-ember"></div>`;

  try {
    const response = await fetch(`${API_BASE}/pins/${pinId}`);
    if (!response.ok) throw new Error("Fetch failed");
    const images = await response.json();

    galleryLoading.classList.add("fade-out");
    setTimeout(() => {
      galleryLoading.style.display = "none";
    }, 800);

    if (images.length === 0) {
      galleryContent.innerHTML = `<p style="color:white; text-align:center; width:100%; margin-top: 60px;">No skies caught here yet.</p>`;
      return;
    }

    currentGalleryImages = images;

    images.forEach((img, index) => {
      const card = document.createElement("div");
      card.className = "image-card";
      card.style.animationDelay = `${index * 0.1}s`;
      card.onclick = () => openLightbox(index);

      const typeBadge = document.createElement("div");
      typeBadge.className = "type-badge";
      typeBadge.style.display = "flex";
      typeBadge.style.alignItems = "center";
      typeBadge.style.justifyContent = "center";
      typeBadge.innerHTML = img.capture_type === "moon" ? svgMoon : svgSun;

      const imgElement = document.createElement("img");
      imgElement.src = img.file_path;
      imgElement.className = "gallery-img";
      imgElement.loading = "lazy";

      const dateElement = document.createElement("div");
      dateElement.className = "image-date";
      const uploadDate = parseAppDate(img.uploaded_at);
      dateElement.innerText = uploadDate.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      card.appendChild(imgElement);
      card.appendChild(typeBadge);
      card.appendChild(dateElement);
      galleryContent.appendChild(card);
    });
  } catch (error) {
    galleryLoading.classList.remove("fade-out");
    galleryLoading.style.display = "flex";
    galleryLoading.innerHTML = `<p style="color:#ff5e3a; text-align:center;">Failed to catch the view.</p>`;
  }
}

if (closeBtn) closeBtn.addEventListener("click", () => {
  galleryModal.classList.remove("show-modal");
  history.replaceState({}, "", window.location.pathname);
});

function openLightbox(index) {
  currentImageIndex = index;
  updateLightboxView();
  history.pushState({ modal: "lightbox" }, "");
  lightboxModal.classList.add("show");
}

function closeLightbox() {
  lightboxModal.classList.remove("show");
  history.replaceState({}, "", window.location.pathname);
}

function updateLightboxView(direction = "none") {
  const img = currentGalleryImages[currentImageIndex];
  lightboxModal.style.opacity = "0";

  if (direction === "next")
    lightboxImg.style.transform = "translateX(-30px) scale(0.95)";
  else if (direction === "prev")
    lightboxImg.style.transform = "translateX(30px) scale(0.95)";
  else lightboxImg.style.transform = "scale(0.95)";

  setTimeout(() => {
    const uploadDate = parseAppDate(img.uploaded_at);
    lightboxDate.innerText = uploadDate.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    lightboxImg.onload = () => {
      lightboxModal.style.opacity = "1";
      lightboxImg.style.transform = "translateX(0) scale(1)";
    };
  }, 200);
}

function prevImage() {
  currentImageIndex--;
  if (currentImageIndex < 0)
    currentImageIndex = currentGalleryImages.length - 1;
  updateLightboxView("prev");
}

function nextImage() {
  currentImageIndex++;
  if (currentImageIndex >= currentGalleryImages.length) currentImageIndex = 0;
  updateLightboxView("next");
}

if (lightboxModal) {
  lightboxModal.addEventListener("click", (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });

  let touchStartX = 0,
    touchEndX = 0;
  lightboxModal.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0].screenX;
    },
    false,
  );
  lightboxModal.addEventListener(
    "touchend",
    (e) => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 40) nextImage();
      else if (touchStartX - touchEndX < -40) prevImage();
    },
    false,
  );
}