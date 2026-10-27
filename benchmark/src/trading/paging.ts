import type pg from 'pg';
export type PageInput={limit?:number;cursor?:string};
export type Page={rows:pg.QueryResultRow[];next?:string};
// SQL and ordering come only from application-owned queries; cursors never grant scope.
export async function readPage(p:pg.Pool,sql:string,values:unknown[],scope:string,input:PageInput={},order:'id'|'time'|'activity'='id'):Promise<Page>{
 const limit=input.limit??25;
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('invalid-page-size');
 const args=[...values];let after='';
 const desc=order!=='id',timed=order==='time';
 if(input.cursor!==undefined){
  const raw=input.cursor;
  if(typeof raw!=='string'||raw.length>2048||!raw||!/^[A-Za-z0-9_-]+$/.test(raw))throw Error('invalid-cursor');
  let cursor:unknown;try{cursor=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));}catch{throw Error('invalid-cursor');}
  if(!Array.isArray(cursor)||cursor.length!==(timed?3:2)||cursor[0]!==scope||typeof cursor[1]!=='string'||!cursor[1]||cursor[1].length>200)throw Error('invalid-cursor');
  if(order==='activity'&&(!/^[1-9]\d{0,18}$/.test(cursor[1])||BigInt(cursor[1])>9223372036854775807n))throw Error('invalid-cursor');
  args.push(cursor[1]);const id=`$${args.length}`;
  if(timed){
   if(typeof cursor[2]!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(cursor[2])||!Number.isFinite(Date.parse(cursor[2])))throw Error('invalid-cursor');
   args.push(cursor[2]);after=` AND (created_at,id)<($${args.length}::timestamptz,${id})`;
  }else after=` AND id${desc?'<':'>'}${id}`;
 }
 args.push(limit+1);
 const query=`SELECT page_source.*${timed?`,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS page_time`:''} FROM (${sql}) page_source WHERE true${after} ORDER BY ${timed?'created_at DESC,':''}id ${desc?'DESC':'ASC'} LIMIT $${args.length}`;
 const result=(await p.query(query,args)).rows,hasMore=result.length>limit;
 const rows=result.slice(0,limit),last=rows.at(-1);
 const next=hasMore?Buffer.from(JSON.stringify([scope,String(last!.id),...(timed?[last!.page_time]:[])])).toString('base64url'):undefined;
 return {rows:rows.map(({page_time,...row})=>row),next};
}
