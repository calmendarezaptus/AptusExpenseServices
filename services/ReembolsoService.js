import PrebillApiClient from '../core/PrebillApiClient.js';
import { GastoError } from './GastoService.js';

// Reembolsos a abogados: gastos que pagó un abogado de su bolsa. Marcar el reembolso es independiente
// del cobro al cliente (funciona aunque el gasto ya esté en una Prebill o facturado).
// Todo en ReportesSandbox; NO escribe en Books.
const orgId = value => typeof value === 'string' && /^\d{1,20}$/.test(value);
const idParam = value => typeof value === 'string' && /^\d{1,12}$/.test(value);
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

// Fecha del reembolso: opcional (la API usa hoy). No se aceptan fechas futuras ni muy antiguas.
export function validateReembolso(body, hoy = new Date().toISOString().slice(0, 10)) {
    if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) throw new GastoError('Se requiere un objeto JSON.');
    const fecha = body?.fecha;
    if (fecha === undefined || fecha === null || fecha === '') return {};
    if (!isDate(fecha)) throw new GastoError('fecha debe ser una fecha válida YYYY-MM-DD.');
    if (fecha > hoy) throw new GastoError('La fecha del reembolso no puede ser futura.');
    if (fecha < '2000-01-01') throw new GastoError('La fecha del reembolso es demasiado antigua.');
    return { fecha };
}

const unexpected = what => Object.assign(new GastoError(`El servicio de Aptus devolvió ${what} con formato inesperado.`, 502), { stage: 'response', outcome_unknown: true });

export default class ReembolsoService {
    constructor(organizationId, { api = null, req = null } = {}) {
        if (!orgId(organizationId)) throw new GastoError('Organización inválida.');
        this.api = api ?? new PrebillApiClient(organizationId, { req });
    }

    async gasto(id) {
        if (!idParam(id)) throw new GastoError('ID de gasto inválido.');
        const data = await this.api.request('get', '/gastos/' + id, { stage: 'get_gasto' });
        if (!data || !Number.isInteger(data.id)) throw unexpected('un gasto');
        if (data.pagado_por !== 'abogado') throw Object.assign(new GastoError('Este gasto no lo pagó un abogado: no lleva reembolso.', 409), { stage: 'reembolso' });
        return data;
    }

    // Se revisa antes para dar un mensaje claro y no escribir si no procede.
    async marcar(id, body) {
        const payload = validateReembolso(body);
        const g = await this.gasto(id);
        if (g.reembolso_estado === 'reembolsado') throw Object.assign(new GastoError(`El gasto #${g.id} ya estaba reembolsado${g.reembolsado_en ? ` (${g.reembolsado_en})` : ''}.`, 409), { stage: 'reembolso' });
        const data = await this.api.request('post', `/gastos/${id}/reembolso`, { data: payload, stage: 'marcar_reembolso' });
        if (!data || typeof data !== 'object') throw unexpected('el reembolso');
        return data;
    }

    async deshacer(id) {
        const g = await this.gasto(id);
        if (g.reembolso_estado !== 'reembolsado') throw Object.assign(new GastoError(`El gasto #${g.id} no está reembolsado.`, 409), { stage: 'reembolso' });
        const data = await this.api.request('delete', `/gastos/${id}/reembolso`, { stage: 'deshacer_reembolso' });
        if (!data || typeof data !== 'object') throw unexpected('el reembolso');
        return data;
    }
}
