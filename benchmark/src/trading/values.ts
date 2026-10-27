export const MAX = 2147483647;
export function integer(n: unknown, min = 0): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > MAX) throw Error('invalid-integer-or-overflow');
  return n;
}
export function quantity(s: string): number {
  if (!/^[1-9]\d{0,9}$/.test(s)) throw Error('positive-integer-quantity-required');
  return integer(Number(s), 1);
}
export function sen(s: string): number {
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(s)) throw Error('MYR-requires-at-most-two-decimals');
  const [whole, fraction = ''] = s.split('.');
  return integer(Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
}
export function total(price: number, qty: number, fee = 0): number {
  integer(price); integer(qty, 1); integer(fee);
  return integer(price * qty + fee);
}
export function myr(n: number) { integer(n); return `RM${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`; }
export function snapshot(card: Record<string, unknown>, qty: number, price: number) {
  total(price, qty);
  return Object.freeze({ name: card.name, printing: card.printing, collector: card.collector,
    language: card.language, finish: card.finish, condition: card.condition, quantity: qty, unit_price: price, policy_version: card.version });
}
export function text(s: unknown, max = 200): string {
  if (typeof s !== 'string' || !s.trim() || s.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)) throw Error('invalid-text');
  return s.trim();
}
