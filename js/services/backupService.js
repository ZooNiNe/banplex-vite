import { localDB } from "./localDbService.js";

function _downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportLocalBackup() {
  const payload = { meta: { exportedAt: new Date().toISOString(), db: localDB.name, version: localDB.verno }, tables: {} };
  for (const table of localDB.tables) {
    try {
      payload.tables[table.name] = await table.toArray();
    } catch (_) {}
  }
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  _downloadBlob(`banplex-backup-${ts}.json`, blob);
}

export async function importLocalBackup(fileOrBlob) {
  const text = await fileOrBlob.text();
  const payload = JSON.parse(text);
  if (!payload || !payload.tables) throw new Error('Format backup tidak dikenal');
  await localDB.transaction('rw', localDB.tables, async () => {
    for (const [name, rows] of Object.entries(payload.tables)) {
      const table = localDB[name];
      if (!table || !Array.isArray(rows)) continue;
      try {
        await table.bulkPut(rows);
      } catch (_) {
        for (const row of rows) {
          try { await table.put(row); } catch (_) {}
        }
      }
    }
  });
}

