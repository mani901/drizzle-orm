import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { datetime, int as mysqlInt, mysqlTable, timestamp as mysqlTimestamp } from '~/mysql-core';
import { date, integer as pgInteger, pgTable, timestamp } from '~/pg-core';
import { drizzle } from '~/postgres-js';
import { datetime as ssDatetime, int as ssInt, singlestoreTable, timestamp as ssTimestamp } from '~/singlestore-core';
import { eq } from '~/sql';
import { integer, sqliteTable } from '~/sqlite-core';

// Regression tests for https://github.com/drizzle-team/drizzle-orm/issues/6725
// Date/timestamp columns in `mode: 'date'` crashed with
// `TypeError: value.toISOString is not a function` when a value arrived as an
// ISO string (e.g. spread from an API payload into `.set()`), because
// `mapToDriverValue` assumed a `Date`. A string must map to exactly the same
// driver value as the equivalent `Date`.

const iso = '2024-01-02T03:04:05.000Z';
const asDate = new Date(iso);

const pgUsers = pgTable('pg_users', {
	id: pgInteger('id').primaryKey(),
	createdAt: timestamp('created_at'),
	bornOn: date('born_on', { mode: 'date' }),
});

const mysqlUsers = mysqlTable('mysql_users', {
	id: mysqlInt('id').primaryKey(),
	createdAt: datetime('created_at'),
	updatedAt: mysqlTimestamp('updated_at'),
});

const ssUsers = singlestoreTable('ss_users', {
	id: ssInt('id').primaryKey(),
	createdAt: ssDatetime('created_at'),
	updatedAt: ssTimestamp('updated_at'),
});

const sqliteUsers = sqliteTable('sqlite_users', {
	id: integer('id').primaryKey(),
	createdAt: integer('created_at', { mode: 'timestamp' }),
	createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }),
});

describe('date columns mapToDriverValue accepts ISO strings', () => {
	it('pg timestamp', ({ expect }) => {
		expect(pgUsers.createdAt.mapToDriverValue(iso)).toEqual(pgUsers.createdAt.mapToDriverValue(asDate));
	});

	it('pg date', ({ expect }) => {
		expect(pgUsers.bornOn.mapToDriverValue(iso)).toEqual(pgUsers.bornOn.mapToDriverValue(asDate));
	});

	it('mysql datetime', ({ expect }) => {
		expect(mysqlUsers.createdAt.mapToDriverValue(iso)).toEqual(
			mysqlUsers.createdAt.mapToDriverValue(asDate),
		);
	});

	it('mysql timestamp', ({ expect }) => {
		expect(mysqlUsers.updatedAt.mapToDriverValue(iso)).toEqual(
			mysqlUsers.updatedAt.mapToDriverValue(asDate),
		);
	});

	it('singlestore datetime', ({ expect }) => {
		expect(ssUsers.createdAt.mapToDriverValue(iso)).toEqual(ssUsers.createdAt.mapToDriverValue(asDate));
	});

	it('singlestore timestamp', ({ expect }) => {
		expect(ssUsers.updatedAt.mapToDriverValue(iso)).toEqual(ssUsers.updatedAt.mapToDriverValue(asDate));
	});

	it('sqlite integer timestamp (seconds)', ({ expect }) => {
		expect(sqliteUsers.createdAt.mapToDriverValue(iso)).toEqual(
			sqliteUsers.createdAt.mapToDriverValue(asDate),
		);
	});

	it('sqlite integer timestamp_ms (milliseconds)', ({ expect }) => {
		expect(sqliteUsers.createdAtMs.mapToDriverValue(iso)).toEqual(
			sqliteUsers.createdAtMs.mapToDriverValue(asDate),
		);
	});
});

describe('issue #6725: .set() spread with an ISO-string date', () => {
	it('pg update with spread data does not throw and maps the string date', ({ expect }) => {
		const db = drizzle(postgres(''), { schema: { pgUsers } });
		// Mirrors the reported case: data spread from an API payload carries the
		// timestamp as an ISO string, while another field is set with a Date.
		const data = { createdAt: iso };
		const query = db
			.update(pgUsers)
			.set({ ...data, bornOn: asDate })
			.where(eq(pgUsers.id, 1));

		expect(query.toSQL()).toEqual({
			sql: 'update "pg_users" set "created_at" = $1, "born_on" = $2 where "pg_users"."id" = $3',
			params: [iso, iso, 1],
		});
	});
});
