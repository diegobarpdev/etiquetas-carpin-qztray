import { networkInterfaces } from 'os';

const VIRTUAL_INTERFACE = /docker|veth|wsl|hyper-v|vethernet|loopback/i;

function isPrivateLanIp(ip: string): boolean {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.') && !ip.startsWith('192.168.64.')) return true;
  const match = /^172\.(\d+)\./.exec(ip);
  if (match) {
    const second = Number(match[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

export function getLanIpv4Addresses(): string[] {
  const addresses = new Set<string>();

  for (const [name, interfaces] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_INTERFACE.test(name)) continue;
    if (!interfaces) continue;

    for (const iface of interfaces) {
      const isIpv4 = String(iface.family) === 'IPv4';
      if (!isIpv4 || iface.internal) continue;
      if (!isPrivateLanIp(iface.address)) continue;
      addresses.add(iface.address);
    }
  }

  return [...addresses];
}

export function getPublicUrls(port: number): string[] {
  const publicUrl = process.env.PUBLIC_URL?.trim().replace(/\/$/, '');

  if (publicUrl) {
    return [publicUrl, `http://localhost:${port}`];
  }

  const urls = new Set<string>();

  for (const ip of getLanIpv4Addresses()) {
    urls.add(`http://${ip}:${port}`);
  }

  urls.add(`http://localhost:${port}`);

  return [...urls];
}
