import { BlockList, isIP } from 'node:net';

export function createClientAddressResolver(ranges = []) {
  const trusted = new BlockList();
  for (const range of ranges) {
    const [address, rawPrefix] = range.split('/');
    const version = isIP(address);
    if (!version) throw new Error('TRUSTED_PROXIES contiene una dirección no válida.');
    const type = version === 4 ? 'ipv4' : 'ipv6';
    if (rawPrefix === undefined) trusted.addAddress(address, type);
    else {
      const prefix = Number(rawPrefix);
      if (!Number.isInteger(prefix) || prefix < 1 || prefix > (version === 4 ? 32 : 128)) throw new Error('TRUSTED_PROXIES requiere un rango explícito; no se permite confiar en toda Internet.');
      trusted.addSubnet(address, prefix, type);
    }
  }
  const isTrusted = (address) => Boolean(isIP(address)) && trusted.check(address, isIP(address) === 4 ? 'ipv4' : 'ipv6');
  return (request) => {
    const peer = request.socket.remoteAddress ?? 'unknown';
    if (!isTrusted(peer)) return peer;
    const header = request.headers['x-forwarded-for'];
    if (typeof header !== 'string') return peer;
    const chain = header.split(',').map((value) => value.trim());
    if (!chain.length || chain.length > 20 || chain.some((address) => !isIP(address))) return peer;
    for (let index = chain.length - 1; index >= 0; index -= 1) if (!isTrusted(chain[index])) return chain[index];
    return chain[0];
  };
}
