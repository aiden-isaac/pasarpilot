import { escape as e,field,form,hidden,type Mutation,type View } from './server.js';
import { inventory,listing,item,type Card } from './catalog.js';
import { sen,integer,myr } from './values.js';
const cardFields=['name','printing','collector','language','finish','condition'] as const;
export const mutate:Mutation=async(w,path,f)=>{
 if(path==='/inventory') {
  const card=Object.fromEntries(cardFields.map(k=>[k,f.get(k)??''])) as Pick<Card,typeof cardFields[number]>;
  const stock=f.get('unsold')??''; if(!/^(0|[1-9]\d*)$/.test(stock)) throw Error('invalid-stock');
  await inventory(w,{...card,unsold:integer(Number(stock)),price:sen(f.get('price')??'')},f.get('id')||undefined,f.has('version')?Number(f.get('version')):undefined);return;
 }
 if(path==='/listing') { await listing(w,f.get('title')??'',f.get('id')||undefined,f.has('version')?Number(f.get('version')):undefined,f.get('open')!=='false');return; }
 if(path==='/item') { await item(w,f.get('listing_id')??'',f.get('inventory_id')??'',Number(f.get('offered')),f.get('id')||undefined,f.has('version')?Number(f.get('version')):undefined,f.get('open')!=='false');return; }
 throw Error('not-found');
};
export const view:View=async(w,csrf)=>{
 const rows=await w.rows('inventory'),posts=await w.rows('listings'),items=await w.rows('items');
 const select=(name:string,label:string,options:{id:string;name?:string;title?:string}[])=>`<label>${label} <select name="${name}">${options.map(o=>`<option value="${e(o.id)}">${e(o.name??o.title??o.id)}</option>`).join('')}</select></label>`;
 const listingHtml='<h2>Synthetic WTS listings</h2>'+form('/listing',csrf,field('title','Post title'),'Create WTS post')+posts.map(post=>`<article><h3>${e(post.title)} (${post.open?'Open':'Closed'})</h3>${form('/listing',csrf,hidden('id',post.id)+hidden('version',post.version)+field('title','Post title',post.title)+hidden('open',!post.open),'Toggle post open/closed')}${form('/item',csrf,hidden('listing_id',post.id)+select('inventory_id','Inventory variant',rows)+field('offered','Offered quantity',1,'number'),'Add mapped item comment')}<ol>${items.filter(i=>i.listing_id===post.id).map(i=>{const inv=rows.find(r=>r.id===i.inventory_id);return `<li>Item ${e(i.id)}: ${e(inv?.name)} ${e(inv?.finish)} / ${e(inv?.condition)} · ${myr(i.price)} · offered ${i.offered}, held/sold ${i.allocated}, available ${Math.min((inv?.unsold??0)-(inv?.reserved??0),i.offered-i.allocated)}${form('/item',csrf,hidden('id',i.id)+hidden('version',i.version)+hidden('listing_id',post.id)+hidden('inventory_id',i.inventory_id)+field('offered','Offered quantity',i.offered,'number')+`<label>Open <select name="open"><option value="true">Open</option><option value="false">Closed</option></select></label>`,'Save item')}</li>`;}).join('')}</ol></article>`).join('');
 const fields=(r:Record<string,unknown>)=>cardFields.map(k=>field(k,k,r[k]??({finish:'nonfoil',condition:'NM',language:'English'} as Record<string,string>)[k]??'')).join('')+field('unsold','Unsold quantity',r.unsold??1,'number')+field('price','MYR asking price',r.price===undefined?'10.00':myr(Number(r.price)).slice(2));
 return listingHtml+'<h2>Inventory</h2><p>Separate printings, finishes and conditions have separate stock. Prices are MYR.</p>'+form('/inventory',csrf,fields({}),'Add inventory')+
 rows.map(r=>`<article><h3>${e(r.name)} · ${e(r.finish)} / ${e(r.condition)}</h3><p>Unsold ${r.unsold}; reserved ${r.reserved}; available ${r.unsold-r.reserved}</p>${form('/inventory',csrf,hidden('id',r.id)+hidden('version',r.version)+fields(r),'Save inventory')}</article>`).join('');
};
