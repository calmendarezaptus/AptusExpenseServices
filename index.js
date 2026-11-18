"use strict";
// Función del proyecto Gastos (Catalyst). La usan la captura y el calendario de gastos.
// Todo pasa por ReportesSandbox (core/PrebillApiClient); esta función no escribe en Books.
import express from 'express';
import dotenv from 'dotenv';
import GastoService from './services/GastoService.js';
import ReembolsoService from './services/ReembolsoService.js';
import { registerCatalogRoutes } from './core/catalogs.js';
import { sendError } from './core/http.js';

dotenv.config();

const app = express();
app.use(express.json());

const service = req => new GastoService(req.params.organizationId, { req });

app.post('/:organizationId/gastos', async (req, res) => {
    try { return res.status(201).json(await service(req).create(req.body)); }
    catch (error) { return sendError(res, error, 'Error interno guardando el gasto.'); }
});
app.get('/:organizationId/gastos/:gastoId', async (req, res) => {
    try { return res.json(await service(req).get(req.params.gastoId)); }
    catch (error) { return sendError(res, error, 'Error interno consultando el gasto.'); }
});
app.patch('/:organizationId/gastos/:gastoId', async (req, res) => {
    try { return res.json(await service(req).update(req.params.gastoId, req.body)); }
    catch (error) { return sendError(res, error, 'Error interno actualizando el gasto.'); }
});
app.delete('/:organizationId/gastos/:gastoId', async (req, res) => {
    try { return res.json(await service(req).remove(req.params.gastoId)); }
    catch (error) { return sendError(res, error, 'Error interno eliminando el gasto.'); }
});

// Reembolsos a abogados (independientes del cobro al cliente).
const reembolsos = req => new ReembolsoService(req.params.organizationId, { req });
app.post('/:organizationId/gastos/:gastoId/reembolso', async (req, res) => {
    try { return res.json(await reembolsos(req).marcar(req.params.gastoId, req.body)); }
    catch (error) { return sendError(res, error, 'Error interno marcando el reembolso.'); }
});
app.delete('/:organizationId/gastos/:gastoId/reembolso', async (req, res) => {
    try { return res.json(await reembolsos(req).deshacer(req.params.gastoId)); }
    catch (error) { return sendError(res, error, 'Error interno deshaciendo el reembolso.'); }
});

// Lecturas permitidas (GET /:organizationId/<catalogo>) y los filtros que se reenvían a la API.
export const CATALOGS = {
    clientes: [],
    proyectos: [],
    abogados: [],
    'categorias-gasto': ['todos'],
    gastos: ['proyecto_id', 'liberado', 'facturado', 'prebill_id', 'categoria_id', 'facturable', 'abogado_id', 'pagado_por', 'reembolso_estado'],
    reembolsos: [],
};
registerCatalogRoutes(app, CATALOGS);

// Sin `stage` a propósito: el calendario solo toma un 404 con `stage` como "el gasto ya no existe".
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada en expense_services.' }));

export default app;
