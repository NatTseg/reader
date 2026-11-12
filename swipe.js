// Back gestures are visual previews until release. Rendering/persistence happens only on commit.
let activeBackSlide = null;
function cancelBackSlide() {
  activeBackSlide?.cancel();
}
function captureSwipeView(surface) {
  if (!surface?.cloneNode) return null;
  const clone = surface.cloneNode(true);
  const original = [surface, ...surface.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  const scrolls = [];
  for (let i = 0; i < copies.length; i++) {
    const source = original[i], copy = copies[i];
    if (copy.id === 'dialogBody') copy.style.padding = getComputedStyle(source).padding;
    copy.removeAttribute('id');
    copy.removeAttribute('autofocus');
    if ('value' in source && source.type !== 'file') copy.value = source.value;
    if ('checked' in source) copy.checked = source.checked;
    if (source.scrollTop || source.scrollLeft) scrolls.push([i, source.scrollTop, source.scrollLeft]);
  }
  const style = getComputedStyle(surface);
  return { clone, scrolls, padding: style.padding, font: style.font, color: style.color };
}
function mountSwipeView(snapshot, host, className) {
  const layer = document.createElement('div');
  layer.className = `swipe-view ${className}`;
  layer.style.padding = snapshot?.padding || '0';
  if (snapshot) {
    layer.style.font = snapshot.font;
    layer.style.color = snapshot.color;
    const clone = snapshot.clone.cloneNode(true);
    layer.append(...clone.childNodes);
  }
  host.append(layer);
  if (snapshot) {
    const nodes = [layer, ...layer.querySelectorAll('*')];
    for (const [i, top, left] of snapshot.scrolls) {
      if (nodes[i]) { nodes[i].scrollTop = top; nodes[i].scrollLeft = left; }
    }
  }
  return layer;
}
function shouldCommitBack(distance, peak, width) {
  const threshold = Math.max(96, Math.min(240, width * 0.35));
  return distance >= threshold && peak - distance < 24;
}
function beginBackSlide(surface, parentSnapshot, dismissDialog) {
  cancelBackSlide();
  const rect = surface.getBoundingClientRect();
  const width = rect.width;
  const currentSnapshot = dismissDialog ? null : captureSwipeView(surface);
  let overlay, moving, previous;
  const savedTransform = surface.style.transform;
  const savedTransition = surface.style.transition;
  if (dismissDialog) {
    moving = surface;
    surface.classList.add('swipe-dismiss');
    surface.style.transition = 'none';
  } else {
    overlay = document.createElement('div');
    overlay.className = 'swipe-stage';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    Object.assign(overlay.style, {left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`});
    (surface === dialog ? dialog : document.body).append(overlay);
    previous = mountSwipeView(parentSnapshot, overlay, 'swipe-previous');
    moving = mountSwipeView(currentSnapshot, overlay, 'swipe-current');
  }
  let timer, disposed = false, pending = null;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    overlay?.remove();
    if (dismissDialog) {
      surface.style.transform = savedTransform;
      surface.style.transition = savedTransition;
      surface.style.removeProperty('--back-progress');
      surface.classList.remove('swipe-dismiss', 'swipe-settling');
      surface.classList.add('swipe-settled');
    }
    if (activeBackSlide === view) activeBackSlide = null;
  };
  const update = (distance) => {
    const x = Math.max(0, Math.min(width, distance));
    moving.style.transform = `translate3d(${x}px, 0, 0)`;
    if (previous) previous.style.transform = `translate3d(${-Math.min(64, width * 0.18) * (1 - x / width)}px, 0, 0)`;
    if (dismissDialog) surface.style.setProperty('--back-progress', String(x / width));
  };
  const view = {
    width,
    update,
    cancel: cleanup,
    // A new touch during the settle completes a committed swipe at once instead of discarding it.
    flush() {
      const action = pending;
      cleanup();
      action?.();
    },
    finish(commit, onCommit) {
      pending = commit ? onCommit : null;
      if (dismissDialog) surface.classList.add('swipe-settling');
      const duration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 200;
      moving.style.transition = `transform ${duration}ms cubic-bezier(.2,.7,.2,1)`;
      if (previous) previous.style.transition = moving.style.transition;
      // Flush the dragged position before assigning the settling position.
      moving.getBoundingClientRect();
      update(commit ? width : 0);
      timer = setTimeout(() => {
        if (disposed) return;
        pending = null;
        cleanup();
        if (commit) onCommit();
      }, duration);
    },
  };
  activeBackSlide = view;
  update(0);
  return view;
}
function backSnapshot() {
  if (dialog.open) return dialogBackSnapshot;
  if (returnPlace) return returnPlace.snapshot;
  if (state.tab === 'wisdom') return wisdomBackSnapshot;
  if (state.tab === 'prayers') return prayerBackSnapshot;
  return null;
}
function bindChapterSwipe(surface, drawer) {
  let start = null, onBack = null, axis = null, view = null;
  let distance = 0, peak = 0, suppressClickUntil = 0, lastMove = {x: 0, t: 0}, velocity = 0;
  const cancel = (animate = false) => {
    start = null;
    if (view) {
      if (animate) view.finish(false, () => {});
      else view.cancel();
    }
    view = null;
    if (!animate) cancelBackSlide();
  };
  surface.addEventListener('touchstart', (event) => {
    if (activeBackSlide) {
      if (start || !activeBackSlide.flush) { cancel(); cancelBackSlide(); return; }
      activeBackSlide.flush();
    }
    start = null; axis = null; distance = 0; peak = 0; view = null;
    onBack = backAction();
    if (event.touches.length !== 1 || (drawer ? !dialog.open : dialog.open || (state.tab !== 'bible' && !onBack))) return;
    // Books keep horizontal drags for reading; pinch-zoomed pages pan instead of navigating.
    if (drawer && dialog.classList?.contains('library-reader')) return;
    if ((window.visualViewport?.scale || 1) > 1.01) return;
    // Drags may start on list buttons (the click is suppressed afterwards), but not inside form fields.
    if (event.target.closest('input, textarea, select, [contenteditable]')) return;
    start = {x: event.touches[0].clientX, y: event.touches[0].clientY, t: Date.now()};
    lastMove = {x: start.x, t: start.t}; velocity = 0;
  }, {passive: true});
  surface.addEventListener('touchmove', (event) => {
    if (!start) return;
    if (event.touches.length !== 1) { cancel(true); return; }
    const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
    const now = Date.now(), x = event.touches[0].clientX;
    if (now > lastMove.t) { velocity = (x - lastMove.x) / (now - lastMove.t); lastMove = {x, t: now}; }
    if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) > 12) axis = Math.abs(dx) > Math.abs(dy) * 1.6 ? 'x' : 'y';
    if (axis === 'y') { cancel(); return; }
    if (axis !== 'x') return;
    if (dx > 0 && onBack && !view) {
      view = beginBackSlide(surface, backSnapshot(), drawer && !dialogBack);
    }
    if (view) {
      distance = Math.max(0, dx); peak = Math.max(peak, distance);
      view.update(distance);
    }
    const hourOpen = state.tab === 'prayers' && String(selectedPrayer || '').startsWith('hour:');
    if ((view || (!drawer && (state.tab === 'bible' || hourOpen) && dx < 0)) && event.cancelable) event.preventDefault();
  }, {passive: false});
  surface.addEventListener('touchend', (event) => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch ? touch.clientX - start.x : 0, dy = touch ? touch.clientY - start.y : 0;
    start = null;
    // A drag that ended with text selected was a selection, not a gesture.
    if (String(window.getSelection?.() || '').trim()) { if (view) { view.finish(false, () => {}); view = null; } return; }
    if (view) {
      distance = Math.max(0, dx); peak = Math.max(peak, distance);
      // A quick flick commits even when it is short.
      const flick = velocity > 0.6 && distance > 48 && Math.abs(dx) > Math.abs(dy) * 1.6;
      const commit = (swipeDirection(dx, dy) === 1 && shouldCommitBack(distance, peak, view.width)) || flick;
      // Only the click that ends this drag is swallowed; the next tap works.
      suppressClickUntil = Date.now() + (commit ? 350 : 120);
      view.update(distance);
      view.finish(commit, onBack);
      view = null;
    } else if (!drawer && axis === 'x' && dx <= -56) {
      // Swiping left opens the right-hand drawer: chapters in Read, sections in an Agpeya hour.
      if (state.tab === 'bible') { suppressClickUntil = Date.now() + 150; showChapterDrawer(); }
      else if (state.tab === 'prayers' && String(selectedPrayer || '').startsWith('hour:')) { suppressClickUntil = Date.now() + 150; showHourDrawer(); }
    }
  }, {passive: true});
  surface.addEventListener('touchcancel', () => cancel(true));
  surface.addEventListener('click', (event) => {
    if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('resize', () => cancel());
  window.addEventListener('orientationchange', () => cancel());
  window.addEventListener('pagehide', () => cancel());
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
}
