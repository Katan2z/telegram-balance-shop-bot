/* One scheduler, no overlapping refreshes, no polling hidden sections. */
(function () {
  const jobs = new Map();
  let stopped = false;
  window.bk8PollSection = function (id, interval, load) {
    jobs.set(id, { interval, load, next: 0, running: false });
  };
  async function tick() {
    if (stopped || document.hidden) return;
    for (const [id, job] of jobs) {
      const root = document.getElementById(id);
      if (!root || !root.getClientRects().length || job.running || Date.now() < job.next) continue;
      // Background refresh must not replace the form being edited.
      const focused = document.activeElement;
      if (root.contains(focused) && focused.matches('input,textarea,select,[contenteditable]')) continue;
      job.running = true;
      job.next = Date.now() + job.interval;
      Promise.resolve().then(job.load).catch(error => console.warn('Section refresh failed:', id, error))
        .finally(() => { job.running = false; });
    }
  }
  const timer = setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pagehide', () => { stopped = true; clearInterval(timer); });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
})();
