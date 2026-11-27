import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { FieldCipher } from './field-cipher.js';
import { storage } from './fields.js';

type Bag = Record<string, any>;
const object = (v: unknown): v is Bag =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const pkOf = (model: string) =>
  storage[model]?.pk.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const bulk = new Set(['updateMany', 'updateManyAndReturn']);
const aggregates = new Set(['count', 'aggregate', 'groupBy']);

export function encryptedClient(client: PrismaClient, cipher: FieldCipher) {
  const runtime = client as unknown as {
    _runtimeDataModel: {
      models: Record<
        string,
        { fields: { name: string; kind: string; type: string }[] }
      >;
    };
    _createItxClient(transaction: unknown): PrismaClient;
  };
  const relations = Object.fromEntries(
    Object.entries(runtime._runtimeDataModel.models).map(([model, info]) => [
      model,
      Object.fromEntries(
        info.fields
          .filter((f) => f.kind === 'object')
          .map((f) => [f.name, f.type]),
      ),
    ]),
  );

  function where(model: string, input: any): any {
    if (Array.isArray(input)) return input.map((v) => where(model, v));
    if (!object(input)) return input;
    const output: Bag = {};
    for (const [k, v] of Object.entries(input)) {
      const field = storage[model]?.fields[k];
      if (field && v != null) {
        const plain = object(v) ? v.equals : v;
        if (
          !field.index ||
          typeof plain !== 'string' ||
          (object(v) &&
            Object.keys(v).some((key) => !['equals', 'mode'].includes(key)))
        )
          throw new Error(
            'Unsupported encrypted field predicate: ' + model + '.' + k,
          );
        output[k + 'Index'] = cipher.index(model + '.' + k, plain);
      } else if (relations[model][k]) output[k] = where(relations[model][k], v);
      else if (
        ['AND', 'OR', 'NOT', 'is', 'isNot', 'every', 'some', 'none'].includes(k)
      )
        output[k] = where(model, v);
      else output[k] = v;
    }
    return output;
  }

  function guard(model: string, value: any, operation: string) {
    if (Array.isArray(value)) {
      for (const item of value) guard(model, item, operation);
      return;
    }
    const keys = typeof value === 'string' ? [value] : Object.keys(value ?? {});
    for (const key of keys) {
      if (
        storage[model]?.fields[key] ||
        (key.endsWith('Index') &&
          storage[model]?.fields[key.slice(0, -5)]?.index)
      )
        throw new Error(
          operation + ' cannot use encrypted field ' + model + '.' + key,
        );
      if (relations[model][key])
        guard(relations[model][key], value[key], operation);
      else if (
        object(value) &&
        (key.startsWith('_') || ['AND', 'OR', 'NOT'].includes(key))
      )
        guard(model, value[key], operation);
    }
  }

  function projection(model: string, args: Bag): Bag {
    const out = { ...args };
    for (const key of [
      'orderBy',
      'distinct',
      'by',
      'having',
      '_min',
      '_max',
      '_avg',
      '_sum',
      '_count',
    ])
      if (args[key]) guard(model, args[key], key);
    if (args.where) out.where = where(model, args.where);
    if (args.cursor) out.cursor = where(model, args.cursor);
    const pk = pkOf(model);
    for (const key of ['select', 'include'])
      if (object(args[key])) {
        const selection = { ...args[key] };
        for (const [name, child] of Object.entries(selection))
          if (relations[model][name] && object(child))
            selection[name] = projection(relations[model][name], child);
        if (
          key === 'select' &&
          pk &&
          Object.keys(storage[model].fields).some((f) => selection[f] === true)
        )
          selection[pk] = true;
        out[key] = selection;
      }
    if (pk && args.omit?.[pk]) out.omit = { ...args.omit, [pk]: false };
    return out;
  }

  function reveal(model: string, value: any, args: Bag): any {
    if (Array.isArray(value)) return value.map((v) => reveal(model, v, args));
    if (!object(value)) return value;
    const pk = pkOf(model),
      out: Bag = { ...value };
    for (const [key, v] of Object.entries(value)) {
      if (storage[model]?.fields[key] && v != null)
        out[key] = cipher.decrypt(model + '.' + key, value[pk], v);
      else if (
        key.endsWith('Index') &&
        storage[model]?.fields[key.slice(0, -5)]?.index
      )
        delete out[key];
      else if (relations[model][key])
        out[key] = reveal(
          relations[model][key],
          v,
          args.select?.[key] ?? args.include?.[key] ?? {},
        );
    }
    if (pk && ((args.select && !args.select[pk]) || args.omit?.[pk]))
      delete out[pk];
    return out;
  }

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations(call) {
          const { model, operation, query } = call;
          const args = call.args as Bag;
          if (operation === 'count' && args.select)
            guard(model, args.select, 'count');
          const transaction = (
            call as unknown as {
              __internalParams: { transaction?: { kind: string } };
            }
          ).__internalParams.transaction;
          const db =
            transaction?.kind === 'itx'
              ? runtime._createItxClient(transaction)
              : client;
          async function reserve(m: string) {
            const spec = storage[m];
            if (
              runtime._runtimeDataModel.models[m].fields.find(
                (f) => f.name === pkOf(m),
              )?.type === 'String'
            )
              return randomUUID();
            if (transaction?.kind === 'batch')
              throw new Error(
                'Use an interactive transaction to allocate encrypted row IDs',
              );
            const [row] = await db.$queryRaw<
              { id: number }[]
            >`SELECT nextval(pg_get_serial_sequence(${'public.' + spec.table}, ${spec.pk}))::integer AS id`;
            return row.id;
          }

          async function data(
            m: string,
            input: Bag,
            create: boolean,
            row?: number | string,
          ): Promise<Bag> {
            const out = { ...input },
              pk = pkOf(m);
            const needsId = Object.keys(input).some(
              (k) => storage[m]?.fields[k] && input[k] !== undefined,
            );
            if (!create && pk && pk in input)
              throw new Error('Encrypted row identities are immutable');
            if (create && needsId) {
              row = input[pk] ?? (await reserve(m));
              out[pk] = row;
            }
            if (needsId && row == null)
              throw new Error(
                'Encrypted writes require a single primary key for ' + m,
              );
            for (const [key, val] of Object.entries(input)) {
              const field = storage[m]?.fields[key];
              if (
                key.endsWith('Index') &&
                storage[m]?.fields[key.slice(0, -5)]?.index
              )
                throw new Error('Direct blind index write');
              if (field && val !== undefined) {
                const plain =
                  !field.json && object(val) && 'set' in val ? val.set : val;
                out[key] =
                  plain === null && !field.json
                    ? null
                    : cipher.encrypt(m + '.' + key, row!, plain);
                if (field.index)
                  out[key + 'Index'] =
                    plain === null ? null : cipher.index(m + '.' + key, plain);
              } else if (relations[m][key] && val) {
                const child = relations[m][key],
                  nested: Bag = {};
                for (const [op, arg] of Object.entries(val as Bag)) {
                  const handle = async (a: any) => {
                    if (op === 'create') return data(child, a, true);
                    if (op === 'createMany')
                      return {
                        ...a,
                        data: await map(a.data, (v) => data(child, v, true)),
                      };
                    if (op === 'connectOrCreate')
                      return {
                        ...a,
                        where: where(child, a.where),
                        create: await data(child, a.create, true),
                      };
                    if (op === 'update' && !a.data)
                      return data(child, a, false);
                    if (['update', 'upsert', 'updateMany'].includes(op))
                      return write(child, op, a);
                    if (
                      [
                        'connect',
                        'set',
                        'disconnect',
                        'delete',
                        'deleteMany',
                      ].includes(op)
                    )
                      return where(child, a);
                    throw new Error(
                      'Unsupported nested encrypted write: ' + op,
                    );
                  };
                  nested[op] = await map(arg, handle);
                }
                out[key] = nested;
              }
            }
            return out;
          }
          async function map(input: any, fn: (v: any) => Promise<any>) {
            if (!Array.isArray(input)) return fn(input);
            const values = [];
            for (const item of input) values.push(await fn(item));
            return values;
          }
          async function write(
            m: string,
            op: string,
            input: Bag,
          ): Promise<Bag> {
            const out = projection(m, input),
              pk = pkOf(m);
            if (op === 'create' || op.startsWith('createMany'))
              out.data = await map(input.data, (v) => data(m, v, true));
            if (op === 'upsert') out.create = await data(m, input.create, true);
            if (op === 'update' || op === 'upsert' || bulk.has(op)) {
              const key = op === 'upsert' ? 'update' : 'data',
                payload = input[key];
              let id = out.where?.[pk];
              if (typeof id !== 'string' && typeof id !== 'number')
                id = undefined;
              if (
                Object.keys(payload).some((k) => storage[m]?.fields[k]) &&
                id == null
              ) {
                if (
                  bulk.has(op) ||
                  !input.where ||
                  transaction?.kind === 'batch'
                )
                  throw new Error(
                    'Encrypted updates require a single primary key for ' + m,
                  );
                const delegate = (db as unknown as Bag)[
                  m[0].toLowerCase() + m.slice(1)
                ];
                const found = await delegate.findUnique({
                  where: out.where,
                  select: { [pk]: true },
                });
                id = found?.[pk] ?? out.create?.[pk];
                if (id == null) throw new Error('Encrypted target row missing');
                out.where = { ...out.where, [pk]: id };
              }
              out[key] = await data(m, payload, false, id);
            }
            return out;
          }
          const result = await query(
            (await write(model, operation, args)) as typeof call.args,
          );
          return aggregates.has(operation) ||
            ['updateMany', 'deleteMany', 'createMany'].includes(operation)
            ? result
            : reveal(model, result, args);
        },
      },
    },
  });
}
