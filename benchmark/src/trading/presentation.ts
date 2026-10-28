export const labels:Record<string,string>={awaiting_payment:'Awaiting payment',paid:'Paid · awaiting completion',completed:'Completed',cancelled:'Cancelled',expired:'Expired',held:'Held · reserved for this buyer',released:'Released · backup may be promoted',committed:'Stock committed',primary:'Primary claim',backup:'Backup · no stock reserved',review:'Needs seller review',withdrawn:'Withdrawn',fulfilled:'Fulfilled',unfulfilled:'Unfulfilled · stock sold',proposed:'Proposed · not delivered',stale:'Stale · review before regenerating',delivered:'Delivered · receipt recorded',unverified:'Unverified · buyer evidence cannot confirm payment',seller_verified:'Manually verified by seller',unarranged:'Not arranged',arranged:'Arranged · handover not recorded',posted:'Posted · awaiting buyer receipt',dropped_off:'Dropped off · awaiting collection',collected:'Collected · handover recorded'};
export const label=(value:string)=>labels[value]??value.replaceAll('_',' ');
export function date(value:Date|string){return new Intl.DateTimeFormat('en-MY',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(value))+' MYT (UTC+08:00)';}
export function nextAction(order:Record<string,any>,hold:Record<string,any>){
 if(order.state==='completed')return 'Review the completed transaction and retained activity.';
 if(['expired','cancelled'].includes(order.state))return 'Inspect released stock and any promoted backup; do not verify this unpaid order.';
 if(order.state==='awaiting_payment'){
  if(hold.state!=='held'||new Date(hold.expires_at).getTime()<=Date.now())return 'Hold deadline passed. Refresh current state and inspect seller review before acting.';
  return order.total===null?'Agree the fulfilment fee before proposing payment instructions.':'Review payment instructions and interventions, then manually check actual receipt before verifying payment.';
 }
 if(order.fulfilment==='posted')return 'Record delivered only after actual buyer receipt.';
 if(order.fulfilment==='dropped_off')return 'Record collected only after actual buyer collection.';
 if(['collected','delivered'].includes(order.fulfilment))return 'Confirm actual receipt or handover, then complete the transaction.';
 return 'Save fulfilment arrangements and record the actual handover or dispatch.';
}
