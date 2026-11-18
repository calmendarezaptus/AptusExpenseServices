import test from 'node:test';
import assert from 'node:assert/strict';
import ReembolsoService, { validateReembolso } from '../services/ReembolsoService.js';

function fixture(gastos) {
    const calls = [];
    const api = {
        async request(method, path, opts) {
            calls.push({ method, path, data: opts?.data });
            const m = path.match(/^\/gastos\/(\d+)$/);
            if (method === 'get' && m) return gastos[m[1]];
            return { id: 1, reembolso_estado: method === 'post' ? 'reembolsado' : 'pendiente' };
        },
    };
    return { service: new ReembolsoService('636939444', { api }), calls };
}
const writes = calls => calls.filter(c => c.method !== 'get');

test('validateReembolso: fecha opcional, real, no futura', () => {
    assert.deepEqual(validateReembolso({}), {});
    assert.deepEqual(validateReembolso(undefined), {});
    assert.deepEqual(validateReembolso({ fecha: '2026-11-18' }, '2026-11-18'), { fecha: '2026-11-18' });
    assert.throws(() => validateReembolso({ fecha: '2026-11-19' }, '2026-11-18'), /futura/);
    assert.throws(() => validateReembolso({ fecha: '2026-02-30' }), /válida/);
    assert.throws(() => validateReembolso({ fecha: '1999-12-31' }), /antigua/);
    assert.throws(() => validateReembolso([]), /JSON/);
});

test('marcar: solo gastos pagados por abogado y pendientes; nunca escribe si no procede', async () => {
    const { service, calls } = fixture({
        26: { id: 26, pagado_por: 'abogado', reembolso_estado: 'pendiente', status: 'facturado' },
        27: { id: 27, pagado_por: 'abogado', reembolso_estado: 'reembolsado', reembolsado_en: '2026-11-01' },
        28: { id: 28, pagado_por: 'despacho', reembolso_estado: null },
    });
    await assert.rejects(service.marcar('27', {}), e => e.status === 409 && /ya estaba reembolsado/.test(e.message));
    await assert.rejects(service.marcar('28', {}), e => e.status === 409 && /no lo pagó un abogado/.test(e.message));
    await assert.rejects(service.marcar('26', { fecha: '2999-01-01' }), e => e.status === 400);
    assert.equal(writes(calls).length, 0);
    await service.marcar('26', { fecha: '2026-11-10' });
    assert.deepEqual(writes(calls), [{ method: 'post', path: '/gastos/26/reembolso', data: { fecha: '2026-11-10' } }]);
});

test('deshacer: solo si está reembolsado', async () => {
    const { service, calls } = fixture({
        26: { id: 26, pagado_por: 'abogado', reembolso_estado: 'pendiente' },
        27: { id: 27, pagado_por: 'abogado', reembolso_estado: 'reembolsado' },
    });
    await assert.rejects(service.deshacer('26'), e => e.status === 409);
    await assert.rejects(service.deshacer('x'), e => e.status === 400);
    assert.equal(writes(calls).length, 0);
    await service.deshacer('27');
    assert.deepEqual(writes(calls).map(c => [c.method, c.path]), [['delete', '/gastos/27/reembolso']]);
});
