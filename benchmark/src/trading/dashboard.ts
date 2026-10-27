import { escape as e,field,form as postForm,hidden,type Mutation,type View } from './server.js';
import { inventory,listing,item,type Card } from './catalog.js';
import { sen,integer,myr,quantity } from './values.js';
import { instructions,terms,paymentDraft,confirmPayment } from './payments.js';
import { approve,regenerate } from './proposals.js';
import { policy } from './negotiation.js';
import { resolve,cancel,manualPromote } from './reviews.js';
import { extend,handle } from './stock.js';
import { arrange,fulfil,complete } from './fulfilment.js';
import { history,timeline,sharedInstructions } from './history.js';
import { queue } from './db.js';
import { intake,synthetic } from './intake.js';
import { processStream } from './consumer.js';
import { destinations,views,safeReturn } from './navigation.js';
import type { Page } from './paging.js';
import { label,date,nextAction } from './presentation.js';
const cardFields=['name','printing','collector','language','finish','condition'] as const;
const select=(name:string,label:string,choices:{id:string;label:string}[],value?:string)=>`<label>${e(label)} <select name="${name}">${choices.map(o=>`<option value="${e(o.id)}"${o.id===value?' selected':''}>${e(o.label)}</option>`).join('')}</select></label> `;
const options=(values:string[])=>values.map(id=>({id,label:id}));
const version=(r:Record<string,unknown>)=>hidden('id',r.id)+hidden('version',r.version);
export const mutate:Mutation=async(w,path,f)=>{
 const get=(k:string)=>f.get(k)??'',v=()=>integer(Number(get('version')),1);
 if(path==='/inventory') {
  const card=Object.fromEntries(cardFields.map(k=>[k,get(k)])) as Pick<Card,typeof cardFields[number]>;
  const stock=get('unsold');if(!/^(0|[1-9]\d*)$/.test(stock))throw Error('invalid-stock');
  const id=await inventory(w,{...card,unsold:integer(Number(stock)),price:sen(get('price'))},get('id')||undefined,f.has('version')?v():undefined);return `/?view=inventory&id=${encodeURIComponent(id)}`;
 }
 if(path==='/listing'){const id=await listing(w,get('title'),get('id')||undefined,f.has('version')?v():undefined,get('open')!=='false');return `/?view=listings&id=${encodeURIComponent(id)}`;}
 if(path==='/item'){const id=await item(w,get('listing_id'),get('inventory_id'),quantity(get('offered')),get('id')||undefined,f.has('version')?v():undefined,get('open')!=='false');return `/?view=items&id=${encodeURIComponent(id)}`;}
 if(path==='/policy'){await policy(w,get('id'),v(),get('minimum')===''?null:sen(get('minimum')));return;}
 if(path==='/instructions'){await instructions(w,v(),get('instructions'),get('approved')==='yes');return;}
 if(path==='/confirm-payment'){if(await confirmPayment(w,get('id'),v(),sen(get('amount')),get('trusted')==='yes')==='review')throw Error('review-payment-needs-reconciliation');return;}
 if(path==='/arrange'){await arrange(w,get('id'),v(),{location:get('location'),time:get('time'),recipient:get('recipient'),address:get('address'),tracking:get('tracking')});return;}
 if(path==='/fulfil'){await fulfil(w,get('id'),v(),get('status'),get('evidence'));return;}
 if(path==='/complete'){await complete(w,get('id'),v());return;}
 if(path==='/terms'){await terms(w,get('id'),v(),get('method') as 'collection',get('fee')===''?null:sen(get('fee')));return;}
 if(path==='/payment-draft'){await paymentDraft(w,get('id'),v());return;}
 if(path==='/regenerate'){await regenerate(w,get('id'),v(),get('reason'));return;}
 if(path==='/approve'){if(await approve(w,get('id'),v())==='stale')throw Error('stale-draft-refresh-and-regenerate');return;}
 if(path==='/cancel'){await cancel(w,get('id'),v(),get('reason'));return;}
 if(path==='/extend'){await extend(w,get('id'),v(),get('deadline'),get('reason'));return;}
 if(path==='/promote'){await manualPromote(w,get('id'),v(),get('reason'));return;}
 if(path==='/review'){
  if(!['claim','backup','associate','reject'].includes(get('action')))throw Error('invalid-review-action');
  await resolve(w,get('id'),v(),get('action') as 'claim',get('item'),get('buyer'),get('action')==='reject'?1:quantity(get('quantity')),get('reason'));return;
 }
 if(path==='/synthetic'){
  await w.get('items',get('item'));const mapping=(await w.p.query('SELECT * FROM trading.sources WHERE seller_id=$1',[w.seller])).rows[0];
  const pos=Number((await w.p.query('SELECT COALESCE(max(position),0)+1 AS n FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3',[w.seller,mapping.source,mapping.epoch])).rows[0].n);
  const ev={...synthetic({source:mapping.source,epoch:mapping.epoch},pos,get('item'),get('buyer'),get('text')),kind:get('kind') as 'reply'};
  await intake(w.p,queue(w.p),mapping.tenant,ev);await processStream(w.p,w.seller,mapping.source,mapping.epoch,handle);return;
 }
 throw Error('not-found');
};
export const view:View=async(w,csrf,url)=>{
 const param=(key:string)=>url.searchParams.get(key)??'';
 const section=param('view')||(param('order')?'orders':'overview'),selected=param('id')||param('order');
 if(!views.includes(section))throw Error('not-found');
 const current=safeReturn('/'+url.search),back=safeReturn(param('back')||`/?view=${section}`);
 const seller=(await w.p.query('SELECT login,display_name,profile_version,instructions,instructions_approved,instruction_version FROM trading.sellers WHERE id=$1',[w.seller])).rows[0];
 const href=(view:string,id='',extra:Record<string,string>={})=>'/?'+new URLSearchParams({view,...(id?{id}:{}),...extra});
 const link=(view:string,id:string,label:string,extra:Record<string,string>={})=>`<a href="${e(href(view,id,{back:current,...extra}))}">${e(label)}</a>`;
 const form=(path:string,token:string,body:string,button:string)=>postForm(path,token,hidden('return',current)+body,button);
 const pageInput=(key='cursor')=>({cursor:param(key)||undefined,limit:param('limit')?quantity(param('limit')):undefined});
 const pages=(page:Page,key='cursor')=>{
  const first=new URL(url);first.searchParams.delete(key);const next=new URL(first);
  if(page.next)next.searchParams.set(key,page.next);
  return `<nav aria-label="Page navigation">${param(key)?`<a href="${e('/'+first.search)}">Back to first page</a>`:''}${page.next?`<a href="${e('/'+next.search)}">Next page</a>`:''}</nav>`;
 };
 const empty=(rows:unknown[],text:string)=>rows.length?'':`<p class="empty">${e(text)}</p>`;
 const cardLabel=(c:Record<string,any>)=>`${c.name??'Variant'} · ${c.printing??''} ${c.collector??''} · ${c.finish??''} / ${c.condition??''}`;
 const cardInputs=(r:Record<string,unknown>)=>cardFields.map(k=>k==='finish'||k==='condition'?select(k,k,options(k==='finish'?['nonfoil','foil','etched','other']:['NM','LP','MP','HP','DMG']),String(r[k]??(k==='finish'?'nonfoil':'NM'))):field(k,k,r[k]??(k==='language'?'English':''))).join('')+field('unsold','Unsold quantity',r.unsold??1,'number')+field('price','MYR asking price',r.price===undefined?'10.00':myr(Number(r.price)).slice(2));
 const draftHtml=(d:Record<string,any>)=>`<article id="draft-${e(d.id)}"><h3>${e(d.kind)} · ${d.state==='delivered'?'Approved · Delivered to fixture (simulated)':e(label(d.state))}</h3><p>${e(d.text)}</p>${d.order_id?link('orders',d.order_id,'Open order'):link('conversations',d.conversation_id,'Open conversation')}${d.state==='proposed'?form('/approve',csrf,version(d),'Approve simulated delivery'):d.state==='stale'&&!['payment','offer'].includes(d.kind)?form('/regenerate',csrf,version(d)+field('reason','Regeneration reason'),'Regenerate current response'):''}</article>`;
 const orderRow=(o:Record<string,any>)=>`<article><h3>${link('orders',o.id,`${o.buyer} · ${o.agreement?.name??'Order'}`)}</h3><p>Order: ${e(label(o.state))}</p><p>Payment: ${e(label(o.payment))} · Fulfilment: ${e(label(o.fulfilment))}</p><p>${o.total===null?'Awaiting agreed fee':myr(o.total)} · ${e(o.quantity)} unit(s)</p></article>`;
 const tabs=(choices:string[],active:string)=>`<nav aria-label="Record details">${choices.map(child=>link(section,selected,child,{child})).join('')}</nav><h3>${e(active==='activity'?'Transaction activity':active==='instructions'?'Shared instruction snapshots':active==='drafts'?'Response proposals':label(active))}</h3>`;
 const searchForm=(label:string)=>`<form method="get">${hidden('view',section)}${selected?hidden('id',selected):''}<label>${e(label)} <input name="q" maxlength="100" value="${e(param('q'))}"></label><button>Search</button></form>`;
 const choose=async(table:'inventory'|'items')=>{
  const result=await w.select(table,param('q'),pageInput('chooseCursor'));
  const chosen=param('selected')?await w.get(table,param('selected')):undefined;
  return {chosen,html:searchForm(`Search ${table}`)+empty(result.rows,'No matching variants.')+`<ul>${result.rows.map(r=>`<li>${link(section,selected,cardLabel(r),{selected:r.id,q:param('q')})}</li>`).join('')}</ul>`+pages(result,'chooseCursor')};
 };
 let content='';
 if(section==='overview'){
  const [reviews,drafts,unpaid,paid,events]=await Promise.all([w.page('reviews',{resolved:'false'}),w.page('drafts',{state:'proposed'}),w.page('orders',{state:'awaiting_payment'}),w.page('orders',{state:'paid'}),w.page('activity',{limit:20})]);
  content=`<h2>Work needing attention</h2><p>${link('settings','','Set up your seller workspace')}</p><section><h3>Seller interventions</h3>${empty(reviews.rows,'No unresolved reviews.')}${reviews.rows.map(r=>`<p>${link('reviews',r.id,r.reason)}</p>`).join('')}<a href="/?view=reviews">All reviews</a></section><section><h3>Proposed responses</h3>${empty(drafts.rows,'No responses awaiting approval.')}${drafts.rows.map(draftHtml).join('')}<a href="/?view=conversations&child=drafts">All responses</a></section><section><h3>Awaiting payment confirmation</h3>${empty(unpaid.rows,'No orders awaiting payment.')}${unpaid.rows.map(orderRow).join('')}<a href="/?view=orders&state=awaiting_payment">All awaiting payment</a></section><section><h3>Paid · awaiting fulfilment or completion</h3>${empty(paid.rows,'No paid orders awaiting action.')}${paid.rows.map(orderRow).join('')}<a href="/?view=orders&state=paid">All paid orders</a></section><section><h3>Recent activity</h3>${empty(events.rows,'No recent activity.')}<ol>${events.rows.map(a=>`<li>${e(date(a.created_at))} · ${e(label(a.action))} · ${e(a.actor)}</li>`).join('')}</ol></section>`;
 }
 if(section==='inventory'){
  content='<h2>Inventory</h2><p>Available = unsold − reserved. Prices are MYR.</p>';
  if(selected){const c=await w.get('inventory',selected);content+=`<article id="inventory-${e(c.id)}"><h3>${e(cardLabel(c))}</h3><p>Unsold ${c.unsold}; reserved ${c.reserved}; available ${c.unsold-c.reserved}</p>${form('/inventory',csrf,version(c)+cardInputs(c),'Save inventory')}${form('/policy',csrf,version(c)+`<label>Private minimum MYR (blank disables negotiation) <input name="minimum" value="${c.minimum===null?'':myr(c.minimum).slice(2)}"></label>`,'Save negotiation policy')}</article>`;}
  else{const page=await w.select('inventory',param('q'),pageInput());content+=`<details><summary>Add inventory</summary>${form('/inventory',csrf,cardInputs({}),'Add inventory')}</details>${searchForm('Search inventory')}${empty(page.rows,'No inventory yet. Add your first variant.')}${page.rows.map(c=>`<article><h3>${link('inventory',c.id,cardLabel(c))}</h3><p>Available ${c.unsold-c.reserved} · reserved ${c.reserved} · unsold ${c.unsold} · ${myr(c.price)}</p></article>`).join('')}${pages(page)}`;}
 }
 if(section==='listings'){
  content='<h2>WTS listings</h2>';
  if(selected){const post=await w.get('listings',selected),items=await w.children('listings',selected,'items',pageInput('childCursor')),selection=await choose('inventory');content+=`<article id="listing-${e(post.id)}"><h3>${e(post.title)} (${post.open?'Open':'Closed'})</h3>${form('/listing',csrf,version(post)+field('title','Post title',post.title)+hidden('open',!post.open),'Toggle post open/closed')}<h3>Mapped item comments</h3>${empty(items.rows,'No mapped items yet.')}${items.rows.map(i=>`<p>${link('items',i.id,`Item · ${myr(i.price)} · offered ${i.offered}`)}</p>`).join('')}${pages(items,'childCursor')}<details${selection.chosen||param('q')?' open':''}><summary>Map inventory to this listing</summary>${selection.html}${selection.chosen?`<p>Selected: ${e(cardLabel(selection.chosen))}</p>${form('/item',csrf,hidden('listing_id',post.id)+hidden('inventory_id',selection.chosen.id)+field('offered','Offered quantity',1,'number'),'Add mapped item comment')}`:'<p>Search and select an owned inventory variant.</p>'}</details></article>`;}
  else{const page=await w.page('listings',pageInput());content+=form('/listing',csrf,field('title','Post title'),'Create WTS post')+empty(page.rows,'No WTS listings yet.')+page.rows.map(p=>`<article><h3>${link('listings',p.id,p.title)}</h3><p>${p.open?'Open':'Closed'}</p></article>`).join('')+pages(page);}
 }
 if(section==='items'){
  const i=await w.get('items',selected),card=await w.get('inventory',i.inventory_id),post=await w.get('listings',i.listing_id),child=param('child')||'claims';
  if(!['claims','orders','conversations'].includes(child))throw Error('invalid-detail');
  const page=await w.children('items',selected,child as 'claims',pageInput('childCursor'));
  content=`<h2>${e(cardLabel(card))}</h2><p>${link('inventory',card.id,'Inventory')} · ${link('listings',post.id,post.title)}</p><p>Offered ${i.offered} · held/sold ${i.allocated} · available ${Math.min(card.unsold-card.reserved,i.offered-i.allocated)} · ${myr(i.price)} · ${i.open?'Open':'Closed'}</p>${form('/item',csrf,version(i)+hidden('listing_id',post.id)+hidden('inventory_id',i.inventory_id)+field('offered','Offered quantity',i.offered,'number')+select('open','Status',options(['true','false']),String(i.open)),'Save item')}${tabs(['claims','orders','conversations'],child)}${empty(page.rows,'No activity for this item.')}${page.rows.map(r=>child==='orders'?orderRow(r):child==='conversations'?`<p>${link('conversations',r.id,r.buyer)}</p>`:`<article><h3>${e(r.buyer)} · ${e(label(r.state))}</h3><p>${r.quantity} unit(s) · source position ${r.position}${r.state==='backup'?` · backup position ${e(r.backup_rank)} · no reservation`:''}</p>${r.state==='primary'||r.state==='fulfilled'?link('orders',r.id,'Open order'):''}${r.state==='backup'?form('/promote',csrf,version(r)+field('reason','Promotion reason'),'Promote backup'):''}</article>`).join('')}${pages(page,'childCursor')}<details><summary>Simulate buyer activity</summary><p>Synthetic only. Exact grammar: claim [quantity], backup [quantity], or offer RM9.00.</p>${form('/synthetic',csrf,hidden('item',selected)+select('buyer','Synthetic buyer',options(['buyer-a','buyer-b']))+select('kind','Event kind',options(['reply','message','offer','payment_evidence']))+field('text','Buyer message','claim'),'Generate synthetic event')}</details>`;
 }
 if(section==='conversations'){
  content='<h2>Conversations</h2>';
  if(selected){const c=await w.get('conversations',selected),child=param('child')||'messages';if(!['messages','drafts','orders'].includes(child))throw Error('invalid-detail');const page=await w.children('conversations',selected,child as 'messages',pageInput('childCursor'));content+=`<article id="conversation-${e(c.id)}"><h3>${e(c.buyer)}</h3><p>${c.item_id?link('items',c.item_id,'Open item'):'Unassociated · inspect seller review'}</p>${tabs(['messages','drafts','orders'],child)}${empty(page.rows,'No records in this section.')}${page.rows.map(r=>child==='drafts'?draftHtml(r):child==='orders'?orderRow(r):`<p>${r.direction==='in'?'Synthetic buyer':'Approved · Delivered to fixture'} · ${e(r.created_at)}<br>${e(r.text)}</p>`).join('')}${pages(page,'childCursor')}</article>`;}
  else if(param('child')==='drafts'){const page=await w.page('drafts',pageInput());content+='<h3>Response proposals and simulated delivery</h3>'+empty(page.rows,'No responses.')+page.rows.map(draftHtml).join('')+pages(page);}
  else{const page=await w.page('conversations',pageInput());content+=empty(page.rows,'No buyer conversations yet.')+page.rows.map(c=>`<article><h3>${link('conversations',c.id,c.buyer)}</h3><p>${c.item_id?link('items',c.item_id,'Open item'):'Unassociated conversation'}</p></article>`).join('')+pages(page);}
 }
 if(section==='orders'){
  content='<h2>Orders & history</h2>';
  if(!selected){const page=await history(w,param('state'),param('buyer'),pageInput());content+=`<form method="get">${hidden('view','orders')}${select('state','Order state',[{id:'',label:'All states'},...options(['awaiting_payment','paid','completed','cancelled','expired'])],param('state'))}<label>Buyer actor <input name="buyer" maxlength="200" value="${e(param('buyer'))}"></label><button>Filter history</button></form>${empty(page.rows,'No matching orders.')}${page.rows.map(orderRow).join('')}${pages(page)}`;}
  else{const o=await w.get('orders',selected),hold=await w.get('reservations',selected),child=param('child')||'drafts';if(!['drafts','reviews','activity','instructions'].includes(child))throw Error('invalid-detail');
   const page=child==='activity'?await timeline(w,selected,pageInput('childCursor')):child==='instructions'?await sharedInstructions(w,selected,pageInput('childCursor')):await w.children('orders',selected,child as 'drafts',pageInput('childCursor'));
   content+=`<article id="order-${e(o.id)}"><h3>${e(o.buyer)} · ${e(o.agreement.name)} · ${e(label(o.state))}</h3><p>${myr(o.unit_price)} × ${o.quantity} · Total (MYR): ${o.total===null?'Awaiting agreed fee':myr(o.total)}</p><dl class="facts"><div><dt>Reservation</dt><dd>${e(label(hold.state))}</dd></div><div><dt>${hold.state==='held'?'Hold deadline':'Previous hold deadline'}</dt><dd>${e(date(hold.expires_at))}</dd></div><div><dt>Payment</dt><dd>${e(label(o.payment))}</dd></div><div><dt>Fulfilment</dt><dd>${e(label(o.fulfilment))}</dd></div></dl><p class="next-action"><strong>Next:</strong> ${e(nextAction(o,hold))}</p><p class="eyebrow">Current version ${o.version} · database rules rechecked on submission</p><p>${link('items',o.item_id,'WTS item')} · ${link('conversations',o.conversation_id,'Buyer conversation')}</p><details><summary>Agreement snapshot</summary><pre>${e(JSON.stringify(o.agreement,null,2))}</pre></details>${o.state==='awaiting_payment'?form('/terms',csrf,version(o)+select('method','Fulfilment method',options(['collection','cod','postage','drop_off']),o.arrangement?.method)+`<label>Agreed MYR fee (blank means unknown) <input name="fee" value="${o.fee===null?'':myr(o.fee).slice(2)}"></label>`,'Agree fulfilment fee')+form('/payment-draft',csrf,version(o),'Propose payment request')+form('/cancel',csrf,version(o)+field('reason','Cancellation reason'),'Cancel unpaid order')+form('/extend',csrf,version(o)+field('deadline','Future hold deadline (ISO timestamp)')+field('reason','Extension reason'),'Extend hold')+form('/confirm-payment',csrf,version(o)+field('amount','Exact received MYR amount',o.total===null?'':myr(o.total).slice(2))+'<label><input type="checkbox" name="trusted" value="yes" required> I checked actual receipt in the trusted account or received COD cash</label>','Confirm payment received'):''}${['awaiting_payment','paid'].includes(o.state)&&o.arrangement?.method?form('/arrange',csrf,version(o)+(o.arrangement.method==='postage'?field('recipient','Synthetic recipient',o.arrangement.recipient)+field('address','Synthetic address',o.arrangement.address)+field('tracking','Tracking reference',o.arrangement.tracking):field('location','Collection / COD / drop-off location',o.arrangement.location)+field('time','Meeting time (ISO timestamp)',o.arrangement.time)),'Save fulfilment details'):''}${o.state==='paid'?form('/fulfil',csrf,version(o)+select('status','Actual fulfilment progress',options(o.arrangement?.method==='postage'?['posted','delivered']:o.arrangement?.method==='drop_off'?['dropped_off','collected']:['collected']))+field('evidence','Actual handover / receipt evidence'),'Record actual fulfilment')+form('/complete',csrf,version(o),'Complete transaction'):''}${tabs(['drafts','reviews','activity','instructions'],child)}${empty(page.rows,'No records in this section.')}${page.rows.map(r=>child==='drafts'?draftHtml(r):child==='reviews'?`<p>${link('reviews',r.id,r.reason)} · ${r.resolved?'Resolved':'Needs seller review'}</p>`:child==='activity'?`<p>${e(date(r.created_at))} · ${e(r.actor)} · ${e(label(r.action))} · ${e(r.reason)}</p>`:`<details><summary>Simulated payment request · ${e(date(r.created_at))}</summary><pre>${e(JSON.stringify(r.instructions,null,2))}</pre></details>`).join('')}${pages(page,'childCursor')}</article>`;
  }
 }
 if(section==='reviews'){
  content='<h2>Seller reviews</h2>';
  if(selected){const r=await w.get('reviews',selected),source=r.source_id?(await w.p.query('SELECT envelope FROM trading.inbox WHERE seller_id=$1 AND id=$2',[w.seller,r.source_id])).rows[0]:undefined,selection=await choose('items');content+=`<article><h3>${e(r.reason)}</h3><p>${r.resolved?'Resolved':'Needs seller intervention'}</p>${r.order_id?link('orders',r.order_id,'Open affected order'):''}<details><summary>Inspect synthetic source</summary><pre>${e(JSON.stringify(source?.envelope??{},null,2))}</pre></details>${r.resolved?'':selection.html+form('/review',csrf,version(r)+select('action','Decision',options(['claim','backup','associate','reject']))+hidden('item',selection.chosen?.id??'')+`<p>Selected item: ${e(selection.chosen?cardLabel(selection.chosen):'None · rejection does not require an item')}</p>`+select('buyer','Confirmed buyer',options(['buyer-a','buyer-b']))+field('quantity','Confirmed quantity',1,'number')+field('reason','Review reason'),'Resolve review')}</article>`;}
  else{const page=await w.page('reviews',{...pageInput(),resolved:'false'});content+=empty(page.rows,'No unresolved reviews.')+page.rows.map(r=>`<p>${link('reviews',r.id,r.reason)}</p>`).join('')+pages(page);}
 }
 if(section==='settings')content=`<h2>Settings & help</h2><h3>Seller payment instructions</h3><p>Use synthetic payment details only. Configuration approval and delivery approval are separate actions.</p>${form('/instructions',csrf,hidden('version',seller.instruction_version)+field('instructions','Synthetic payment instructions',seller.instructions)+select('approved','Approved for sharing',options(['no','yes']),seller.instructions_approved?'yes':'no'),'Save instructions')}<p>Login: ${e(seller.login)}. Invited accounts are provisioned by the operator.</p>`;
 const active=section==='items'?'listings':section==='reviews'?'overview':section;
 return `<div class="workspace"><header class="workspace-header"><p class="eyebrow">Synthetic seller workspace</p><p>${e(seller.display_name)} · All outbound replies are simulated.</p></header><nav class="primary-nav" aria-label="Seller workspace">${Object.entries(destinations).map(([key,label])=>`<a href="${e(href(key))}"${key===active?' aria-current="page"':''}>${e(label)}</a>`).join(' ')}</nav><div class="workspace-content">${selected?`<a href="${e(back)}">Back to results</a>`:''}${content}</div></div>`;
};
