// WebKit does not focus buttons on pointer activation. Remember the actual
// opener rather than relying on showModal's previously focused element.
export function openDialog(dialog, opener = document.activeElement) {
  if (dialog.open) return;
  dialog.addEventListener("close", () => {
    if (opener?.isConnected && !document.querySelector("dialog[open]")) opener.focus({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
}
