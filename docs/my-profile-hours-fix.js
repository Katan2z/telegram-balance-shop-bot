async function myProfilePatchHours() {
  try {
    if (!window.myProfileState || !myProfileState.profile) return;
    const id = myProfileUserId();
    if (!id || myProfileState.timesheet) return;
    const rows = await myProfileFetch(`employee_timesheets?telegram_id=eq.${encodeURIComponent(id)}&period=eq.current&select=hours,updated_at&limit=1`).catch(() => []);
    if (!rows || !rows.length) return;
    myProfileState.timesheet = rows[0];
    if (typeof myProfileRender === "function") myProfileRender();
  } catch (error) {
    console.error(error);
  }
}

setTimeout(myProfilePatchHours, 1200);
setTimeout(myProfilePatchHours, 2600);
setInterval(myProfilePatchHours, 5000);
