// OSB text edition: the notes, introductions, guides, and study articles ship encrypted beside the text
// (study.enc) and open with the same key (see boot.js). They are held in memory only.
// Called before the first view is drawn, so a chapter is laid out once, with its notes.
async function loadOsbStudy() {
  setStudyData(validatePersonalNotes(await window.OSB_EDITION.study()));
}
function osbSettingsHtml() {
  return `<p class="helper">Unlocked on this device</p><button class="text-button" id="lockOsb">Lock</button>`;
}
function wireOsbSettings() {
  const button = $("lockOsb");
  if (!button) return;
  // Two taps, so the text is never locked by accident. Afterwards this device stays locked, even from a
  // Home Screen icon that carries the link, until the passphrase is entered or the app is added again.
  button.onclick = async () => {
    if (button.dataset.armed) {
      await window.OSB_EDITION.lock();
      history.replaceState(null, "", location.pathname + location.search);
      location.reload();
      return;
    }
    button.dataset.armed = "true";
    button.textContent = "Tap again to lock";
    setTimeout(() => { if (button.isConnected) { delete button.dataset.armed; button.textContent = "Lock"; } }, 4000);
  };
}
