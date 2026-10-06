import {afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/api/context',async importOriginal=>{const original=await importOriginal<typeof import('@/lib/api/context')>();return {...original,context:vi.fn(async()=>({user:{id:'fixture-user'},client:{rpc:vi.fn(async()=>({error:null}))}}))};});
import {POST} from '@/app/api/[workspace]/oauth/[provider]/route';
import {unseal} from './crypto';
afterEach(()=>vi.unstubAllEnvs());
it('keeps OAuth callback on the browser cookie origin when Next canonicalizes localhost',async()=>{
 vi.stubEnv('NODE_ENV','test');vi.stubEnv('APP_URL','http://localhost:3000');vi.stubEnv('GOOGLE_CLIENT_ID','fixture-client');vi.stubEnv('GOOGLE_CLIENT_SECRET','fixture-secret');vi.stubEnv('INTEGRATION_ENCRYPTION_KEY',Buffer.alloc(32,9).toString('base64'));
 const request=new NextRequest('http://localhost:3000/api/fixture/oauth/gmail',{method:'POST',headers:{origin:'http://127.0.0.1:3000'}});
 const response=await POST(request,{params:Promise.resolve({workspace:'fixture',provider:'gmail'})});expect(response.status).toBe(200);
 const data=await response.json();const redirect=new URL(data.url).searchParams.get('redirect_uri');expect(redirect).toBe('http://127.0.0.1:3000/api/oauth/gmail/callback');
 const state=unseal<{redirect:string}>(response.cookies.get('relay-oauth-gmail')!.value);expect(state.redirect).toBe(redirect);expect(response.headers.get('set-cookie')).toContain('HttpOnly');expect(data.url).not.toContain('fixture-secret');
});