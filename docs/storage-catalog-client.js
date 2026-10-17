(function () {
  let running = false;
  window.STORAGE_CATALOG_BLOCKED = true;
  window.STORAGE_CATALOG_STATUS = 'Проверяем актуальность сроков…';
  async function refresh() {
    if (running) return;
    running = true;
    try {
      const config = window.APP_CONFIG || {};
      if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) throw new Error('Нет подключения к базе');
      const response = await fetch(`${String(config.SUPABASE_URL).replace(/\/$/, '')}/rest/v1/storage_time_catalog?id=eq.true&select=revision,catalog,source,updated_at&limit=1`, {
        cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: {apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`},
      });
      if (response.status === 404) {
        window.STORAGE_CATALOG_BLOCKED = false;
        window.STORAGE_CATALOG_STATUS = 'Встроенные сроки. Импорт /sl ещё не подключён к базе.';
        return;
      }
      if (!response.ok) throw new Error('Ошибка загрузки сроков');
      const rows = await response.json();
      if (rows.length) {
        const snapshot = rows[0];
        if (!Array.isArray(snapshot.catalog?.items) || !snapshot.catalog.items.length) throw new Error('Повреждённый каталог');
        if (window.STORAGE_CATALOG_REVISION !== snapshot.revision) {
          const items = window.STORAGE_ITEMS || (window.STORAGE_ITEMS = []);
          items.splice(0, items.length, ...snapshot.catalog.items);
          window.STORAGE_CATALOG_REVISION = snapshot.revision;
        }
        window.STORAGE_CATALOG_STATUS = `Источник: ${snapshot.source}. Обновлено ${new Date(snapshot.updated_at).toLocaleString('ru-RU')}`;
      } else {
        window.STORAGE_CATALOG_STATUS = 'Встроенные сроки. Новая версия ещё не загружена через /sl.';
      }
      window.STORAGE_CATALOG_BLOCKED = false;
    } catch (error) {
      window.STORAGE_CATALOG_BLOCKED = true;
      window.STORAGE_CATALOG_STATUS = 'Не удалось проверить актуальность сроков. Обнови страницу или попробуй позже.';
      console.warn('Storage catalog unavailable', error);
    } finally {
      running = false;
      document.dispatchEvent(new CustomEvent('bk8:storage-updated'));
    }
  }
  refresh();
  window.bk8PollSection('tab-storage', 30000, refresh);
})();
