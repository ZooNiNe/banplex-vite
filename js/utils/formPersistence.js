import { parseFormattedNumber, parseLocaleNumber } from "./formatters.js";
import { emit } from "../state/eventBus.js";

export function attachFormDraftPersistence(form) {
      if (!form) return;
      restoreFormDraft(form);
      const handler = () => saveFormDraft(form);
      form.addEventListener('input', handler);
      form.addEventListener('change', handler, true);
      form._clearDraft = () => clearFormDraft(form);
  }

function getFormDraftKey(form) {
    const id = form.id || form.getAttribute('name') || 'form';
    const type = form.dataset?.type || '';
    return `form_draft:${id}${type ? ':' + type : ''}`;
}

function restoreFormDraft(form) {
    try {
        const key = getFormDraftKey(form);
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.entries(data).forEach(([name, value]) => {
            const field = form.elements[name] || form.querySelector(`[name="${name}"]`);
            if (!field) return;
            if (field instanceof RadioNodeList) {
                const v = String(value);
                Array.from(field).forEach(inp => { inp.checked = (inp.value === v); });
            } else if (field.type === 'checkbox') {
                field.checked = !!value;
            } else if (field.type === 'file') {
            } else {
                field.value = value;
            }
        });
    } catch (_) {}
}

function saveFormDraft(form) {
    try {
        const data = {};
        const controls = Array.from(form.elements || []);
        controls.forEach(ctrl => {
            if (!ctrl.name) return;
            if (ctrl.type === 'file') return;
            if (ctrl.type === 'checkbox') {
                data[ctrl.name] = ctrl.checked;
            } else if (ctrl.type === 'radio') {
                if (ctrl.checked) data[ctrl.name] = ctrl.value;
            } else {
                data[ctrl.name] = ctrl.value;
            }
        });
        const key = getFormDraftKey(form);
        localStorage.setItem(key, JSON.stringify(data));
    } catch (_) {}
}

function clearFormDraft(form) {
    try {
        const key = getFormDraftKey(form);
        localStorage.removeItem(key);
    } catch (_) {}
}


export function serializeForm(form) {
      const fd = new FormData(form);
      const data = {};
      for (const [k, v] of fd.entries()) {
          if (data[k] !== undefined) {
              if (!Array.isArray(data[k])) data[k] = [data[k]];
              data[k].push(v);
          } else {
              data[k] = v;
          }
      }
      return data;
}

export async function submitFormAsync(form) {
      const endpoint = form.getAttribute('action') || form.dataset.endpoint;
      if (!endpoint) throw new Error('Endpoint form tidak ditemukan');
      const method = (form.getAttribute('method') || 'POST').toUpperCase();
      const isMultipart = (form.getAttribute('enctype') || '').includes('multipart/form-data') || form.querySelector('input[type="file"]');
      let body;
      const headers = { 'Accept': 'application/json' };
      let shouldBypassApi = false;
      try {
          const isLocalhost = (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
          const devPorts = new Set(['5500', '5501', '5173', '5174']);
          const isDevStatic = isLocalhost && devPorts.has(location.port);
          const isAppApi = typeof endpoint === 'string' && endpoint.startsWith('/api/');
          shouldBypassApi = isDevStatic && isAppApi;
      } catch (_) { }
      if (shouldBypassApi) {
          throw new Error('DEV_NO_API');
      }
      if (isMultipart) {
          body = new FormData(form);
      } else {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(serializeForm(form));
      }
      const res = await fetch(endpoint, { method, body, headers });
      if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
      }
      let data = null;
      try { data = await res.json(); } catch (_) { data = await res.text().catch(() => ({})); }
      return data;
  }

export async function fallbackLocalFormHandler(form) {
      const id = form.id;
      const type = form.dataset.type;
      const fakeEvent = { preventDefault() {}, target: form };
      const eventName = `form.submit.${id.replace(/-/g, '')}`;
      try {
        emit(eventName, fakeEvent);
      } catch (e) {
          console.warn('Fallback handler gagal:', e);
          throw e;
      }
}

export async function apiRequest(method, url, payload = null) {
      const headers = { 'Accept': 'application/json' };
      let body;
      if (payload instanceof FormData) {
          body = payload;
      } else if (payload != null) {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(payload);
      }
      const res = await fetch(url, { method, headers, body });
      if (!res.ok) throw new Error(`API ${method} ${url} -> ${res.status}`);
      try { return await res.json(); } catch (_) { return null; }
}

export function mapDeleteEndpoint(entity, id) {
      if (entity === 'termin' || entity === 'income') return `/api/incomes/${id}`;
      if (entity === 'pinjaman' || entity === 'loan') return `/api/loans/${id}`;
      if (entity === 'expense') return `/api/expenses/${id}`;
      if (entity === 'bill') return `/api/bills/${id}`;
      if (entity === 'attendance') return `/api/attendance/${id}`;
      if (entity === 'stock_transaction') return `/api/stock/transactions/${id}`;
      if (entity.startsWith('master:')) {
          const t = entity.split(':')[1];
          return `/api/master/${t}/${id}`;
      }
      return null;
}
