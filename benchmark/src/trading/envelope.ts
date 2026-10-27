import { integer,text } from './values.js';
export type Envelope={version:1;source:string;epoch:string;event:string;object:string;revision:number;position:number|null;
 kind:'reply'|'message'|'offer'|'payment_evidence';actor:string;post:string|null;item:string|null;parent:string|null;thread:string;sourceTime:string;text:string;deleted:boolean};
export function envelope(value:unknown):Envelope {
 if(!value || typeof value!=='object') throw Error('invalid-event');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['version','source','epoch','event','object','revision','position','kind','actor','post','item','parent','thread','sourceTime','text','deleted'].includes(k))) throw Error('invalid-event-fields');
 if(v.version!==1||!['reply','message','offer','payment_evidence'].includes(String(v.kind))||typeof v.deleted!=='boolean') throw Error('invalid-envelope');
 const nullable=(n:unknown)=>n===null?null:text(n);
 if(typeof v.sourceTime!=='string'||v.sourceTime.length>40||!Number.isFinite(Date.parse(v.sourceTime))) throw Error('invalid-source-time');
 return {version:1,source:text(v.source),epoch:text(v.epoch),event:text(v.event),object:text(v.object),revision:integer(v.revision,1),
 position:v.position===null?null:integer(v.position,1),kind:v.kind as Envelope['kind'],actor:text(v.actor),post:nullable(v.post),item:nullable(v.item),parent:nullable(v.parent),thread:text(v.thread),sourceTime:v.sourceTime,text:text(v.text,4000),deleted:v.deleted};
}
