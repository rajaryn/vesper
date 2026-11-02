// Map initialization and core pin data loading.

import { API_BASE } from "./constants.js";
import { openMomentView } from "./moment-view.js";
import { parseAppDate, fetchWithRetry } from "./utils.js";

export let map;
export let markersLayer;
export let currentUserLat = null;
export let currentUserLon = null;

// Vector basemap: Protomaps tiles rendered by MapLibre inside Leaflet
let baseLayer;
let baseFlavor;
// India's official outline, drawn over the basemap
let indiaBorder;

// Read a design token from CSS so map overlays follow the light/dark theme
function cssToken(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

// A quiet, Positron-like basemap (what the old CARTO tiles looked like) so the
// sunset pins are the focus. Zoomed out it's land, water, borders and place
// names; roads, parks and neighbourhoods fade in as you zoom in.
const OVERVIEW_LAYERS = new Set([
  "background",
  "earth",
  "water",
  "boundaries_country",
  "boundaries", // state / province lines
  "water_label_ocean",
  "places_region", // state / province names
  "places_locality",
  "places_country",
]);
// Too fine-grained even zoomed in
const HIDDEN_LAYERS = new Set(["landcover", "address_label", "roads_oneway", "roads_shields"]);
// MapLibre zoom where detail starts (one behind Leaflet's, since it uses 512px tiles)
const DETAIL_MINZOOM = 6;
// Protomaps' near-monochrome flavors: no colored POI icons, muted roads
const BASE_FLAVOR = { light: "white", dark: "black" };

// Land and water follow the old CARTO look; labels match the app's palette
const BASEMAP_COLORS = {
  light: {
    background: "#fafaf8",
    earth: "#fafaf8",
    water: "#d4dadc",
    park_a: "#eef2ec",
    park_b: "#eef2ec",
    wood_a: "#f1f4ef",
    wood_b: "#f1f4ef",
    boundaries: "#c9cccf",
    state_boundaries: "#cfd3d6",
    state_label: "#b0b5ba",
    state_label_halo: "#fafaf8",
    country_label: "#9aa0a6",
    city_label: "#8a9096",
    city_label_halo: "#fafaf8",
    ocean_label: "#9fb4bf",
  },
  dark: {
    background: "#1c1f22",
    earth: "#1c1f22",
    water: "#2a2f34",
    park_a: "#1e2420",
    park_b: "#1e2420",
    wood_a: "#1d2220",
    wood_b: "#1d2220",
    boundaries: "#3a414b",
    state_boundaries: "#39404a",
    state_label: "#4f5762",
    state_label_halo: "#1c1f22",
    country_label: "#5f6873",
    city_label: "#6b7480",
    city_label_halo: "#1c1f22",
    ocean_label: "#3d4752",
  },
};

function buildBasemapStyle(flavor) {
  const key = document.querySelector('meta[name="protomaps-key"]')?.content;
  return {
    version: 8,
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${flavor}`,
    sources: {
      protomaps: {
        type: "vector",
        url: `https://api.protomaps.com/tiles/v4.json?key=${key}`,
      },
    },
    layers: basemaps
      .layers(
        "protomaps",
        { ...basemaps.namedFlavor(BASE_FLAVOR[flavor]), ...BASEMAP_COLORS[flavor] },
        { lang: "en" },
      )
      .filter((layer) => !HIDDEN_LAYERS.has(layer.id))
      .map((layer) => {
        if (OVERVIEW_LAYERS.has(layer.id)) return layer;
        return { ...layer, minzoom: Math.max(layer.minzoom ?? 0, DETAIL_MINZOOM) };
      })
      .map((layer) => {
        // State lines: fainter than country borders so the two read differently
        if (layer.id === "boundaries") {
          return {
            ...layer,
            paint: {
              ...layer.paint,
              "line-color": BASEMAP_COLORS[flavor].state_boundaries,
              "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 8, 1],
            },
          };
        }
        if (layer.type !== "symbol" || !layer.layout?.["text-field"]) return layer;
        // Single-line English labels (no second line in the local script)
        const simplified = {
          ...layer,
          layout: {
            ...layer.layout,
            "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
          },
        };
        // State names once zoomed in past the whole-country view
        if (layer.id === "places_region") simplified.minzoom = 4;
        // Only major cities at the default view, opening up as you zoom in until
        // every town shows at city level. Filters only see integer zooms.
        if (layer.id === "places_locality") {
          simplified.minzoom = 3;
          simplified.filter = [
            "all",
            ["==", ["get", "kind"], "locality"],
            [
              ">=",
              ["coalesce", ["get", "population_rank"], 0],
              ["step", ["zoom"], 13, 5, 12, 7, 10, 9, 0],
            ],
          ];
        }
        return simplified;
      }),
  };
}

export function setMapTheme(isDark) {
  const flavor = isDark ? "dark" : "light";
  if (indiaBorder) indiaBorder.setStyle({ color: cssToken("--map-border") });
  if (!baseLayer || flavor === baseFlavor) return;
  baseFlavor = flavor;

  // Fade the basemap out, swap the style, and fade back in once it has drawn,
  // rather than flashing between the light and dark maps
  const container = baseLayer.getContainer();
  const glMap = baseLayer.getMaplibreMap();
  container.style.opacity = "0";
  setTimeout(() => {
    glMap.setStyle(buildBasemapStyle(flavor));
    const reveal = () => (container.style.opacity = "1");
    glMap.once("idle", reveal);
    setTimeout(reveal, 1500); // Don't leave the map hidden if tiles are slow
  }, reduceMotion.matches ? 0 : 250);
}

// After posting: fly to the new photo, then mark its pin with a few soft rings
export async function showNewPin(lat, lon) {
  const landed = new Promise((resolve) => map.once("moveend", resolve));
  flyToGently([lat, lon], 16);
  await Promise.all([fetchAllPins(), landed]);

  // The server may merge the photo into an existing pin nearby, so use the closest
  let marker = null;
  let best = Infinity;
  markersLayer.eachLayer((m) => {
    const d = map.distance(m.getLatLng(), [lat, lon]);
    if (d < best) {
      best = d;
      marker = m;
    }
  });
  if (!marker) return;

  markersLayer.zoomToShowLayer(marker, () => {
    const dot = marker.getElement()?.firstElementChild;
    if (!dot) return;
    dot.classList.add("pin-new");
    setTimeout(() => dot.classList.remove("pin-new"), 4500);
  });
}

// Fly at a calm, steady pace. Longer trips (more zoom levels, more ground to
// cover) get more time, instead of every flight being squeezed into the same
// fraction of a second; that also gives the basemap time to load along the way.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Where the map was before a pin tap flew in to street level. Closing the photo
// glides back here, so you don't have to pinch all the way out again.
let returnView = null;

function rememberReturnView() {
  if (!returnView) {
    returnView = { center: map.getCenter(), zoom: map.getZoom() };
  }
}

window.addEventListener("moment:closed", () => {
  if (!returnView) return;
  const { center, zoom } = returnView;
  returnView = null;
  flyToGently(center, zoom);
});

export function flyToGently(latlng, zoom) {
  if (reduceMotion.matches) {
    map.setView(latlng, zoom, { animate: false });
    return;
  }
  const zoomChange = Math.abs(zoom - map.getZoom());
  const z = map.getZoom();
  const screens =
    map.project(latlng, z).distanceTo(map.project(map.getCenter(), z)) /
    map.getSize().x;
  const duration = Math.min(
    3.2,
    Math.max(1.2, 1 + 0.16 * zoomChange + 0.35 * Math.min(screens, 4)),
  );
  map.flyTo(latlng, zoom, { duration, easeLinearity: 0.15 });
}

export function initApp() {
  const bounds = L.latLngBounds(L.latLng(-89.9, -180), L.latLng(89.9, 180));
  map = L.map("map", {
    center: [22.5937, 78.9629],
    zoom: 4,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
    minZoom: 2,
    maxZoom: 20, // markercluster requires it; the old tile layer used to supply it
    zoomControl: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  // If you zoom back out yourself, there's nothing to return to
  map.on("zoomend", () => {
    if (returnView && map.getZoom() <= returnView.zoom) returnView = null;
  });
  // Bottom-left keeps the credits clear of the centred Capture button
  map.attributionControl.setPosition("bottomleft");

  // Start in the saved theme so we don't load the light style and then swap it
  const savedTheme = localStorage.getItem("theme");
  const startDark =
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  baseFlavor = startDark ? "dark" : "light";
  baseLayer = L.maplibreGL({
    style: buildBasemapStyle(baseFlavor),
    attribution:
      '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  fetch("/static/india.geojson")
    .then((res) => res.json())
    .then((data) => {
      indiaBorder = L.geoJSON(data, {
        style: { color: cssToken("--map-border"), weight: 1, fillOpacity: 0 },
        interactive: false,
      }).addTo(map);
    })
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
    const response = await fetchWithRetry(`${API_BASE}/pins`);
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
          rememberReturnView();
          flyToGently([pin.lat, pin.lon], 18);
        } else {
          openMomentView(pin.id, pin.lat, pin.lon, null, pin.place_name);
        }
      });
      markersLayer.addLayer(marker);
    });
  } catch (error) {
    console.error("Pin err:", error);
  }
}
