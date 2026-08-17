export const FACTORY_INFO = {
  address: 'Fabrica: Cornelio Veintimilla 2-56 y Carlos Tosi.',
  phone: 'Telf: +593 7 280 9445.',
  email: 'E-mail: documentosctin@colinealcorp.com',
};

/** Pie de fábrica para producto terminado (bulto / colchones). */
export const PRODUCTO_TERMINADO_FACTORY_FOOTER =
  'Fabrica: Parque Industrial Machangara. Tel: 2805122. E-mail: colineal@colinealcorp.com www.colineal.com';

/** @deprecated Use PRODUCTO_TERMINADO_FACTORY_FOOTER */
export const COLCHON_FACTORY_FOOTER = PRODUCTO_TERMINADO_FACTORY_FOOTER;

export const COLCHON_V1_FINISH_INSTRUCTIONS =
  'TRANSPORTAR Y MANIPULAR\nMÍNIMO ENTRE 2 PERSONAS.\nALMACENAR EL PRODUCTO\nSIEMPRE EN POSICIÓN HORIZONTAL.';

/** @deprecated Use COLCHON_V1_FINISH_INSTRUCTIONS */
export const COLCHON_FINISH_INSTRUCTIONS = COLCHON_V1_FINISH_INSTRUCTIONS;

export const COLCHON_V2_FINISH_INSTRUCTIONS =
  'TRANSPORTAR Y MANIPULAR\nMÍNIMO ENTRE 2 PERSONAS.\nALMACENAR EL PRODUCTO\nSIEMPRE EN POSICIÓN VERTICAL.\nTIEMPO DE ENRROLLADO: MAX 6 MESES';

export const PRODUCTO_CONFORME_TITLE = 'PRODUCTO CONFORME';

export const PRODUCTO_CONFORME_SUBTITLE =
  'Este producto es conforme con las especificaciones de nuestra empresa.';

export const PRODUCTO_CONFORME_MADE_IN = 'CUENCA - ECUADOR';

/** Etiqueta producto conforme horizontal (10 × 7 cm). */
export const PRODUCTO_CONFORME_SIZE = {
  widthMm: 100,
  heightMm: 70,
};

// Diseño de contenido bulto-estandar (150 mm ancho × 100 mm alto, leído en horizontal)
export const LABEL_SIZE = {
  widthMm: 150,
  heightMm: 100,
};

export interface LabelPrintSize {
  widthMm: number;
  heightMm: number;
}

/**
 * Stocks seleccionables en la UI (impresora / papel del driver).
 * El tamaño real del PDF lo define la plantilla (`TEMPLATE_PRINT_SIZE`), no este mapa.
 */
export const LABEL_STOCK_SIZES = {
  'producto-terminado': {
    code: 'producto-terminado',
    // Referencia 15×10; la Zebra (cabezal ~104 mm) recibe el bitmap rotado 90° en el agente.
    label: 'Producto terminado · 15 × 10 cm (horizontal)',
    widthMm: 150,
    heightMm: 100,
  },

  'producto-conforme': {
    code: 'producto-conforme',
    label: 'Producto conforme · 10 × 7 cm (horizontal)',
    widthMm: 100,
    heightMm: 70,
  },
  'conforme-papel': {
    code: 'conforme-papel',
    label: 'Producto conforme tela · 6 × 9 cm (vertical rotado)',
    widthMm: 60,
    heightMm: 90,
  },
  'conforme-papel-colchones': {
    code: 'conforme-papel-colchones',
    label: 'Producto conforme colchones tela · 6 × 10 cm (vertical rotado)',
    widthMm: 60,
    heightMm: 100,
  },
  carpinteria: {
    code: 'carpinteria',
    label: 'Carpenter · 10 × 7 cm (horizontal)',
    widthMm: 100,
    heightMm: 70,
  },
} as const;

export type LabelStockSizeCode = keyof typeof LABEL_STOCK_SIZES;

/**
 * Nombre exacto del formulario de papel en el driver Windows / Zebra.
 * Debe coincidir con lo que aparece en el diálogo de impresión.
 */
export const DRIVER_PAPER_BY_STOCK: Record<LabelStockSizeCode, string> = {
  'producto-terminado': 'producto terminado',
  'producto-conforme': 'producto conforme',
  carpinteria: 'producto conforme',
  'conforme-papel': 'conforme papel',
  'conforme-papel-colchones': 'conforme papel',
};

export function getDriverPaperName(stockSize?: string | null): string {
  if (stockSize && stockSize in DRIVER_PAPER_BY_STOCK) {
    return DRIVER_PAPER_BY_STOCK[stockSize as LabelStockSizeCode];
  }
  return DRIVER_PAPER_BY_STOCK['producto-terminado'];
}

export function listDriverPaperNames(): string[] {
  return [...new Set(Object.values(DRIVER_PAPER_BY_STOCK))];
}

/** Tamaño físico de la página PDF por plantilla (puede diferir del diseño si hay rotación). */
const TEMPLATE_PRINT_SIZE: Record<string, LabelPrintSize> = {
  'bulto-estandar': { widthMm: 150, heightMm: 100 },
  'colchon-v1': { widthMm: 150, heightMm: 100 },
  'colchon-v2': { widthMm: 150, heightMm: 100 },
  'producto-conforme': { widthMm: 100, heightMm: 70 },
  'producto-conforme-papel': { widthMm: 60, heightMm: 90 },
  'producto-conforme-papel-colchones': { widthMm: 60, heightMm: 100 },
  carpinteria: { widthMm: 100, heightMm: 70 },
  'carpenter-tela': { widthMm: 60, heightMm: 90 },
  'producto-terminado-carpenter': { widthMm: 150, heightMm: 100 },
};

export function getPrintSizeForTemplate(templateCode: string): LabelPrintSize {
  return TEMPLATE_PRINT_SIZE[templateCode] ?? LABEL_SIZE;
}

export function getLabelStockSize(code?: string | null): LabelPrintSize | null {
  if (!code) return null;
  const stock = LABEL_STOCK_SIZES[code as LabelStockSizeCode];
  if (!stock) return null;
  return { widthMm: stock.widthMm, heightMm: stock.heightMm };
}

export function resolvePrintSize(
  templateCode: string,
  _stockSizeCode?: string | null,
): LabelPrintSize {
  // El tamaño siempre lo define la plantilla; el stock no lo cambia.
  return getPrintSizeForTemplate(templateCode);
}

export function suggestStockSizeForTemplate(templateCode: string): LabelStockSizeCode {
  if (templateCode === 'producto-conforme') {
    return 'producto-conforme';
  }
  if (templateCode === 'producto-conforme-papel') {
    return 'conforme-papel';
  }
  if (templateCode === 'producto-conforme-papel-colchones') {
    return 'conforme-papel-colchones';
  }
  if (templateCode === 'carpinteria') {
    return 'carpinteria';
  }
  if (templateCode === 'carpenter-tela') {
    return 'conforme-papel';
  }
  return 'producto-terminado';
}
