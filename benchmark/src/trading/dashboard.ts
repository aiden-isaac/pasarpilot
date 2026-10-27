import { escape as e,field,form,hidden,type Mutation,type View } from './server.js';
import { inventory,type Card } from './catalog.js';
import { sen,integer,myr } from './values.js';
const cardFields=['name','printing','collector','language','finish','condition'] as const;
export const mutate:Mutation=async(w,path,f)=>{
 if(path==='/inventory') {
  const card=Object.fromEntries(cardFields.map(k=>[k,f.get(k)??''])) as Pick<Card,typeof cardFields[number]>;
  const stock=f.get('unsold')??''; if(!/^(0|[1-9]\d*)$/.test(stock)) throw Error('invalid-stock');
  await inventory(w,{...card,unsold:integer(Number(stock)),price:sen(f.get('price')??'')},f.get('id')||undefined,f.has('version')?Number(f.get('version')):undefined);return;
 }
 throw Error('not-found');
};
export const view:View=async(w,csrf)=>{
 const rows=await w.rows('inventory');
 const fields=(r:Record<string,unknown>)=>cardFields.map(k=>field(k,k,r[k]??({finish:'nonfoil',condition:'NM',language:'English'} as Record<string,string>)[k]??'')).join('')+field('unsold','Unsold quantity',r.unsold??1,'number')+field('price','MYR asking price',r.price===undefined?'10.00':myr(Number(r.price)).slice(2));
 return '<h2>Inventory</h2><p>Separate printings, finishes and conditions have separate stock. Prices are MYR.</p>'+form('/inventory',csrf,fields({}),'Add inventory')+
 rows.map(r=>`<article><h3>${e(r.name)} · ${e(r.finish)} / ${e(r.condition)}</h3><p>Unsold ${r.unsold}; reserved ${r.reserved}; available ${r.unsold-r.reserved}</p>${form('/inventory',csrf,hidden('id',r.id)+hidden('version',r.version)+fields(r),'Save inventory')}</article>`).join('');
};
