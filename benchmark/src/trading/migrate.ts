import { checkSchema, queue, tx } from './db.js';
import type pg from 'pg';
export async function migrate(p: pg.Pool) {
  await tx(p, async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('trading-migration'))");
    const exists = (await c.query("SELECT to_regclass('trading.migrations') AS t")).rows[0].t;
    if (exists) { await checkSchema(p); return; }
    await c.query(`
CREATE SCHEMA trading;
CREATE TABLE trading.migrations(version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO trading.migrations VALUES(1);
CREATE TABLE trading.sellers(id text PRIMARY KEY, login text NOT NULL UNIQUE, password_hash text NOT NULL,
 instructions text NOT NULL DEFAULT '', instructions_approved boolean NOT NULL DEFAULT false, instruction_version int NOT NULL DEFAULT 1);
CREATE TABLE trading.sessions(hash text PRIMARY KEY, seller_id text NOT NULL REFERENCES trading.sellers, csrf text NOT NULL,
 expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false);
CREATE TABLE trading.login_limits(key text PRIMARY KEY, attempts int NOT NULL, until_at timestamptz NOT NULL);
CREATE TABLE trading.sources(tenant text PRIMARY KEY CHECK(tenant IN ('seller-a','seller-b','seller-c')), seller_id text NOT NULL REFERENCES trading.sellers,
 source text NOT NULL, epoch text NOT NULL, UNIQUE(seller_id,source,epoch));
CREATE TABLE trading.actors(seller_id text NOT NULL REFERENCES trading.sellers, id text NOT NULL, PRIMARY KEY(seller_id,id));
CREATE TABLE trading.inventory(seller_id text NOT NULL REFERENCES trading.sellers, id text NOT NULL, name text NOT NULL,
 printing text NOT NULL, collector text NOT NULL, language text NOT NULL, finish text NOT NULL, condition text NOT NULL,
 unsold int NOT NULL CHECK(unsold>=0), reserved int NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=unsold),
 price int NOT NULL CHECK(price>=0), minimum int CHECK(minimum>=0 AND minimum<=price), version int NOT NULL DEFAULT 1,
 PRIMARY KEY(seller_id,id));
CREATE TABLE trading.listings(seller_id text NOT NULL REFERENCES trading.sellers,id text NOT NULL,title text NOT NULL,
 open boolean NOT NULL DEFAULT true,version int NOT NULL DEFAULT 1, PRIMARY KEY(seller_id,id));
CREATE TABLE trading.items(seller_id text NOT NULL,id text NOT NULL,listing_id text NOT NULL,inventory_id text NOT NULL,
 offered int NOT NULL CHECK(offered>0),allocated int NOT NULL DEFAULT 0 CHECK(allocated>=0 AND allocated<=offered),
 price int NOT NULL CHECK(price>=0),open boolean NOT NULL DEFAULT true,version int NOT NULL DEFAULT 1,
 PRIMARY KEY(seller_id,id), FOREIGN KEY(seller_id,listing_id) REFERENCES trading.listings,
 FOREIGN KEY(seller_id,inventory_id) REFERENCES trading.inventory);
CREATE TABLE trading.streams(seller_id text NOT NULL,source text NOT NULL,epoch text NOT NULL,cursor int NOT NULL DEFAULT 0,
 PRIMARY KEY(seller_id,source,epoch),FOREIGN KEY(seller_id,source,epoch) REFERENCES trading.sources(seller_id,source,epoch));
CREATE TABLE trading.inbox(seller_id text NOT NULL, id text NOT NULL,source text NOT NULL,epoch text NOT NULL,event_id text NOT NULL,
 revision int NOT NULL CHECK(revision>0),position int CHECK(position>0),object_id text NOT NULL, envelope jsonb NOT NULL,hash text NOT NULL,
 result text NOT NULL DEFAULT 'pending', received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(seller_id,id),
 UNIQUE(seller_id,source,epoch,event_id,revision),FOREIGN KEY(seller_id,source,epoch) REFERENCES trading.sources(seller_id,source,epoch));
CREATE UNIQUE INDEX stream_position ON trading.inbox(seller_id,source,epoch,position) WHERE position IS NOT NULL;
CREATE TABLE trading.conflicts(seller_id text NOT NULL,id text NOT NULL,hash text NOT NULL,PRIMARY KEY(seller_id,id,hash),
 FOREIGN KEY(seller_id,id) REFERENCES trading.inbox);
CREATE TABLE trading.conversations(seller_id text NOT NULL,id text NOT NULL,buyer text NOT NULL,thread text NOT NULL,
 item_id text,PRIMARY KEY(seller_id,id),UNIQUE(seller_id,buyer,thread),FOREIGN KEY(seller_id,buyer) REFERENCES trading.actors,
 FOREIGN KEY(seller_id,item_id) REFERENCES trading.items);
CREATE TABLE trading.messages(seller_id text NOT NULL,id text NOT NULL,conversation_id text NOT NULL,text text NOT NULL,
 direction text NOT NULL CHECK(direction IN ('in','out')),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(seller_id,id),FOREIGN KEY(seller_id,conversation_id) REFERENCES trading.conversations);
CREATE TABLE trading.claims(seller_id text NOT NULL,id text NOT NULL,item_id text NOT NULL,buyer text NOT NULL,
 conversation_id text NOT NULL,quantity int NOT NULL CHECK(quantity>0),position int NOT NULL CHECK(position>0),
 state text NOT NULL CHECK(state IN ('primary','backup','review','withdrawn','fulfilled','unfulfilled','expired')),
 version int NOT NULL DEFAULT 1,PRIMARY KEY(seller_id,id),FOREIGN KEY(seller_id,item_id) REFERENCES trading.items,
 FOREIGN KEY(seller_id,buyer) REFERENCES trading.actors,FOREIGN KEY(seller_id,conversation_id) REFERENCES trading.conversations);
CREATE TABLE trading.orders(seller_id text NOT NULL,id text NOT NULL,claim_id text NOT NULL,item_id text NOT NULL,
 buyer text NOT NULL,conversation_id text NOT NULL,quantity int NOT NULL CHECK(quantity>0),unit_price int NOT NULL CHECK(unit_price>=0),
 agreement jsonb NOT NULL,fee int CHECK(fee>=0),total int CHECK(total>=0),
 state text NOT NULL DEFAULT 'awaiting_payment' CHECK(state IN ('awaiting_payment','paid','completed','cancelled','expired')),
 payment text NOT NULL DEFAULT 'unverified' CHECK(payment IN ('unverified','seller_verified')),
 fulfilment text NOT NULL DEFAULT 'unarranged' CHECK(fulfilment IN ('unarranged','arranged','posted','dropped_off','collected','delivered')),
 arrangement jsonb,verified_at timestamptz,version int NOT NULL DEFAULT 1,PRIMARY KEY(seller_id,id),UNIQUE(seller_id,claim_id),
 FOREIGN KEY(seller_id,claim_id) REFERENCES trading.claims,FOREIGN KEY(seller_id,item_id) REFERENCES trading.items,
 FOREIGN KEY(seller_id,buyer) REFERENCES trading.actors,FOREIGN KEY(seller_id,conversation_id) REFERENCES trading.conversations,
 CHECK(total IS NULL OR total=quantity::bigint*unit_price+fee));
CREATE UNIQUE INDEX active_buyer_item ON trading.orders(seller_id,item_id,buyer) WHERE state IN ('awaiting_payment','paid');
CREATE TABLE trading.reservations(seller_id text NOT NULL,id text NOT NULL,state text NOT NULL DEFAULT 'held'
 CHECK(state IN ('held','released','expired','committed')),expires_at timestamptz NOT NULL DEFAULT (now()+interval '15 minutes'),
 PRIMARY KEY(seller_id,id),FOREIGN KEY(seller_id,id) REFERENCES trading.orders);
CREATE TABLE trading.drafts(seller_id text NOT NULL,id text NOT NULL,conversation_id text NOT NULL,order_id text,item_id text,
 source_id text,kind text NOT NULL,text text NOT NULL,dependencies jsonb NOT NULL,version int NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','stale','delivered')),PRIMARY KEY(seller_id,id),
 FOREIGN KEY(seller_id,conversation_id) REFERENCES trading.conversations,FOREIGN KEY(seller_id,order_id) REFERENCES trading.orders,
 FOREIGN KEY(seller_id,item_id) REFERENCES trading.items,FOREIGN KEY(seller_id,source_id) REFERENCES trading.inbox);
CREATE TABLE trading.deliveries(seller_id text NOT NULL,id text NOT NULL,instructions jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(seller_id,id),FOREIGN KEY(seller_id,id) REFERENCES trading.drafts);
CREATE TABLE trading.reviews(seller_id text NOT NULL,id text NOT NULL,source_id text,order_id text,reason text NOT NULL,
 resolved boolean NOT NULL DEFAULT false,version int NOT NULL DEFAULT 1,PRIMARY KEY(seller_id,id),
 FOREIGN KEY(seller_id,source_id) REFERENCES trading.inbox,FOREIGN KEY(seller_id,order_id) REFERENCES trading.orders);
CREATE TABLE trading.activity(seller_id text NOT NULL REFERENCES trading.sellers,id bigint GENERATED ALWAYS AS IDENTITY,
 action text NOT NULL,record_id text NOT NULL,version int NOT NULL,actor text NOT NULL,reason text NOT NULL,source_id text,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(seller_id,id));
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='trading_runtime') THEN CREATE ROLE trading_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END $$;
GRANT USAGE ON SCHEMA trading TO trading_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA trading TO trading_runtime;
REVOKE UPDATE,DELETE ON trading.activity,trading.migrations FROM trading_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA trading TO trading_runtime;
CREATE SCHEMA IF NOT EXISTS trading_queue AUTHORIZATION trading_runtime;
`);
  });
  const b = queue(p); try { await b.start(); for (const name of ['inbox','expiry']) await b.createQueue(name); }
  finally { await b.stop(); }
  await p.query('GRANT USAGE ON SCHEMA trading_queue TO trading_runtime; GRANT ALL ON ALL TABLES IN SCHEMA trading_queue TO trading_runtime; GRANT ALL ON ALL SEQUENCES IN SCHEMA trading_queue TO trading_runtime');
}
