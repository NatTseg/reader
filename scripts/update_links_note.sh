#!/bin/bash
# Writes the current private links into the Apple Notes note "Reader & Unseen Warfare", editing it in place
# (it creates the note only if it does not exist). Run after any key rotation or deploy that changes a link.
set -euo pipefail
R="$(tr -d '\n' < "$(dirname "$0")/../.osb-unlock-link")"
U="$(cd ~/code/unseen-warfare && node scripts/unlock_link.mjs | tr -d '\n')"
# The Orthodox Study Bible text edition (its own app and link), when it has been built on this machine.
OSB_LINK_FILE="${OSB_LINK_FILE:-$HOME/code/reader-osb/.osb-unlock-link}"
O=""; [ -f "$OSB_LINK_FILE" ] && O="<p><b>Reader OSB</b> (Orthodox Study Bible text)<br><a href=\"$(tr -d '\n' < "$OSB_LINK_FILE")\">Open Reader OSB</a></p>"
BODY="<h1>Reader &amp; Unseen Warfare</h1><p><b>Reader</b><br><a href=\"$R\">Open Reader</a></p>$O<p><b>Unseen Warfare</b><br><a href=\"$U\">Open Unseen Warfare</a></p><p>On iPhone: open a link in Safari, then Share, Add to Home Screen. If an app asks to unlock, delete its icon and add it again from here.</p><p>Updated $(date '+%b %-d, %Y').</p>"
osascript - "$BODY" <<'APPLESCRIPT'
on run argv
  set noteBody to item 1 of argv
  tell application "Notes"
    set target to (default account's folder "Notes")
    set existing to (every note of target whose name is "Reader & Unseen Warfare")
    if (count of existing) > 0 then
      set body of (item 1 of existing) to noteBody
    else
      make new note at target with properties {body:noteBody}
    end if
  end tell
end run
APPLESCRIPT
echo "Note updated."
