const STATE_LABELS: Record<string, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  progress: 'En curso',
  done: 'Hecha',
  to_close: 'Por cerrar',
  cancel: 'Cancelada',
  cancelled: 'Cancelada',
};

export function formatOrderState(state?: string | null): string {
  const raw = String(state || '').trim();
  if (!raw) return '—';
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  return STATE_LABELS[key] || raw.replace(/_/g, ' ');
}

export function orderStateClass(state?: string | null): string {
  const s = String(state || '').toLowerCase().replace(/\s+/g, '_');
  if (s === 'progress' || s === 'confirmed' || s === 'done' || s === 'to_close') {
    return `is-${s}`;
  }
  return '';
}

/** Plantillas que muestran / requieren inspector de la lista local. */
export function templateUsesInspector(templateCode?: string | null): boolean {
  const code = String(templateCode || '').trim();
  return (
    code === 'carpinteria' ||
    code === 'carpenter-tela' ||
    code === 'producto-conforme' ||
    code === 'producto-conforme-papel' ||
    code === 'producto-conforme-papel-colchones'
  );
}

