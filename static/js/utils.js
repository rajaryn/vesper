// Reusable helper functions.

export function showToast(message, isError = false) {
  const toastEl = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-message");
  const toastIcon = document.querySelector(".toast-icon");

  const successSvg = `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  const errorSvg = `<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

  if (toastMsg) toastMsg.innerText = message;
  if (toastIcon) {
    toastIcon.innerHTML = isError ? errorSvg : successSvg;
    toastIcon.style.color = isError ? "#ff4444" : "inherit";
  }

  if (toastEl) {
    toastEl.classList.add("show");
    clearTimeout(toastEl.hideTimeout);
    toastEl.hideTimeout = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 3000);
  }
}

export function isNetworkSlow() {
  if (navigator.connection && navigator.connection.effectiveType) {
    const speed = navigator.connection.effectiveType;
    if (speed === "2g" || speed === "slow-2g" || speed === "3g") return true;
  }
  return false;
}

export function parseAppDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;

  const cleanStr = String(dateStr)
    .replace("Z", "")
    .replace("z", "")
    .replace("T", " ")
    .trim();
  const parts = cleanStr.split(/[- :]/);
  if (parts.length >= 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const hour = parts.length > 3 ? parseInt(parts[3], 10) : 0;
    const minute = parts.length > 4 ? parseInt(parts[4], 10) : 0;
    const second = parts.length > 5 ? parseInt(parts[5], 10) : 0;
    return new Date(year, month, day, hour, minute, second);
  }
  return new Date(dateStr);
}