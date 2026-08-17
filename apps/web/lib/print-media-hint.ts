/**
 * Texto operativo para el operario: qué material debe estar cargado en la Zebra
 * según la plantilla seleccionada.
 */
export function getPrintMediaChecklist(templateCode: string | null | undefined): string | null {
  const code = String(templateCode || '').trim();
  if (!code) return null;

  switch (code) {
    case 'carpinteria':
    case 'producto-conforme':
      return 'Ribbon y Rollo de Etiquetas Adhesivas';

    case 'bulto-estandar':
    case 'producto-terminado-carpenter':
    case 'colchon-v1':
    case 'colchon-v2':
    case 'velador-simple':
      return 'Unicamente Rollo de Etiquetas Adhesivas';

    case 'carpenter-tela':
    case 'producto-conforme-papel':
    case 'producto-conforme-papel-colchones':
      return 'Ribbon y Rollo de Tela';

    default:
      return null;
  }
}
