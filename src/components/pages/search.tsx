'use client';
import {useState} from 'react';
import {useRows} from '../data-provider';
import {PageHeader,SearchBox,Empty,Loading,Avatar} from '../ui';
import {RecordDetails} from './record-details';
import type {CrmRecord} from '@/lib/domain/types';
export function SearchPage(){const [term,setTerm]=useState('');const [selected,setSelected]=useState<CrmRecord|null>(null);const q=useRows<CrmRecord>('records',{q:term||undefined,size:100});return <><PageHeader title="Recherche" description="Retrouvez une fiche par nom, email ou contenu."/><div className="toolbar"><SearchBox value={term} onChange={setTerm}/></div>{q.isPending?<Loading/>:q.data?.data.length===0?<Empty title="Aucun résultat"/>:<div className="stack">{q.data?.data.map(r=><button className="detail-card search-result" key={r.id} onClick={()=>setSelected(r)}><span className="name-cell"><Avatar name={r.display_name}/><strong>{r.display_name}</strong></span><small>{r.email||r.domain}</small></button>)}</div>}{selected&&<RecordDetails record={selected} onClose={()=>setSelected(null)} onEdit={()=>{setSelected(null);window.location.assign('/app/companies');}}/>}</>;}
