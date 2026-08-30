export function setActivity(element, active, message) {
  if (!element) return;
  if (typeof message === "string") element.textContent = message;
  if (active) {
    element.dataset.shiftcoreLoading = "true";
    element.setAttribute("aria-busy", "true");
    return;
  }
  delete element.dataset.shiftcoreLoading;
  element.setAttribute("aria-busy", "false");
}
