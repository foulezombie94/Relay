import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { loginDestination, sessionCookieOptions } from '@/lib/supabase/session';
export async function proxy(request:NextRequest) {
  let response=NextResponse.next({request});
  if (request.nextUrl.pathname==='/' || request.nextUrl.pathname==='/api/health' || request.nextUrl.pathname==='/api/jobs/run') return response;
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return response;
  const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{
    cookieOptions:sessionCookieOptions(),
    cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll(items,headers){
        items.forEach(({name,value})=>request.cookies.set(name,value));
        const previous=response;
        response=NextResponse.next({request});
        previous.cookies.getAll().forEach(cookie=>response.cookies.set(cookie));
        items.forEach(({name,value,options})=>response.cookies.set(name,value,options));
        for(const key of ['Cache-Control','Expires','Pragma']){
          const value=previous.headers.get(key);
          if(value)response.headers.set(key,value);
        }
        if(headers)for(const [key,value] of Object.entries(headers))response.headers.set(key,value);
      },
    },
  });
  const mode=request.nextUrl.searchParams.get('mode');
  if(request.nextUrl.pathname==='/login' && mode!=='signup' && mode!=='reset'){
    // A cookie or locally valid JWT alone is not enough to restore a session.
    const {data:{user},error}=await client.auth.getUser();
    if(user && !error){
      const redirect=NextResponse.redirect(new URL(loginDestination(request.nextUrl.searchParams.get('next')),request.url));
      response.cookies.getAll().forEach(cookie=>redirect.cookies.set(cookie));
      for(const key of ['Cache-Control','Expires','Pragma']){
        const value=response.headers.get(key);
        if(value)redirect.headers.set(key,value);
      }
      response=redirect;
    }
  }else await client.auth.getClaims();
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
