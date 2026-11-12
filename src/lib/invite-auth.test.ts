import {afterEach, describe, it, expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {AccountStore} from '../../server/accounts.cjs';
import {signSession,verifySession,sessionFromCookieHeader} from './auth';
const env={...process.env};let dir='';
afterEach(()=>{process.env= {...env};if(dir)fs.rmSync(dir,{recursive:true,force:true});});
describe('invite-only sessions',()=>{
 it('rejects old shared-password tokens and enforces per-account revocation',async()=>{
  process.env.PROXY_SECRET='test-only-secret';delete process.env.ACCOUNT_MODE;const old=signSession().token;
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'23tv-session-'));process.env.ACCOUNT_DATA_DIR=dir;process.env.ACCOUNT_MODE='invite';
  expect(verifySession(old)).toBe(false);const s=new AccountStore();const invite=await s.invite('test@example.com');s.setStatus(invite.id,'sent','test','test-id');const u=s.list().users[0];
  const token=signSession({id:u.id,revision:1}).token;expect(verifySession(token)).toBe(true);s.toggle(u.id,false);expect(verifySession(token)).toBe(false);
  expect(sessionFromCookieHeader('ltv_session=%ZZ')).toBe(false);
  expect(verifySession(signSession({id:'missing',revision:1}).token)).toBe(false);
 });
});
