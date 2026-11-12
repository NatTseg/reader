// OSB text edition: the notes, introductions, guides, and study articles ship encrypted beside the text
// (study.enc) and open with the same key (see boot.js). Nothing is stored unencrypted on the device.
async function loadOsbStudy() {
  applyPersonalNotes(validatePersonalNotes(await window.OSB_EDITION.study()));
}
function osbSettingsHtml() {
  return `<p class="helper">Unlocked on this device</p><button class="text-button" id="lockOsb">Lock</button>`;
}
function wireOsbSettings() {
  const button = $("lockOsb");
  if (!button) return;
  // Two taps, so the text is never locked by accident: opening it again needs the private link.
  button.onclick = () => {
    if (button.dataset.armed) {
      window.OSB_EDITION.lock();
      history.replaceState(null, "", location.pathname + location.search);
      location.reload();
      return;
    }
    button.dataset.armed = "true";
    button.textContent = "Tap again to lock";
    setTimeout(() => { if (button.isConnected) { delete button.dataset.armed; button.textContent = "Lock"; } }, 4000);
  };
}
