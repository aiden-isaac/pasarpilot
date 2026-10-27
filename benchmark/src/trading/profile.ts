import { tx,activity } from './db.js';
import { Workspace } from './workspace.js';
import { text,integer } from './values.js';
export async function profile(w:Workspace,version:number,name:string){
 name=text(name,80);integer(version,1);
 if(/[<>\x00-\x1f\x7f]/.test(name))throw Error('invalid-display-name');
 await tx(w.p,async c=>{
  const result=await c.query('UPDATE trading.sellers SET display_name=$3,profile_version=profile_version+1 WHERE id=$1 AND profile_version=$2 RETURNING profile_version',[w.seller,version,name]);
  if(!result.rowCount)throw Error('stale-profile');
  await activity(c,w.seller,'profile_saved',w.seller,result.rows[0].profile_version);
 });
}
