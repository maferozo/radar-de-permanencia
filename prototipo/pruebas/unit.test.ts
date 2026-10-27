// Pruebas unitarias de la lógica del prototipo. Ejecutar: npm run test:unit
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodificar, filtrar, kpis, porCohorte, validarCandidato, evaluar, burndown, estadoBurndown, dora, porGrupo, factores, motivos, contraste, reglasAlerta, costo, rankingFactores, PLAN, NOMBRE_VARIABLE, TODOS, Hechos, Coef, Candidato } from "../src/calc";

const RAIZ = join(new URL(".", import.meta.url).pathname, "..", "..");
const hechos = JSON.parse(readFileSync(join(RAIZ, "prototipo/src/data/hechos.json"), "utf8")) as Hechos;
const modelo = JSON.parse(readFileSync(join(RAIZ, "prototipo/src/data/modelo.json"), "utf8"));
const FILAS = decodificar(hechos);
const OPC = { campana: hechos.diccionarios.campana, turno: ["Mañana", "Tarde", "Noche", "Rotativo"], educacion: ["Bachiller", "Técnico", "Tecnólogo", "Profesional"], canal: ["Referido", "Portal de empleo", "Redes sociales", "Feria"] };
const BASE = { campana: OPC.campana[0], turno: "Noche", distancia: "18", experiencia: "0", educacion: "Bachiller", canal: "Portal de empleo", puntaje: "58" };
const res: { id: string; cu: string; nombre: string; entrada: string; esperado: string; observado: string; estado: string }[] = [];
function t(id: string, cu: string, nombre: string, entrada: string, esperado: string, fn: () => [boolean, string]) {
  let ok = false, obs = "";
  try { [ok, obs] = fn(); } catch (e) { obs = "Error: " + (e as Error).message; }
  res.push({ id, cu, nombre, entrada, esperado, observado: obs, estado: ok ? "Aprobada" : "Fallida" });
  console.log(ok ? "OK   " : "FALLA", id, nombre, "→", obs);
}

t("PU-01", "CU-01", "Tasa con cohortes de ventana completa", "Dataset demo completo", "Tasa = renuncias ÷ contratados solo con ventana observada", () => {
  const k = kpis(FILAS); const n = FILAS.filter(f => f.ventana).length; const r = FILAS.filter(f => f.ventana && f.renuncia).length;
  return [k.contratados === n && k.renuncias === r && Math.abs((k.tasa ?? 0) - r / n) < 1e-12 && k.excluidosSinVentana > 0, `${r}/${n} = ${(r / n * 100).toFixed(2)} %; ${k.excluidosSinVentana} excluidos sin ventana`];
});
t("PU-02", "CU-01", "Cohortes sin 180 días no aparecen en la tendencia", "Cohortes 2026-05 a 2026-09", "No se grafican", () => {
  const c = porCohorte(FILAS).map(x => x.cohorte); return [!c.some(x => x >= "2026-05"), `última cohorte graficada: ${c[c.length - 1]}`];
});
t("PU-03", "CU-02 (A1)", "Filtro sin registros", "Supervisor SUP-01 con campaña D · Retail", "0 personas → estado «sin datos»", () => {
  const f = filtrar(FILAS, { desde: "2024-07", hasta: "2026-04", campana: OPC.campana[3], supervisor: "SUP-01" }); const k = kpis(f);
  return [k.contratados === 0 && k.tasa === null, `contratados = ${k.contratados}; tasa = ${k.tasa}`];
});
t("PU-04", "CU-03 (A1)", "Grupo pequeño no se compara", "SUP-15 (n < 30)", "suficiente = false", () => {
  const g = porGrupo(FILAS, "supervisor", 30).grupos.find(x => x.grupo === "SUP-15")!; return [!g.suficiente, `SUP-15 n = ${g.n}; comparable = ${g.suficiente}`];
});
t("PU-05", "CU-04", "Resumen con 3 a 5 factores ordenados", "Dataset demo completo, mínimo 30", "Entre 3 y 5 factores en orden descendente de diferencia", () => {
  const f = factores(FILAS, 30); const ord = f.every((x, i) => i === 0 || f[i - 1].diferencia >= x.diferencia);
  return [f.length >= 3 && f.length <= 5 && ord, `${f.length} factores: ${f.map(x => `${x.grupo} (+${(x.diferencia * 100).toFixed(1)} p.p.)`).join("; ")}`];
});
t("PU-06", "CU-05 (A2)", "Puntaje de prueba superior a 100", "puntaje = 120", "Error de rango; no se calcula", () => {
  const e = validarCandidato({ ...BASE, puntaje: "120" }, OPC); return [e.length === 1 && e[0].includes("entre 0 y 100"), e.join(" | ")];
});
t("PU-07", "CU-05 (A1)", "Campos obligatorios vacíos", "turno y distancia vacíos", "Indica cuáles faltan", () => {
  const e = validarCandidato({ ...BASE, turno: "", distancia: "" }, OPC); return [e.length === 2 && e.every(x => x.startsWith("Falta")), e.join(" | ")];
});
t("PU-08", "CU-05 / HU-15", "Intento de introducir variables sensibles", "Entrada con edad, sexo y estrato", "Se rechazan con mensaje", () => {
  const e = validarCandidato({ ...BASE, edad: 25, sexo: "F", estrato: 2 }, OPC); return [e.filter(x => x.includes("sensible")).length === 3, `${e.length} errores: ${e[0]}`];
});
t("PU-09", "CU-05 / sec. 17", "Consistencia del semáforo Python vs. prototipo", "10 candidatos de prueba", "Diferencia de probabilidad < 1e-9", () => {
  const coefs = modelo.coeficientes as Coef[]; let max = 0;
  for (const c of modelo.consistencia) {
    const cand: Candidato = { campana: c.campana, turno: c.turno, distancia: c.distancia_km, experiencia: c.experiencia_previa_meses, educacion: c.nivel_educativo, canal: c.canal_reclutamiento, puntaje: c.puntaje_prueba_tecnica };
    max = Math.max(max, Math.abs(evaluar(cand, coefs, 0.47, 0.6).probabilidad - c.p_python));
  }
  return [max < 1e-9 && modelo.consistencia.length === 10, `diferencia máxima = ${max.toExponential(2)} en ${modelo.consistencia.length} candidatos`];
});
t("PU-10", "CU-06", "Explicación: 3 factores con signo", "Candidato de ejemplo", "3 contribuciones ordenadas por |β·x|", () => {
  const c: Candidato = { campana: OPC.campana[0], turno: "Noche", distancia: 18, experiencia: 0, educacion: "Bachiller", canal: "Portal de empleo", puntaje: 58 };
  const ev = evaluar(c, modelo.coeficientes, modelo.umbrales.amarillo, modelo.umbrales.rojo); const k = ev.contribuciones;
  return [k.length === 3 && Math.abs(k[0].c) >= Math.abs(k[1].c) && Math.abs(k[1].c) >= Math.abs(k[2].c), `${(ev.probabilidad * 100).toFixed(1)} % (${ev.color}); ${k.map(x => `${x.etiqueta} ${x.c > 0 ? "▲" : "▼"}`).join(", ")}`];
});
t("PU-11", "CU-05", "Umbrales configurables", "Mismo candidato con umbrales 0,90/0,95", "Cambia el color sin cambiar la probabilidad", () => {
  const c: Candidato = { campana: OPC.campana[0], turno: "Noche", distancia: 18, experiencia: 0, educacion: "Bachiller", canal: "Portal de empleo", puntaje: 58 };
  const a = evaluar(c, modelo.coeficientes, modelo.umbrales.amarillo, modelo.umbrales.rojo), b = evaluar(c, modelo.coeficientes, 0.9, 0.95);
  return [a.probabilidad === b.probabilidad && a.color !== b.color, `${a.color} → ${b.color}`];
});
t("PU-12", "Burndown", "Línea ideal y trabajo restante", "Sprint 1: 22 pts, registro de 0 aceptados al cierre", "Ideal de 22 a 0; real = 22; estado atrasado", () => {
  const s = burndown("2026-10-06", "2026-10-19", 22, [{ fecha: "2026-10-19", aceptados: 0, fuente: "" }]); const e = estadoBurndown(s);
  return [s[0].ideal === 22 && s[s.length - 1].ideal === 0 && s[s.length - 1].real === 22 && e.estado === "atrasado" && s.length === 10, `${s.length} días hábiles; ideal ${s[0].ideal}→${s[s.length - 1].ideal}; ${e.estado}`];
});
t("PU-13", "Burndown", "Sin registros no se inventa la línea real", "Sprint 3 sin registros", "real = null en todos los días; estado «sin datos»", () => {
  const s = burndown("2026-11-03", "2026-11-16", 26, []); return [s.every(p => p.real === null) && estadoBurndown(s).estado === "sin datos", "sin línea real"];
});
t("PU-14", "DORA", "Sin despliegues", "Registro vacío", "Todas las métricas nulas", () => {
  const d = dora([], "2026-09-21T00:00", "2026-11-16T23:59"); return [d.despliegues === 0 && d.frecuenciaSemanal === null && d.tasaFallos === null && d.mttrHoras === null, "Sin despliegues medidos"];
});
t("PU-15", "DORA", "Fórmulas con ejemplo", "2 despliegues, 1 con fallo de 2 h, en 2 semanas", "1/semana; 50 %; 2 h", () => {
  const d = dora([{ id: "1", cambio: "", inicioCambio: "2026-10-01T00:00", despliegue: "2026-10-02T00:00", exitoso: true, fallo: false, inicioIncidente: "", recuperacion: "" },
    { id: "2", cambio: "", inicioCambio: "2026-10-05T00:00", despliegue: "2026-10-06T00:00", exitoso: true, fallo: true, inicioIncidente: "2026-10-06T01:00", recuperacion: "2026-10-06T03:00" }], "2026-10-01T00:00", "2026-10-15T00:00");
  return [d.frecuenciaSemanal === 1 && d.tasaFallos === 50 && d.mttrHoras === 2 && d.leadTimeHoras === 24, `${d.frecuenciaSemanal}/sem; lead ${d.leadTimeHoras} h; fallos ${d.tasaFallos} %; MTTR ${d.mttrHoras} h`];
});
t("PU-16", "RF-18", "Sin datos identificables en el prototipo", "hechos.json", "No contiene id_empleado, nombre ni documento", () => {
  const raw = readFileSync(join(RAIZ, "prototipo/src/data/hechos.json"), "utf8"); const malos = ["id_empleado", "nombre", "documento", "EMP-", "SIM0"].filter(x => raw.includes(x));
  return [malos.length === 0, malos.length ? `encontrado: ${malos}` : "ninguna columna o valor identificable"];
});
t("PU-18", "CU-03 / HU-10", "Top 5 motivos y contraste", "Encuesta simulada", "5 motivos que suman ≤ 100 % y contraste por motivo", () => {
  const m = motivos(FILAS); const c = contraste(m, factores(FILAS, 30)); const s = m.reduce((a, x) => a + x.pct, 0);
  return [m.length === 5 && s <= 1.0000001 && c.length === 5 && c.some(x => x.tipo === "coincide"), m.map(x => `${x.motivo} ${(x.pct * 100).toFixed(1)} %`).join("; ")];
});
t("PU-19", "HU-05", "Costo = renuncias × costo por reemplazo", "780 renuncias × COP 2.550.000", "COP 1.989.000.000; sin supuestos = null", () => {
  const c = costo(780, { reclutamiento: 450000, formacion: 1200000, improductivo: 900000 }); return [c === 1989000000 && costo(780, null) === null, `${c?.toLocaleString("es-CO")}`];
});
t("PU-20", "CU-09 (A1) / 13.10", "Reglas del plan B", "Tres candidatos tipo", "rojo, amarillo y verde sin reglas duplicadas", () => {
  const base = { campana: OPC.campana[0], educacion: "Bachiller", canal: "Referido" };
  const a = reglasAlerta({ ...base, turno: "Noche", distancia: 18, experiencia: 0, puntaje: 58 }), b = reglasAlerta({ ...base, turno: "Mañana", distancia: 18, experiencia: 6, puntaje: 80 }), c = reglasAlerta({ ...base, turno: "Mañana", distancia: 5, experiencia: 6, puntaje: 80 });
  return [a.color === "rojo" && a.reglas.length === 2 && b.color === "amarillo" && c.color === "verde", `${a.color} (${a.reglas.length} reglas), ${b.color}, ${c.color}`];
});
t("PU-21", "CU-03", "Ranking de factores con diferencia y tamaño de grupo", "Dataset demo, mínimo 30", "Una fila por variable; prioritario > 5 p.p.; diferencia = tasa del grupo − promedio", () => {
  const r = rankingFactores(FILAS, 30); const k = kpis(FILAS);
  const ok = r.length === 8 && r.every(x => Math.abs(x.diferencia - (x.tasa - (k.tasa as number))) < 1e-12 && x.renuncias <= x.n) && r.filter(x => x.estado === "prioritario").every(x => x.diferencia > 0.05 && x.n >= 30);
  return [ok && r[0].estado === "prioritario", `${r.length} variables; 1.º ${NOMBRE_VARIABLE[r[0].variable]}: ${r[0].grupo} (+${(r[0].diferencia * 100).toFixed(1)} p.p.); ${r.filter(x => x.estado === "prioritario").length} prioritarios`];
});
t("PU-22", "CU-05 / 13.10", "Condiciones evaluadas y justificación de cada regla", "Candidato de ejemplo (18 km, Noche, 0 meses, 58)", "4 condiciones; cada regla activada con datos que la justifican y acción", () => {
  const a = reglasAlerta({ campana: OPC.campana[0], educacion: "Bachiller", canal: "Referido", turno: "Noche", distancia: 18, experiencia: 0, puntaje: 58 });
  const ok = a.condiciones.length === 4 && a.condiciones.every(c => c.cumple) && a.detalle.length === a.reglas.length && a.detalle.every(d => d.justificacion.length > 10 && d.accion.length > 10);
  return [ok, `${a.condiciones.filter(c => c.cumple).length} de 4 condiciones; ${a.detalle.map(d => d.justificacion).join(" | ")}`];
});
t("PU-23", "CU-04 / HU-11", "Plan de acción completo por factor", "Factores del resumen", "Cada factor tiene recomendación, responsable sugerido e indicador", () => {
  const f = factores(FILAS, 30); return [f.length >= 3 && f.every(x => x.recomendacion && PLAN[x.variable].responsable && PLAN[x.variable].indicador), `${f.length} factores con plan completo`];
});
const filtroTodos = filtrar(FILAS, { desde: "", hasta: "", campana: TODOS, supervisor: TODOS });
t("PU-17", "CU-02", "Limpiar filtros vuelve a la vista completa", "Filtros vacíos", "Mismo número de filas que el dataset", () => [filtroTodos.length === FILAS.length, `${filtroTodos.length} de ${FILAS.length}`]);

writeFileSync(join(RAIZ, "pruebas/resultados_unitarias.json"), JSON.stringify({ fecha: new Date().toISOString(), entorno: `Node ${process.version}`, resultados: res }, null, 1));
console.log(`\n${res.filter(r => r.estado === "Aprobada").length}/${res.length} aprobadas`);
process.exit(res.every(r => r.estado === "Aprobada") ? 0 : 1);
