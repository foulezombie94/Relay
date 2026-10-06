import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
export async function proxy(request:NextRequest) {
  let response=NextResponse.next({request});
  if (request.nextUrl.pathname==='/api/health' || request.nextUrl.pathname==='/api/jobs/run') return response;
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return response;
  const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>request.cookies.getAll(),setAll(items,headers){items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});items.forEach(({name,value,options})=>response.cookies.set(name,value,options));if(headers)for(const [key,value] of Object.entries(headers))response.headers.set(key,value);}}});
  await client.auth.getClaims();
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
