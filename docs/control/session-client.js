(function () {
  let refreshing = null;
  window.bk8AccessSession = async function (force = false) {
    const saved = storedAdminSession();
    if (!saved?.access_token) throw new Error('Сессия завершена. Войдите снова.');
    if (!force && Number(saved.expires_at) * 1000 > Date.now() + 60000) return saved;
    if (refreshing) return refreshing;
    const remember = localStorage.getItem(ADMIN_SESSION_KEY) !== null;
    refreshing = (async () => {
      const {url, key} = authConfig();
      const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: {apikey: key, 'Content-Type': 'application/json'},
        body: JSON.stringify({refresh_token: saved.refresh_token}),
      });
      if (!response.ok) {
        if ([400, 401].includes(response.status)) clearAdminSession();
        throw new Error('Не удалось продлить сессию. Повторите вход.');
      }
      const result = await response.json();
      const profile = decodeJwt(result.access_token).app_metadata || {};
      if (!['super_admin', 'restaurant_admin'].includes(profile.admin_role)) {
        clearAdminSession(); throw new Error('У этой учётной записи нет доступа.');
      }
      const session = {...saved, ...result, profile};
      saveAdminSession(session, remember);
      return session;
    })();
    try { return await refreshing; } finally { refreshing = null; }
  };
})();
