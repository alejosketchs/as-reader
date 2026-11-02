// Ejecutar con: node --test lib/auth.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOwnerRequest } from './auth.js';

const resp = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });

test('sin Authorization no pasa (ni siquiera pregunta a la base)', async () => {
  let llamado = false;
  assert.equal(await isOwnerRequest({ headers: {} }, async () => { llamado = true; }), false);
  assert.equal(llamado, false);
});

test('token que la base rechaza no pasa', async () => {
  assert.equal(await isOwnerRequest({ headers: { authorization: 'Bearer x' } }, resp(401, {})), false);
});

test('sesión sin permiso de dueño (RLS devuelve vacío) no pasa', async () => {
  assert.equal(await isOwnerRequest({ headers: { authorization: 'Bearer x' } }, resp(200, [])), false);
});

test('dueño con sesión pasa', async () => {
  assert.equal(await isOwnerRequest({ headers: { authorization: 'Bearer x' } }, resp(200, [{ id: 'a' }])), true);
});

test('error de red no pasa', async () => {
  assert.equal(await isOwnerRequest({ headers: { authorization: 'Bearer x' } }, async () => { throw new Error('red'); }), false);
});
