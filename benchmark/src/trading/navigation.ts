export const destinations={overview:'Overview',inventory:'Inventory',listings:'WTS listings',conversations:'Conversations',orders:'Orders & history',settings:'Settings & help'};
export const views=[...Object.keys(destinations),'items','reviews'] as const;
export function safeReturn(value:unknown):string {
 if(typeof value!=='string'||value.length>4096||!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x1f]/.test(value))return '/';
 const url=new URL(value,'http://local');
 if(url.origin!=='http://local'||url.pathname!=='/'||url.hash)return '/';
 const keys=['view','id','state','buyer','q','cursor','child','childCursor','chooseCursor','selected','back','limit','notice','confirm'];
 if([...url.searchParams.keys()].some(k=>!keys.includes(k)||url.searchParams.getAll(k).length!==1))return '/';
 if(url.searchParams.has('view')&&!views.includes(url.searchParams.get('view')!))return '/';
 return url.pathname+url.search;
}
