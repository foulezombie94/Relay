import {db} from '@/lib/supabase/server';
import {redirect} from 'next/navigation';
import {PortalList} from '@/components/portal-client';
export default async function PortalIndex(){const client=await db();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');return <PortalList/>;}
