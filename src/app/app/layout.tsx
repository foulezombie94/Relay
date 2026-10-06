import type {ReactNode} from 'react';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {db} from '@/lib/supabase/server';
import {AppProvider} from '@/components/data-provider';
import {Shell} from '@/components/shell';
export default async function AppLayout({children}:{children:ReactNode}){const client=await db();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');const jar=await cookies();const defaultOpen=jar.get('relay_sidebar_open')?.value!=='false';return <AppProvider><Shell defaultOpen={defaultOpen}>{children}</Shell></AppProvider>;}
