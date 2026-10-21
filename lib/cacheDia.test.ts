import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  paradasDelDia,
  asignacionesDeLocal,
  asignacionesPendientesDeLocal,
  asignacionDeLocal,
  type DiaData,
} from './cacheDia.ts';
import type { Parada } from './ruta.ts';

function parada(campos: Partial<Parada> = {}): Parada {
  return {
    id_asignacion: '',
    comercio: '',
    mall_puerta: '',
    direccion: '',
    distrito: '',
    motivo: 'Visita',
    status: 'Pendiente',
    indicaciones: '',
    hora: '',
    hora_fin: '',
    estado: '',
    meet_link: '',
    id_local: '',
    ...campos,
  };
}

function dia(pendientes: Parada[], completadas: Parada[] = []): DiaData {
  return {
    fecha: '20/10/2026',
    pendientes,
    completadas,
    total: pendientes.length + completadas.length,
  };
}

// El caso real: Asics en C.C. Plaza San Miguel está asignado dos veces hoy.
const ASICS = 'CC-0456';
const brandingAsics = parada({
  id_asignacion: 'ASG-BRAND',
  id_local: ASICS,
  comercio: 'Asics',
  motivo: 'Branding',
  hora: '11:00',
});
const virtualAsics = parada({
  id_asignacion: 'ASG-VIRT',
  id_local: ASICS,
  comercio: 'Asics',
  motivo: 'Capacitación Virtual',
  hora: '09:00',
});
const otroLocal = parada({
  id_asignacion: 'ASG-TAMBO',
  id_local: 'PC-0001',
  comercio: 'Tambo+',
  hora: '10:00',
});

describe('dos asignaciones del mismo local en un día', () => {
  const d = dia([brandingAsics, virtualAsics, otroLocal]);

  test('las devuelve las dos', () => {
    const todas = asignacionesDeLocal(d, ASICS);
    assert.equal(todas.length, 2);
    assert.deepEqual(
      todas.map((p) => p.id_asignacion).sort(),
      ['ASG-BRAND', 'ASG-VIRT'],
    );
  });

  test('las ordena por hora, no en el orden de la hoja', () => {
    // En la hoja viene antes Branding (11:00) que la virtual (09:00).
    const todas = asignacionesDeLocal(d, ASICS);
    assert.deepEqual(todas.map((p) => p.hora), ['09:00', '11:00']);
  });

  test('las dos siguen pendientes', () => {
    assert.equal(asignacionesPendientesDeLocal(d, ASICS).length, 2);
  });

  // Este es el error que se corrige: antes elegía la primera en silencio
  // y el resultado acababa en la fila equivocada.
  test('no elige ninguna a ciegas: devuelve null para que se pregunte', () => {
    assert.equal(asignacionDeLocal(d, ASICS), null);
  });

  test('no mezcla las de otros locales', () => {
    const otras = asignacionesDeLocal(d, 'PC-0001');
    assert.equal(otras.length, 1);
    assert.equal(otras[0].id_asignacion, 'ASG-TAMBO');
  });
});

describe('una sola asignación pendiente', () => {
  const d = dia([otroLocal]);

  test('se usa automáticamente, sin preguntar', () => {
    const elegida = asignacionDeLocal(d, 'PC-0001');
    assert.ok(elegida);
    assert.equal(elegida.id_asignacion, 'ASG-TAMBO');
  });
});

describe('asignaciones ya completadas', () => {
  const hecha = parada({
    ...brandingAsics,
    status: 'Completado',
    resultado: 'Todo Ok',
  });

  test('se listan, para poder verlas en el detalle', () => {
    const d = dia([], [hecha]);
    assert.equal(asignacionesDeLocal(d, ASICS).length, 1);
  });

  // Reengancharla sobrescribiría su resultado: la segunda visita va suelta.
  test('no cuentan como pendientes ni se eligen', () => {
    const d = dia([], [hecha]);
    assert.deepEqual(asignacionesPendientesDeLocal(d, ASICS), []);
    assert.equal(asignacionDeLocal(d, ASICS), null);
  });

  test('con una hecha y una pendiente, se elige la pendiente', () => {
    const d = dia([virtualAsics], [hecha]);
    assert.equal(asignacionesDeLocal(d, ASICS).length, 2);
    const elegida = asignacionDeLocal(d, ASICS);
    assert.ok(elegida);
    assert.equal(elegida.id_asignacion, 'ASG-VIRT');
  });

  test('reconoce "Completada" en femenino', () => {
    const femenino = parada({ ...brandingAsics, status: 'Completada' });
    const d = dia([], [femenino]);
    assert.deepEqual(asignacionesPendientesDeLocal(d, ASICS), []);
  });
});

describe('local que no está en la ruta', () => {
  const d = dia([otroLocal]);

  test('todo vacío', () => {
    assert.deepEqual(asignacionesDeLocal(d, 'PC-9999'), []);
    assert.deepEqual(asignacionesPendientesDeLocal(d, 'PC-9999'), []);
    assert.equal(asignacionDeLocal(d, 'PC-9999'), null);
  });

  test('sin id_local no busca nada', () => {
    assert.deepEqual(asignacionesDeLocal(d, ''), []);
    assert.equal(asignacionDeLocal(d, ''), null);
  });

  test('sin datos del día tampoco falla', () => {
    assert.deepEqual(asignacionesDeLocal(null, ASICS), []);
    assert.equal(asignacionDeLocal(null, ASICS), null);
    assert.deepEqual(paradasDelDia(null), []);
  });
});

describe('comparación del id_local', () => {
  const d = dia([otroLocal]);

  test('ignora mayúsculas y espacios', () => {
    assert.equal(asignacionesDeLocal(d, 'pc-0001').length, 1);
    assert.equal(asignacionesDeLocal(d, '  PC-0001  ').length, 1);
  });

  test('también si la hoja trae el id con espacios', () => {
    const sucio = dia([parada({ id_local: ' cc-0456 ', id_asignacion: 'ASG-X' })]);
    assert.equal(asignacionesDeLocal(sucio, ASICS).length, 1);
  });
});

describe('paradasDelDia', () => {
  test('junta pendientes y completadas', () => {
    const d = dia([virtualAsics], [parada({ id_asignacion: 'ASG-Z', status: 'Completado' })]);
    assert.equal(paradasDelDia(d).length, 2);
  });
});
