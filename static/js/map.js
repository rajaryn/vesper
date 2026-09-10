// Map initialization and core pin data loading.

import { API_BASE } from "./constants.js";
import { openMomentView } from "./moment-view.js";
import { parseAppDate } from "./utils.js";

export let map;
export let markersLayer;
export let currentUserLat = null;
export let currentUserLon = null;

export function initApp() {
  const bounds = L.latLngBounds(L.latLng(-89.9, -180), L.latLng(89.9, 180));
  map = L.map("map", {
    center: [22.5937, 78.9629],
    zoom: 4,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
    minZoom: 2,
    zoomControl: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("/tiles/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
    keepBuffer: 8,
    updateWhenIdle: true,
  }).addTo(map);

  fetch("/static/india.geojson")
    .then((res) => res.json())
    .then((data) =>
      L.geoJSON(data, {
        style: { color: "#a3a3a3", weight: 1, fillOpacity: 0 },
        interactive: false,
      }).addTo(map),
    )
    .catch((err) => console.log("Border err:", err));

  markersLayer = L.markerClusterGroup({
    maxClusterRadius: 50,
    disableClusteringAtZoom: 17,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: false,
    zoomToBoundsOnClick: true,
    animate: true,
    animateAddingMarkers: true,
    removeOutsideVisibleBounds: false,
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let intensityClass = "cluster-low";
      if (count >= 50) intensityClass = "cluster-high";
      else if (count >= 20) intensityClass = "cluster-medium";

      const hasTodayPin = cluster
        .getAllChildMarkers()
        .some((m) => m.isTodayPin);

      return L.divIcon({
        html: `<div class="custom-cluster ${intensityClass} ${hasTodayPin ? "has-today" : ""}"><span>${count}</span></div>`,
        className: "cluster-wrapper",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
    },
  }).addTo(map);

  fetchAllPins();
  fetchSilentGPS();
}

export function fetchSilentGPS() {
  if (navigator.geolocation && !currentUserLat) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentUserLat = pos.coords.latitude;
        currentUserLon = pos.coords.longitude;
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
}

export async function fetchAllPins() {
  try {
    const response = await fetch(`${API_BASE}/pins`);
    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const pins = await response.json();
    markersLayer.clearLayers();

    if (!Array.isArray(pins)) return;

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();

    pins.forEach((pin) => {
      let isToday = false;
      if (pin.last_upload_at) {
        const pinDate = parseAppDate(pin.last_upload_at);
        if (
          pinDate.getFullYear() === todayYear &&
          pinDate.getMonth() === todayMonth &&
          pinDate.getDate() === todayDate
        ) {
          isToday = true;
        }
      }

      const pinClass = isToday ? "today-pin" : "premium-pin";
      const dynamicIcon = L.divIcon({
        className: "sunset-wrapper",
        html: `<div class="${pinClass}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marker = L.marker([parseFloat(pin.lat), parseFloat(pin.lon)], {
        icon: dynamicIcon,
      });
      marker.isTodayPin = isToday;
      marker.on("click", () => {
        if (map.getZoom() < 18) {
          map.flyTo([pin.lat, pin.lon], 18, { duration: 0.8 });
        } else {
          openMomentView(pin.id, pin.lat, pin.lon);
        }
      });
      markersLayer.addLayer(marker);
    });
  } catch (error) {
    console.error("Pin err:", error);
  }
}
