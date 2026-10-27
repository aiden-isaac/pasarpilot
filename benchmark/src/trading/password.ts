import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export async function hashPassword(password: string): Promise<string> {
 if(password.length<12 || password.length>256) throw Error('password-must-be-12-to-256-characters');
 const salt=randomBytes(16).toString('hex');
 return `${salt}:${(await scrypt(password,salt,64) as Buffer).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
 const [salt, hash] = stored.split(':');
 if(!salt || !hash || password.length>256) return false;
 const actual=await scrypt(password,salt,64) as Buffer, expected=Buffer.from(hash,'hex');
 return actual.length===expected.length && timingSafeEqual(actual,expected);
}
