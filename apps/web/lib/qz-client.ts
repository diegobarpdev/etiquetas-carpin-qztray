import * as qz from 'qz-tray';

qz.security.setCertificatePromise((resolve, reject) => {
  fetch('/api/qz/cert')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(resolve)
    .catch(reject);
});

qz.security.setSignatureAlgorithm('SHA512');

// OJO: tiene que ser `async` de verdad (no una función que solo devuelve una
// Promise) — qz-tray.js decide cómo invocarla mirando
// `signatureFactory.constructor.name === "AsyncFunction"`; si no matchea,
// la llama como "promise factory" vieja y explota con la Promise que le pasamos.
qz.security.setSignaturePromise(async (toSign: string) => {
  const res = await fetch('/api/qz/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: toSign }),
  });
  const data = await res.json();
  if (!data.signature) throw new Error(data.error || 'Error al firmar con QZ');
  return data.signature as string;
});

export class QzNotAvailableError extends Error {
  constructor() {
    super('QZ Tray no está instalado o no está corriendo en esta PC.');
    this.name = 'QzNotAvailableError';
  }
}

let connecting: Promise<void> | null = null;

/** Conecta al servicio local de QZ Tray (idempotente). */
export async function connectQz(): Promise<void> {
  if (qz.websocket.isActive()) return;
  if (!connecting) {
    connecting = qz.websocket
      .connect({ retries: 2, delay: 1 })
      .catch(() => {
        throw new QzNotAvailableError();
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

export function isQzConnected(): boolean {
  try {
    return qz.websocket.isActive();
  } catch {
    return false;
  }
}

/** Busca una impresora local (o mapeada como local) por nombre exacto/parcial. */
export async function findPrinter(name: string): Promise<string> {
  await connectQz();
  const found = await qz.printers.find(name);
  return Array.isArray(found) ? found[0] : found;
}

/** Lista todas las impresoras que QZ Tray ve en esta PC (locales o mapeadas por red). */
export async function listPrinters(): Promise<string[]> {
  await connectQz();
  const found = await qz.printers.find();
  return Array.isArray(found) ? found : [found];
}

/**
 * Manda ZPL crudo a una impresora local vía QZ Tray.
 * forceRaw: true es necesario para saltar el driver de Windows y escribir
 * los bytes directo a la impresora — sin esto, el driver ZDesigner
 * reinterpreta cada ^XA/^XZ como una "página" del trabajo y mete su propio
 * avance/retroceso (backfeed) entre etiquetas.
 */
export async function printRawZpl(printerName: string, zpl: string): Promise<void> {
  await connectQz();
  const config = qz.configs.create(printerName, { forceRaw: true });
  await qz.print(config, [{ type: 'raw', format: 'command', flavor: 'plain', data: zpl }]);
}
