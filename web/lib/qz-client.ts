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

qz.security.setSignaturePromise((toSign: string) =>
  fetch('/api/qz/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: toSign }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.signature) throw new Error(data.error || 'Error al firmar con QZ');
      return data.signature as string;
    }),
);

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

/** Manda ZPL crudo a una impresora local vía QZ Tray (bypassa el driver Windows). */
export async function printRawZpl(printerName: string, zpl: string): Promise<void> {
  await connectQz();
  const config = qz.configs.create(printerName);
  await qz.print(config, [{ type: 'raw', format: 'command', flavor: 'plain', data: zpl }]);
}
