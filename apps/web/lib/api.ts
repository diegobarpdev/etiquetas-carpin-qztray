import type {
  AdminStation,
  AvailablePrinter,
  OrderListItem,
  OrderResponse,
  TemplateItem,
} from '../types';

async function readJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

async function throwIfNotOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  const payload = await readJson(res);
  throw new Error(payload.error || fallback);
}

export async function apiSearchOrders(
  q: string,
  signal?: AbortSignal,
): Promise<OrderListItem[]> {
  const res = await fetch(`/api/orders?q=${encodeURIComponent(q)}`, { signal });
  await throwIfNotOk(res, 'Error al buscar órdenes');
  return res.json();
}

export async function apiGetOrder(
  id: number,
  params: URLSearchParams,
): Promise<OrderResponse> {
  const qs = params.toString();
  const res = await fetch(`/api/orders/${id}${qs ? `?${qs}` : ''}`);
  await throwIfNotOk(res, 'Error al cargar la orden');
  return res.json();
}

export interface ManualProductLookup {
  id: number;
  ean: string;
  internalRef: string;
  name: string;
  templateCode: string;
  isKit: boolean;
}

export async function apiGetManualProduct(ean: string): Promise<ManualProductLookup> {
  const res = await fetch(`/api/manual/product?ean=${encodeURIComponent(ean)}`);
  await throwIfNotOk(res, 'Error al buscar el producto');
  return res.json();
}

export async function apiGetManualOrder(params: URLSearchParams): Promise<OrderResponse> {
  const res = await fetch(`/api/manual/order?${params.toString()}`);
  await throwIfNotOk(res, 'Error al generar la orden manual');
  return res.json();
}

export async function apiListTemplates(): Promise<TemplateItem[]> {
  const res = await fetch('/api/templates');
  if (!res.ok) throw new Error('Error al cargar plantillas');
  return res.json();
}

export async function apiAvailablePrinters(
  stockSize: string,
): Promise<{
  printers: AvailablePrinter[];
  stationCode: string | null;
  stationRequired: boolean;
  clientIp: string;
}> {
  const res = await fetch(`/api/printers/available?stockSize=${encodeURIComponent(stockSize)}`);
  if (!res.ok) throw new Error('Error al cargar impresoras');
  return res.json();
}

export async function apiPostJson<T = any>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new Error(payload.error || 'Error en la solicitud');
  }
  return payload;
}

export async function apiDownloadPdf(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) {
    const payload = await readJson(res);
    throw new Error(payload.error || 'Error al descargar el PDF');
  }
  return res.blob();
}

export async function apiDownloadPdfWithFilename(
  url: string,
  fallbackFilename: string,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    const payload = await readJson(res);
    throw new Error(payload.error || 'Error al descargar el PDF');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  return { blob, filename: match?.[1] || fallbackFilename };
}

// ——— Admin de impresoras ———

async function adminApi<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  return payload;
}

export function apiAdminSession() {
  return adminApi<{ unlocked: boolean }>('/api/admin/printers/session');
}

export function apiAdminUnlock(pin: string) {
  return adminApi('/api/admin/printers/unlock', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export function apiAdminLock() {
  return adminApi('/api/admin/printers/lock', { method: 'POST', body: '{}' });
}

export function apiAdminConfig() {
  return adminApi<{ stations: AdminStation[] }>('/api/admin/printers/config');
}

export function apiAdminSaveConfig(stations: AdminStation[]) {
  return adminApi('/api/admin/printers/config', {
    method: 'PUT',
    body: JSON.stringify({ stations }),
  });
}

export function apiAdminAddStation(name: string, code?: string) {
  return adminApi('/api/admin/printers/stations', {
    method: 'POST',
    body: JSON.stringify({ name, code }),
  });
}

export function apiAdminDeleteStation(stationId: string) {
  return adminApi(`/api/admin/printers/stations/${encodeURIComponent(stationId)}`, {
    method: 'DELETE',
  });
}

export interface AdminInspector {
  id: number;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function apiListActiveInspectors() {
  return fetch('/api/inspectors')
    .then(async (res) => {
      await throwIfNotOk(res, 'Error al listar inspectores');
      return res.json() as Promise<Array<{ id: number; name: string }>>;
    });
}

export function apiAdminListInspectors() {
  return adminApi<AdminInspector[]>('/api/admin/inspectors');
}

export function apiAdminCreateInspector(name: string) {
  return adminApi<AdminInspector>('/api/admin/inspectors', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function apiAdminUpdateInspector(
  id: number,
  patch: { name?: string; active?: boolean },
) {
  return adminApi<AdminInspector>(`/api/admin/inspectors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiAdminDeleteInspector(id: number) {
  return adminApi(`/api/admin/inspectors/${id}`, { method: 'DELETE' });
}
