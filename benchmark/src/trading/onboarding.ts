import { Workspace } from './workspace.js';
export async function onboarding(w:Workspace){
 const row=(await w.p.query(`SELECT profile_version>1 AS profile,
  instructions_approved AND instructions<>'' AS instructions,
  EXISTS(SELECT 1 FROM trading.inventory WHERE seller_id=$1) AS inventory,
  EXISTS(SELECT 1 FROM trading.listings WHERE seller_id=$1) AS listing,
  EXISTS(SELECT 1 FROM trading.items i JOIN trading.listings l ON(l.seller_id=i.seller_id AND l.id=i.listing_id)
   JOIN trading.inventory v ON(v.seller_id=i.seller_id AND v.id=i.inventory_id) WHERE i.seller_id=$1) AS mapping,
  (SELECT id FROM trading.listings WHERE seller_id=$1 ORDER BY id LIMIT 1) AS listing_id
  FROM trading.sellers WHERE id=$1`,[w.seller])).rows[0];
 if(!row)throw Error('not-found');
 return [
  {label:'Sign in with your invitation',done:true,href:'/?view=settings'},
  {label:'Save your display profile',done:row.profile,href:'/?view=settings#profile'},
  {label:'Add your first inventory variant',done:row.inventory,href:'/?view=inventory'},
  {label:'Create a WTS listing',done:row.listing,href:'/?view=listings'},
  {label:'Map inventory and offered quantity',done:row.mapping,href:row.listing_id?'/?view=listings&id='+encodeURIComponent(row.listing_id):'/?view=listings'},
  {label:'Configure and explicitly approve synthetic payment instructions',done:row.instructions,href:'/?view=settings#instructions'}
 ];
}
