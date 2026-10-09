import 'server-only';
import {ZodError} from 'zod';
import { db } from '@/lib/supabase/server';
import { NextRequest,NextResponse } from 'next/server';
import type { Role } from '@/lib/domain/types';
import { after } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { logEvent } from '@/lib/observability/logger';
import {assertAuthAvailable,AuthUnavailableError} from '@/lib/supabase/session';
export class ApiError extends Error {constructor(message:string,public status=400){super(message);}}
export async function context(workspaceId:string,write=false) {
  const client=await db();const {data:{user},error}=await client.auth.getUser();
  assertAuthAvailable(error);
  if(error||!user)throw new ApiError('Connectez-vous pour continuer.',401);
  const {data:membership}=await client.from('memberships').select('role').eq('workspace_id',workspaceId).eq('user_id',user.id).single();
  if(!membership)throw new ApiError('Cet espace est inaccessible.',403);
  if(write&&membership.role==='viewer')throw new ApiError('Vous avez un accès en lecture seule.',403);
  return {client,user,role:membership.role as Role,workspaceId};
}
export function requireAdmin(role:Role){if(!['owner','admin'].includes(role))throw new ApiError('Cette action est réservée aux administrateurs.',403);}
export function checkOrigin(request:NextRequest){
  const origin=request.headers.get('origin');
  if(!origin)return;
  const bases=[new URL(request.url)];
  if(process.env.APP_URL)bases.push(new URL(process.env.APP_URL));
  const allowed=new Set(bases.map(url=>url.origin));
  // Next's local server may canonicalize 127.0.0.1 to localhost.
  // Treat loopback aliases as equivalent only in development, on the same port.
  if(process.env.NODE_ENV!=='production'){
    for(const base of bases){
      if(['localhost','127.0.0.1','[::1]'].includes(base.hostname)){
        for(const hostname of ['localhost','127.0.0.1','[::1]']){
          const alias=new URL(base.origin);
          alias.hostname=hostname;
          allowed.add(alias.origin);
        }
      }
    }
  }
  if(!allowed.has(origin))throw new ApiError('Origine non autorisée.',403);
}
export function fail(error:unknown){
  if(error instanceof AuthUnavailableError)error=new ApiError(error.message,503);
  if(error instanceof ZodError)return NextResponse.json({error:error.issues.map(i=>i.path.join('.')+': '+i.message).join(' ')},{status:400});
  if(!(error instanceof ApiError)||error.status>=500){
    const status=error instanceof ApiError?error.status:500;
    Sentry.captureException(new Error('api_failure'),{tags:{status:String(status)}});
    after(async()=>{await logEvent('error','api_failure',{status});await Sentry.flush(2000);});
  }
  if(error instanceof ApiError)return NextResponse.json({error:error.message},{status:error.status});
  return NextResponse.json({error:'Impossible de terminer cette action. Réessayez ou contactez votre administrateur.'},{status:500});
}
export function databaseError(error:{message:string;code?:string}|null){if(error)throw new ApiError(error.code==='23503'?'Une relation est invalide ou encore utilisée.':error.code==='23505'?'Cet élément existe déjà.':error.code==='42501'?'Vous ne disposez pas des droits nécessaires.':'La modification n’a pas pu être enregistrée.',error.code==='42501'?403:400);}
