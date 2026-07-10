// BK8 Staff: expose the existing employee state to independent card modules.
(function () {
  if (window.__bk8EmployeeStateBridgeStarted) return;
  window.__bk8EmployeeStateBridgeStarted = true;

  let attempts = 0;
  const maxAttempts = 100;

  function exposeState() {
    attempts += 1;
    try {
      if (typeof emp2State !== "undefined") {
        window.emp2State = emp2State;
        window.dispatchEvent(new CustomEvent("bk8:employee-state-ready"));
        return;
      }
    } catch (error) {
      console.error("Employee state bridge failed", error);
    }

    if (attempts < maxAttempts) {
      window.setTimeout(exposeState, 100);
    }
  }

  exposeState();
})();
