import test from 'node:test';
import assert from 'node:assert/strict';
import app, { CATALOGS } from '../index.js';

// Sin red: sin contexto de Catalyst la conexión falla antes de salir, y debe responder 503 en JSON.
test('rutas: catálogos permitidos, el resto 404 y sin conexión 503', async () => {
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const original = console.error; console.error = () => {};
    try {
        let r = await fetch(`${base}/636939444/prebills`);
        assert.equal(r.status, 404);
        r = await fetch(`${base}/636939444/a/b/c`);
        assert.equal(r.status, 404); assert.equal((await r.json()).stage, undefined);
        r = await fetch(`${base}/abc/clientes`);
        assert.equal(r.status, 400);
        for (const catalog of Object.keys(CATALOGS)) {
            r = await fetch(`${base}/636939444/${catalog}`);
            assert.equal(r.status, 503, catalog);
            assert.equal((await r.json()).stage, 'connection');
        }
        const send = (method, path, body) => fetch(`${base}/636939444${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
        assert.equal((await send('POST', '/gastos/26/reembolso', { fecha: '2999-01-01' })).status, 400);
        assert.equal((await send('POST', '/gastos/x/reembolso', {})).status, 400);
        assert.equal((await send('POST', '/gastos/26/reembolso', {})).status, 503);
        assert.equal((await send('DELETE', '/gastos/26/reembolso')).status, 503);
        assert.equal((await send('PATCH', '/gastos/26/reembolso', {})).status, 404);
    } finally { server.close(); console.error = original; }
});
