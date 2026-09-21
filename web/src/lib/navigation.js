const roots = new Set(['nearby', 'conversations']);

// Mark only this app's history entries. A directly opened detail/chat must never
// go back to an unrelated page, and switching tabs must not build a back loop.
export function createNavigation(browser) {
  const read = () => {
    const [view, rawId] = browser.location.hash.slice(1).split('/');
    let id;
    try { id = rawId ? decodeURIComponent(rawId) : undefined; } catch { id = undefined; }
    return { view: view || 'nearby', id };
  };
  const hashFor = ({ view, id }) => '#' + view + (id ? '/' + encodeURIComponent(id) : '');
  const initialize = () => {
    if (!Number.isInteger(browser.history.state?.bsideDepth)) {
      browser.history.replaceState({ bsideDepth: 0 }, '', hashFor(read()));
    }
  };
  const write = (route) => {
    initialize();
    if (browser.location.hash === hashFor(route)) return;
    const depth = browser.history.state.bsideDepth;
    if (roots.has(route.view) && roots.has(read().view)) {
      browser.history.replaceState({ bsideDepth: depth }, '', hashFor(route));
    } else {
      browser.history.pushState({ bsideDepth: depth + 1 }, '', hashFor(route));
    }
  };
  const back = (navigate) => {
    const { view } = read();
    if (view === 'nearby') return false;
    if (browser.history.state?.bsideDepth > 0) browser.history.back();
    else {
      const fallback = { view: view === 'chat' ? 'conversations' : 'nearby' };
      browser.history.replaceState({ bsideDepth: 0 }, '', hashFor(fallback));
      navigate(fallback.view, undefined, false);
    }
    return true;
  };
  return { read, write, back, initialize };
}
