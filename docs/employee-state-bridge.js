// BK8 Staff: expose the existing employee state to independent card modules.
(function () {
  try {
    if (typeof emp2State !== "undefined") {
      window.emp2State = emp2State;
    }
  } catch (error) {
    console.error("Employee state bridge failed", error);
  }
})();
