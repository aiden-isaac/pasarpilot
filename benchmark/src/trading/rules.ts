import { myr,integer } from './values.js';
export type ResponseKind='claim'|'backup'|'clarification'|'availability'|'price'|'payment'|'fulfilment';
export function response(kind:ResponseKind,ctx:{quantity?:number;amount?:number;instructions?:string;status?:string}={}) {
 switch(kind) {
 case 'claim':return `Your claim for ${integer(ctx.quantity,1)} is held for 15 minutes, subject to seller confirmation.`;
 case 'backup':return `Your request for ${integer(ctx.quantity,1)} is queued as backup; no stock is reserved.`;
 case 'clarification':return 'Please clarify the item and quantity. The seller will review; no stock is reserved.';
 case 'availability':return `${integer(ctx.quantity)} available at present; a message alone does not reserve stock.`;
 case 'price':return `The proposed unit price is ${myr(integer(ctx.amount))}. Seller approval is required.`;
 case 'payment':if(!ctx.instructions) throw Error('instructions-required');return `Please pay ${myr(integer(ctx.amount))}. ${ctx.instructions} Payment remains unverified until the seller checks receipt.`;
 case 'fulfilment':if(!['arranged','posted','dropped_off','collected','delivered'].includes(ctx.status??'')) throw Error('fulfilment-review-required');return `Fulfilment recorded: ${ctx.status}.`;
 default:throw Error('unsupported-context-review-required');
 }
}
