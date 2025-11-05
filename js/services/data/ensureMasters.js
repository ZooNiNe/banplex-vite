import { appState } from '../../state/appState.js';
import { fetchAndCacheData } from './fetch.js';
import { projectsCol, suppliersCol, workersCol, professionsCol, fundingCreditorsCol, materialsCol, opCatsCol, otherCatsCol } from '../../config/firebase.js';

const KEY_TO_COLLECTION = {
  projects: { col: projectsCol, order: 'projectName' },
  suppliers: { col: suppliersCol, order: 'supplierName' },
  workers: { col: workersCol, order: 'workerName' },
  professions: { col: professionsCol, order: 'professionName' },
  fundingCreditors: { col: fundingCreditorsCol, order: 'creditorName' },
  materials: { col: materialsCol, order: 'materialName' },
  operationalCategories: { col: opCatsCol, order: 'categoryName' },
  otherCategories: { col: otherCatsCol, order: 'categoryName' },
};

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function ensureMasterDataFresh(requiredKeys = [], options = {}) {
  const { force = false, ttlMs = DEFAULT_TTL_MS } = options;
  if (!Array.isArray(requiredKeys) || requiredKeys.length === 0) return;

  if (!appState.masterDataLastRefreshed) {
    appState.masterDataLastRefreshed = {};
  }

  const tasks = [];
  const now = Date.now();

  for (const key of requiredKeys) {
    const map = KEY_TO_COLLECTION[key];
    if (!map) continue;
    const last = appState.masterDataLastRefreshed[key] || 0;
    const isEmpty = !Array.isArray(appState[key]) || appState[key].length === 0;
    const isStale = (now - last) > ttlMs;
    const shouldFetch = force || isEmpty || isStale;
    if (!shouldFetch) continue;

    tasks.push((async () => {
      try {
        await fetchAndCacheData(key, map.col, map.order);
        appState.masterDataLastRefreshed[key] = Date.now();
      } catch (e) {
        // Ignore fetch error; consumers still can use local data
        console.warn(`ensureMasterDataFresh: gagal memuat ${key}`, e);
      }
    })());
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

