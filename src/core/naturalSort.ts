const naturalToken = /(\d+)/;

export function naturalKey(text: string): Array<number | string> {
  const out: Array<number | string> = [];
  for (const token of text.split(naturalToken)) {
    if (!token) {
      continue;
    }
    const n = Number.parseInt(token, 10);
    if (!Number.isNaN(n) && `${n}` === token) {
      out.push(n);
    } else {
      out.push(token.toLowerCase());
    }
  }
  return out;
}

export function naturalCompare(a: string, b: string): number {
  const ka = naturalKey(a);
  const kb = naturalKey(b);
  const len = Math.min(ka.length, kb.length);
  for (let i = 0; i < len; i += 1) {
    const va = ka[i];
    const vb = kb[i];
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) {
        return va - vb;
      }
      continue;
    }
    if (typeof va === 'string' && typeof vb === 'string') {
      const c = va.localeCompare(vb);
      if (c !== 0) {
        return c;
      }
      continue;
    }
    if (typeof va === 'number') {
      return -1;
    }
    return 1;
  }
  return ka.length - kb.length;
}
