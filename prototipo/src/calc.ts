// Radar de permanencia · lógica de cálculo (funciones puras, sin DOM).
// Implementa las fórmulas de la sección 14.2 y 13.7-13.10 del documento técnico.

export interface Fila {
  cohorte: string; campana: string; turno: string; supervisor: string;
  distancia: number | null; experiencia: number | null; educacion: string; canal: string;
  puntaje: number | null; rangoPuntaje: string; rangoDistancia: string; rangoExperiencia: string;
  ventana: boolean; renuncia: 0 | 1; despido: 0 | 1; mesRetiro: number | null; motivo: string;
}

export interface Hechos {
  fecha_corte: string; n: number;
  columnas: Record<string, (number | null)[]>; diccionarios: Record<string, string[]>;
}

export function decodificar(h: Hechos): Fila[] {
  const c = h.columnas, d = h.diccionarios;
  const cat = (k: string, i: number) => d[k][c[k][i] as number];
  const filas: Fila[] = [];
  for (let i = 0; i < h.n; i++) {
    filas.push({
      cohorte: cat("cohorte_ingreso", i), campana: cat("campana", i), turno: cat("turno", i), supervisor: cat("id_supervisor", i),
      distancia: c.distancia_km[i], experiencia: c.experiencia_previa_meses[i], educacion: cat("nivel_educativo", i),
      canal: cat("canal_reclutamiento", i), puntaje: c.puntaje_prueba_tecnica[i], rangoPuntaje: cat("rango_puntaje", i),
      rangoDistancia: cat("rango_distancia", i), rangoExperiencia: cat("rango_experiencia", i),
      ventana: cat("ventana_observada", i) === "True", renuncia: c.renuncia_temprana[i] as 0 | 1,
      despido: c.despido_temprano[i] as 0 | 1, mesRetiro: c.mes_antiguedad_retiro[i], motivo: cat("motivo_retiro", i),
    });
  }
  return filas;
}

// ---------------- Filtros (CU-02) ----------------
export interface Filtros { desde: string; hasta: string; campana: string; supervisor: string }
export const TODOS = "Todos";
export function filtrar(filas: Fila[], f: Filtros): Fila[] {
  return filas.filter(r =>
    (!f.desde || r.cohorte >= f.desde) && (!f.hasta || r.cohorte <= f.hasta) &&
    (f.campana === TODOS || r.campana === f.campana) && (f.supervisor === TODOS || r.supervisor === f.supervisor));
}

// ---------------- Indicadores (14.2) ----------------
export interface Kpis { contratados: number; renuncias: number; tasa: number | null; mesCritico: number | null; despidos: number; excluidosSinVentana: number }
export function kpis(filas: Fila[]): Kpis {
  let n = 0, r = 0, d = 0, sin = 0; const meses = [0, 0, 0, 0, 0, 0];
  for (const x of filas) {
    if (!x.ventana) { sin++; continue; }
    n++; r += x.renuncia; d += x.despido;
    if (x.renuncia && x.mesRetiro) meses[x.mesRetiro - 1]++;
  }
  const max = Math.max(...meses);
  return { contratados: n, renuncias: r, tasa: n ? r / n : null, mesCritico: r ? meses.indexOf(max) + 1 : null, despidos: d, excluidosSinVentana: sin };
}

export interface PuntoCohorte { cohorte: string; contratados: number; renuncias: number; tasa: number }
export function porCohorte(filas: Fila[]): PuntoCohorte[] {
  const m = new Map<string, { n: number; r: number }>();
  for (const x of filas) {
    if (!x.ventana) continue;
    const o = m.get(x.cohorte) ?? { n: 0, r: 0 }; o.n++; o.r += x.renuncia; m.set(x.cohorte, o);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cohorte, o]) => ({ cohorte, contratados: o.n, renuncias: o.r, tasa: o.r / o.n }));
}

export function porMesAntiguedad(filas: Fila[]): { mes: number; renuncias: number; pct: number }[] {
  const meses = [0, 0, 0, 0, 0, 0]; let t = 0;
  for (const x of filas) if (x.ventana && x.renuncia && x.mesRetiro) { meses[x.mesRetiro - 1]++; t++; }
  return meses.map((v, i) => ({ mes: i + 1, renuncias: v, pct: t ? v / t : 0 }));
}

// ---------------- Tasas por grupo (HU-07 a HU-09) ----------------
export type Variable = "supervisor" | "rangoPuntaje" | "rangoDistancia" | "turno" | "rangoExperiencia" | "educacion" | "canal" | "campana";
export const NOMBRE_VARIABLE: Record<Variable, string> = {
  supervisor: "Supervisor", rangoPuntaje: "Puntaje de la prueba técnica", rangoDistancia: "Distancia vivienda–trabajo",
  turno: "Turno", rangoExperiencia: "Experiencia previa", educacion: "Nivel educativo", canal: "Canal de reclutamiento", campana: "Campaña",
};
export const ORDEN: Partial<Record<Variable, string[]>> = {
  rangoPuntaje: ["0–59", "60–69", "70–79", "80–89", "90–100", "Sin dato"],
  rangoDistancia: ["< 5 km", "5–10 km", "10–15 km", "> 15 km"],
  rangoExperiencia: ["Sin experiencia", "1–12 meses", "> 12 meses", "Sin dato"],
  turno: ["Mañana", "Tarde", "Noche", "Rotativo"],
  educacion: ["Bachiller", "Técnico", "Tecnólogo", "Profesional"],
};
export interface Grupo { grupo: string; n: number; renuncias: number; tasa: number; diferencia: number; suficiente: boolean }
export function porGrupo(filas: Fila[], v: Variable, nMin: number): { grupos: Grupo[]; general: number | null } {
  const m = new Map<string, { n: number; r: number }>(); let n = 0, r = 0;
  for (const x of filas) {
    if (!x.ventana) continue;
    const k = x[v] as string; const o = m.get(k) ?? { n: 0, r: 0 }; o.n++; o.r += x.renuncia; m.set(k, o); n++; r += x.renuncia;
  }
  const general = n ? r / n : null;
  const orden = ORDEN[v];
  const grupos = [...m.entries()].map(([grupo, o]) => ({
    grupo, n: o.n, renuncias: o.r, tasa: o.r / o.n, diferencia: general === null ? 0 : o.r / o.n - general, suficiente: o.n >= nMin,
  }));
  grupos.sort((a, b) => orden ? orden.indexOf(a.grupo) - orden.indexOf(b.grupo) : a.grupo.localeCompare(b.grupo));
  return { grupos, general };
}

// Prueba de dos proporciones (z) para la conclusión de la prueba técnica (HU-08)
const c1 = (x: number, d = 1) => x.toFixed(d).replace(".", ",");
const pv = (p: number) => p < 0.001 ? "p < 0,001" : `p = ${c1(p, 3)}`;
export function zDosProporciones(r1: number, n1: number, r2: number, n2: number): { z: number; p: number } {
  const p1 = r1 / n1, p2 = r2 / n2, p = (r1 + r2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return { z: 0, p: 1 };
  const z = (p1 - p2) / se;
  return { z, p: 2 * (1 - normCdf(Math.abs(z))) };
}
function normCdf(x: number): number { // Abramowitz-Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * x), d = 0.3989423 * Math.exp(-x * x / 2);
  return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
}
export type Conclusion = "útil" | "no útil" | "evidencia insuficiente";
export function conclusionPrueba(grupos: Grupo[], nMin: number): { conclusion: Conclusion; detalle: string } {
  const g = grupos.filter(x => x.grupo !== "Sin dato");
  const bajo = g[0], alto = g[g.length - 1];
  if (!bajo || !alto || bajo.n < nMin || alto.n < nMin)
    return { conclusion: "evidencia insuficiente", detalle: `Los rangos extremos no alcanzan el mínimo de ${nMin} personas.` };
  const { p } = zDosProporciones(bajo.renuncias, bajo.n, alto.renuncias, alto.n);
  const dif = (bajo.tasa - alto.tasa) * 100;
  if (p < 0.05 && dif > 0)
    return { conclusion: "útil", detalle: `Quienes obtienen ${bajo.grupo} renuncian ${c1(dif)} p.p. más que quienes obtienen ${alto.grupo} (${pv(p)}). La prueba se asocia con la permanencia.` };
  if (p >= 0.05 && bajo.n >= 3 * nMin && alto.n >= 3 * nMin)
    return { conclusion: "no útil", detalle: `No hay diferencia estadísticamente significativa entre ${bajo.grupo} y ${alto.grupo} (${pv(p)}).` };
  return { conclusion: "evidencia insuficiente", detalle: `La diferencia entre rangos extremos no es concluyente (${pv(p)}).` };
}

// ---------------- Resumen de factores (HU-11, CU-04) ----------------
export const VARIABLES_RESUMEN: Variable[] = ["supervisor", "rangoDistancia", "turno", "rangoExperiencia", "rangoPuntaje", "canal", "campana", "educacion"];
export const RECOMENDACION: Record<Variable, string> = {
  supervisor: "Acompañar y capacitar en liderazgo de equipos nuevos al supervisor; revisar carga y prácticas de inducción de su grupo.",
  rangoDistancia: "Informar el auxilio de transporte desde la entrevista y priorizar la asignación de turnos compatibles con el desplazamiento.",
  turno: "Revisar las condiciones del turno (rotación, transporte nocturno) y explicarlas con claridad antes de la contratación.",
  rangoExperiencia: "Reforzar la inducción y asignar un compañero mentor durante los primeros 60 días para personas sin experiencia.",
  rangoPuntaje: "Ofrecer formación de nivelación a quienes obtienen puntajes bajos y revisar si la prueba mide lo que exige el puesto.",
  canal: "Revisar la calidad del canal de reclutamiento y reforzar los canales con mejor permanencia, como los referidos.",
  campana: "Revisar con la operación las condiciones específicas de la campaña (metas, carga, horarios).",
  educacion: "Ajustar la inducción y el acompañamiento al nivel de formación de las personas que ingresan.",
};
export interface Factor { variable: Variable; grupo: string; n: number; tasa: number; general: number; diferencia: number; interpretacion: string; recomendacion: string }
export function factores(filas: Fila[], nMin: number, max = 5): Factor[] {
  const out: Factor[] = [];
  for (const v of VARIABLES_RESUMEN) {
    const { grupos, general } = porGrupo(filas, v, nMin);
    if (general === null) continue;
    const peor = grupos.filter(g => g.suficiente && g.grupo !== "Sin dato").sort((a, b) => b.diferencia - a.diferencia)[0];
    if (!peor || peor.diferencia <= 0.02) continue; // solo diferencias de al menos 2 p.p.
    out.push({
      variable: v, grupo: peor.grupo, n: peor.n, tasa: peor.tasa, general, diferencia: peor.diferencia,
      interpretacion: `De cada 100 personas del grupo «${peor.grupo}», ${Math.round(peor.tasa * 100)} renunciaron antes de seis meses, frente a ${Math.round(general * 100)} en promedio. Es una relación observada, no una causa demostrada.`,
      recomendacion: RECOMENDACION[v],
    });
  }
  return out.sort((a, b) => b.diferencia - a.diferencia).slice(0, max);
}

// Ranking de factores para Causas: grupo con mayor diferencia de cada variable, incluidos los no concluyentes
export interface FilaRanking { variable: Variable; grupo: string; n: number; renuncias: number; tasa: number; general: number; diferencia: number; estado: "prioritario" | "leve" | "no comparable" | "sin diferencia"; advertencia: string }
export function rankingFactores(filas: Fila[], nMin: number): FilaRanking[] {
  const out: FilaRanking[] = [];
  for (const v of VARIABLES_RESUMEN) {
    const { grupos, general } = porGrupo(filas, v, nMin);
    if (general === null) continue;
    const validos = grupos.filter(g => g.grupo !== "Sin dato");
    const comp = validos.filter(g => g.suficiente).sort((a, b) => b.diferencia - a.diferencia)[0];
    const peq = validos.filter(g => !g.suficiente).length;
    const g = comp ?? validos.sort((a, b) => b.diferencia - a.diferencia)[0];
    if (!g) continue;
    const estado = !comp ? "no comparable" : comp.diferencia > 0.05 ? "prioritario" : comp.diferencia > 0.02 ? "leve" : "sin diferencia";
    const adv = [!comp ? `Ningún grupo alcanza ${nMin} personas.` : "", peq ? `${peq} grupo(s) con menos de ${nMin} personas no se comparan.` : "", v === "supervisor" ? "El supervisor no puede usarse para evaluar candidatos (se conoce después del ingreso)." : ""].filter(Boolean).join(" ");
    out.push({ variable: v, grupo: g.grupo, n: g.n, renuncias: g.renuncias, tasa: g.tasa, general, diferencia: g.diferencia, estado, advertencia: adv || "Relación observada; no prueba que sea la causa." });
  }
  const orden = { prioritario: 0, leve: 1, "sin diferencia": 2, "no comparable": 3 };
  return out.sort((a, b) => orden[a.estado] - orden[b.estado] || b.diferencia - a.diferencia);
}

// Plan de acción (HU-11): responsable sugerido según la tabla de interesados del documento técnico, e indicador de seguimiento
export const PLAN: Record<Variable, { responsable: string; indicador: string }> = {
  supervisor: { responsable: "Gerencia de operaciones", indicador: "Rotación temprana del equipo del supervisor" },
  rangoDistancia: { responsable: "Gerencia de RR. HH. y jefatura de reclutamiento", indicador: "Rotación temprana de quienes viven a más de 15 km" },
  turno: { responsable: "Gerencia de operaciones", indicador: "Rotación temprana por turno" },
  rangoExperiencia: { responsable: "Gerencia de RR. HH. (formación)", indicador: "Rotación temprana de personas sin experiencia y renuncias en el mes con más renuncias" },
  rangoPuntaje: { responsable: "Jefatura de reclutamiento", indicador: "Rotación temprana por rango de puntaje" },
  canal: { responsable: "Jefatura de reclutamiento", indicador: "Rotación temprana por canal de reclutamiento" },
  campana: { responsable: "Gerencia de operaciones", indicador: "Rotación temprana de la campaña" },
  educacion: { responsable: "Gerencia de RR. HH. (formación)", indicador: "Rotación temprana por nivel educativo" },
};

// Top 3 perfiles (HU-09): grupos de variables de perfil con mayor tasa
export const VARIABLES_PERFIL: Variable[] = ["rangoDistancia", "turno", "rangoExperiencia", "educacion", "canal"];
export function topPerfiles(filas: Fila[], nMin: number): (Grupo & { variable: Variable })[] {
  return VARIABLES_PERFIL.flatMap(v => porGrupo(filas, v, nMin).grupos.filter(g => g.suficiente && g.grupo !== "Sin dato").map(g => ({ ...g, variable: v })))
    .sort((a, b) => b.tasa - a.tasa).slice(0, 3);
}

// Motivos declarados (HU-10): top 5 entre renuncias tempranas con respuesta a la encuesta de salida
export function motivos(filas: Fila[]): { motivo: string; n: number; pct: number }[] {
  const m = new Map<string, number>(); let t = 0;
  for (const x of filas) if (x.ventana && x.renuncia && x.motivo && x.motivo !== "Sin dato") { m.set(x.motivo, (m.get(x.motivo) ?? 0) + 1); t++; }
  return [...m.entries()].map(([motivo, n]) => ({ motivo, n, pct: t ? n / t : 0 })).sort((a, b) => b.n - a.n).slice(0, 5);
}
export function sinRespuesta(filas: Fila[]): number { return filas.filter(x => x.ventana && x.renuncia && (!x.motivo || x.motivo === "Sin dato")).length; }
// Contraste de motivos con los hallazgos de HU-07 a HU-09
const RELACION: Record<string, Variable[]> = { "Horario": ["turno", "rangoDistancia"], "Clima laboral": ["supervisor"], "Salario": ["campana", "rangoExperiencia"], "Estudio": ["educacion"], "Otro": [] };
export function contraste(top: { motivo: string; pct: number }[], fs: Factor[]): { motivo: string; tipo: "coincide" | "contradice" | "sin relación"; texto: string }[] {
  return top.map(t => {
    const rel = RELACION[t.motivo] ?? []; const f = fs.find(x => rel.includes(x.variable));
    if (!rel.length) return { motivo: t.motivo, tipo: "sin relación" as const, texto: "Motivo genérico; no se contrasta con un factor medido." };
    if (f) return { motivo: t.motivo, tipo: "coincide" as const, texto: `Coincide con el factor «${NOMBRE_VARIABLE[f.variable]}: ${f.grupo}» del resumen (+${(f.diferencia * 100).toFixed(1).replace(".", ",")} p.p.).` };
    return { motivo: t.motivo, tipo: "contradice" as const, texto: `Las personas lo declaran, pero los datos no muestran un factor asociado (${rel.map(v => NOMBRE_VARIABLE[v]).join(", ")}) entre los principales.` };
  });
}

// Costo (HU-05, condicionado): costo = renuncias × (reclutamiento + formación + tiempo improductivo)
export interface SupuestosCosto { reclutamiento: number; formacion: number; improductivo: number }
export function costo(renuncias: number, s: SupuestosCosto | null): number | null {
  if (!s) return null;
  return renuncias * (s.reclutamiento + s.formacion + s.improductivo);
}

// ---------------- Semáforo (13.7, 13.9) ----------------
export interface Candidato { campana: string; turno: string; distancia: number; experiencia: number; educacion: string; canal: string; puntaje: number }
export const SENSIBLES = ["edad", "sexo", "estado_civil", "estrato", "barrio", "direccion", "dirección", "nombre", "documento"];
export interface Coef { variable: string; coeficiente: number; media: number | null; escala: number | null; imputacion: number | null }
export interface Contribucion { variable: string; etiqueta: string; valor: string; c: number }
export interface Evaluacion { probabilidad: number; color: "verde" | "amarillo" | "rojo"; logit: number; contribuciones: Contribucion[] }

export const LIMITES = { distancia: [0, 100], experiencia: [0, 600], puntaje: [0, 100] } as const;
export function validarCandidato(entrada: Record<string, unknown>, opciones: Record<string, string[]>): string[] {
  const errores: string[] = [];
  for (const k of Object.keys(entrada)) if (SENSIBLES.includes(k.toLowerCase())) errores.push(`«${k}» es una variable sensible o identificable y no puede usarse para evaluar candidatos (HU-15).`);
  const req: [keyof Candidato, string][] = [["campana", "Campaña"], ["turno", "Turno"], ["distancia", "Distancia"], ["experiencia", "Experiencia previa"], ["educacion", "Nivel educativo"], ["canal", "Canal de reclutamiento"], ["puntaje", "Puntaje de la prueba técnica"]];
  for (const [k, nombre] of req) {
    const v = entrada[k];
    if (v === undefined || v === null || v === "") { errores.push(`Falta el campo obligatorio «${nombre}».`); continue; }
    if (k in LIMITES) {
      const n = Number(v); const [a, b] = LIMITES[k as keyof typeof LIMITES];
      if (!Number.isFinite(n)) errores.push(`«${nombre}» debe ser un número.`);
      else if (n < a || n > b) errores.push(`«${nombre}» debe estar entre ${a} y ${b}; se recibió ${n}.`);
    } else if (opciones[k] && !opciones[k].includes(String(v))) errores.push(`«${nombre}» tiene un valor no permitido.`);
  }
  return errores;
}

const ETIQUETA_NUM: Record<string, string> = { distancia_km: "Distancia", experiencia_previa_meses: "Experiencia previa", puntaje_prueba_tecnica: "Puntaje de la prueba técnica" };
const ETIQUETA_CAT: Record<string, string> = { turno: "Turno", nivel_educativo: "Nivel educativo", canal_reclutamiento: "Canal de reclutamiento", campana: "Campaña" };
export function evaluar(c: Candidato, coefs: Coef[], umbralAmarillo: number, umbralRojo: number): Evaluacion {
  const num: Record<string, number> = { distancia_km: c.distancia, experiencia_previa_meses: c.experiencia, puntaje_prueba_tecnica: c.puntaje };
  const cat: Record<string, string> = { turno: c.turno, nivel_educativo: c.educacion, canal_reclutamiento: c.canal, campana: c.campana };
  let logit = 0; const contrib: Contribucion[] = [];
  for (const k of coefs) {
    if (k.variable === "intercepto") { logit += k.coeficiente; continue; }
    if (k.media !== null && k.escala !== null) {
      const x = (num[k.variable] - k.media) / k.escala; const ci = k.coeficiente * x; logit += ci;
      contrib.push({ variable: k.variable, etiqueta: ETIQUETA_NUM[k.variable], valor: String(num[k.variable]), c: ci });
    } else {
      const [v, cat_] = k.variable.split("=");
      if (cat[v] === cat_) { logit += k.coeficiente; contrib.push({ variable: v, etiqueta: ETIQUETA_CAT[v], valor: cat_, c: k.coeficiente }); }
    }
  }
  const p = 1 / (1 + Math.exp(-logit));
  const color = p >= umbralRojo ? "rojo" : p >= umbralAmarillo ? "amarillo" : "verde";
  contrib.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
  return { probabilidad: p, color, logit, contribuciones: contrib.slice(0, 3) };
}
export const ACCION: Record<string, [string, string]> = { // [si sube el riesgo, si lo baja]
  distancia_km: ["Informar el auxilio de transporte y explorar un turno compatible con el desplazamiento.", "La cercanía favorece la permanencia; confirmar disponibilidad de horario."],
  experiencia_previa_meses: ["Asignar un mentor y reforzar la inducción durante los primeros 60 días.", "Aprovechar su experiencia; considerar rol de apoyo a compañeros nuevos."],
  puntaje_prueba_tecnica: ["Ofrecer nivelación técnica durante la formación inicial.", "Buen desempeño en la prueba; mantener seguimiento normal."],
  turno: ["Explicar con claridad las condiciones del turno y validar que el candidato puede sostenerlo.", "El turno elegido se asocia con mayor permanencia."],
  nivel_educativo: ["Ajustar la inducción a su formación y ofrecer acompañamiento cercano.", "Su formación se asocia con mayor permanencia."],
  canal_reclutamiento: ["Hacer seguimiento cercano en el primer mes; el canal se asocia con más renuncias.", "El canal de llegada se asocia con mayor permanencia (por ejemplo, referidos)."],
  campana: ["Presentar con transparencia las metas y condiciones de la campaña.", "La campaña se asocia con mayor permanencia."],
};

// Plan B (13.10): reglas de alerta simples basadas en el diagnóstico
export interface Condicion { id: string; condicion: string; valor: string; cumple: boolean }
export interface ReglaActivada { regla: string; tipo: "combinada" | "simple"; justificacion: string; accion: string }
export interface ResultadoReglas { color: "verde" | "amarillo" | "rojo"; reglas: string[]; condiciones: Condicion[]; detalle: ReglaActivada[] }
export function reglasAlerta(c: Candidato): ResultadoReglas {
  const r: string[] = [];
  if (c.distancia > 15 && (c.turno === "Noche" || c.turno === "Rotativo")) r.push("Distancia mayor a 15 km y turno nocturno o rotativo.");
  if (c.experiencia === 0 && c.puntaje < 60) r.push("Sin experiencia previa y puntaje de la prueba técnica menor a 60.");
  const combDist = c.distancia > 15 && (c.turno === "Noche" || c.turno === "Rotativo");
  const combExp = c.experiencia === 0 && c.puntaje < 60;
  if (c.distancia > 15 && !combDist) r.push("Distancia mayor a 15 km.");
  if (c.experiencia === 0 && !combExp) r.push("Sin experiencia previa.");
  const fuertes = r.filter(x => x.includes(" y ")).length;
  const lejos = c.distancia > 15, nocturno = c.turno === "Noche" || c.turno === "Rotativo", sinExp = c.experiencia === 0, bajo = c.puntaje < 60;
  const condiciones: Condicion[] = [
    { id: "C1", condicion: "Distancia vivienda–trabajo mayor a 15 km", valor: `${c.distancia} km`, cumple: lejos },
    { id: "C2", condicion: "Turno nocturno o rotativo", valor: c.turno, cumple: nocturno },
    { id: "C3", condicion: "Sin experiencia previa (0 meses)", valor: `${c.experiencia} meses`, cumple: sinExp },
    { id: "C4", condicion: "Puntaje de la prueba técnica menor a 60", valor: String(c.puntaje), cumple: bajo },
  ];
  const detalle: ReglaActivada[] = r.map(regla => {
    if (regla.startsWith("Distancia mayor a 15 km y")) return { regla, tipo: "combinada", justificacion: `Distancia ${c.distancia} km (> 15) y turno ${c.turno}.`, accion: ACCION.distancia_km[0] + " " + ACCION.turno[0] };
    if (regla.startsWith("Sin experiencia previa y")) return { regla, tipo: "combinada", justificacion: `${c.experiencia} meses de experiencia y puntaje ${c.puntaje} (< 60).`, accion: ACCION.experiencia_previa_meses[0] + " " + ACCION.puntaje_prueba_tecnica[0] };
    if (regla.startsWith("Distancia")) return { regla, tipo: "simple", justificacion: `Distancia ${c.distancia} km (> 15); el turno ${c.turno} no agrava el riesgo.`, accion: ACCION.distancia_km[0] };
    return { regla, tipo: "simple", justificacion: `${c.experiencia} meses de experiencia; el puntaje ${c.puntaje} es 60 o más.`, accion: ACCION.experiencia_previa_meses[0] };
  });
  return { color: fuertes ? "rojo" : r.length ? "amarillo" : "verde", reglas: r, condiciones, detalle };
}

// ---------------- Burndown (Entregable 2) ----------------
export function diasHabiles(inicio: string, fin: string): string[] {
  const out: string[] = []; const d = new Date(inicio + "T12:00:00Z"); const f = new Date(fin + "T12:00:00Z");
  while (d <= f) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
export interface Registro { fecha: string; aceptados: number; fuente: string }
export interface PuntoBurndown { fecha: string; ideal: number; real: number | null }
// Trabajo restante = comprometidos − aceptados (DoD). Línea ideal lineal en días hábiles hasta 0.
export function burndown(inicio: string, fin: string, comprometidos: number, registros: Registro[]): PuntoBurndown[] {
  const dias = diasHabiles(inicio, fin); const n = dias.length - 1;
  const reg = [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return dias.map((fecha, i) => {
    const r = reg.filter(x => x.fecha === fecha).pop();
    return { fecha, ideal: +(comprometidos * (1 - i / n)).toFixed(2), real: r ? Math.max(0, comprometidos - r.aceptados) : null };
  });
}
export function estadoBurndown(p: PuntoBurndown[]): { estado: "adelantado" | "al día" | "atrasado" | "sin datos"; detalle: string } {
  const ult = [...p].reverse().find(x => x.real !== null);
  if (!ult) return { estado: "sin datos", detalle: "No hay registros de avance real; solo se muestra la línea ideal." };
  const dif = (ult.real as number) - ult.ideal;
  if (Math.abs(dif) <= 1) return { estado: "al día", detalle: `Al ${ult.fecha} quedan ${ult.real} puntos; la línea ideal indica ${c1(ult.ideal)}.` };
  return dif > 0
    ? { estado: "atrasado", detalle: `Al ${ult.fecha} quedan ${ult.real} puntos, ${c1(dif)} más de lo que indica la línea ideal (${c1(ult.ideal)}).` }
    : { estado: "adelantado", detalle: `Al ${ult.fecha} quedan ${ult.real} puntos, ${c1(-dif)} menos que la línea ideal (${c1(ult.ideal)}).` };
}

// ---------------- DORA (Entregable 4) ----------------
export interface EventoDora { id: string; cambio: string; inicioCambio: string; despliegue: string; exitoso: boolean; fallo: boolean; inicioIncidente: string; recuperacion: string }
export interface ResultadoDora { despliegues: number; semanas: number; frecuenciaSemanal: number | null; leadTimeHoras: number | null; tasaFallos: number | null; mttrHoras: number | null }
const horas = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3.6e6;
export function dora(ev: EventoDora[], inicioPeriodo: string, finPeriodo: string): ResultadoDora {
  const desp = ev.filter(e => e.despliegue && e.exitoso);
  const semanas = Math.max(1, horas(inicioPeriodo, finPeriodo) / 168);
  const lt = desp.filter(e => e.inicioCambio).map(e => horas(e.inicioCambio, e.despliegue)).filter(x => x >= 0);
  const todos = ev.filter(e => e.despliegue);
  const fallos = todos.filter(e => e.fallo);
  const rec = fallos.filter(e => e.inicioIncidente && e.recuperacion).map(e => horas(e.inicioIncidente, e.recuperacion)).filter(x => x >= 0);
  const prom = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  return {
    despliegues: desp.length, semanas, frecuenciaSemanal: desp.length ? desp.length / semanas : null, leadTimeHoras: prom(lt),
    tasaFallos: todos.length ? (fallos.length / todos.length) * 100 : null, mttrHoras: prom(rec),
  };
}

// ---------------- Rendimiento (Entregable 5) ----------------
export function estadisticos(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b); const n = s.length;
  return { n, min: s[0], max: s[n - 1], promedio: s.reduce((a, b) => a + b, 0) / n, mediana: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 };
}
export function ampliar(filas: Fila[], n: number, semilla = 42): Fila[] { // remuestreo determinista para pruebas de volumen
  let x = semilla; const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: Fila[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = filas[Math.floor(rnd() * filas.length)];
  return out;
}

// ---------------- Simulador de escenarios (módulo de valor agregado) ----------------
// N = personas de cohortes con ventana completa en la selección; R = renuncias tempranas observadas;
// meta = tasa objetivo elegida por el usuario (fracción 0–1); C = costo supuesto por reemplazo (COP).
// Renuncias estimadas = redondeo(N × meta). Si la meta, a un decimal, es igual a la tasa actual,
// se usan las R observadas (evita diferencias de ±1 que solo produce el redondeo de la tasa mostrada).
export type TipoEscenario = "menor rotación" | "mayor rotación" | "sin diferencia";
export interface Escenario {
  n: number; renuncias: number; tasaActual: number; meta: number; difPp: number; costoUnitario: number;
  renunciasEstimadas: number; difRenuncias: number; costoReferencia: number; costoEscenario: number; difCosto: number; tipo: TipoEscenario;
}
export function simularEscenario(n: number, renuncias: number, meta: number, costoUnitario: number): Escenario | null {
  if (!(n > 0) || renuncias < 0 || renuncias > n || !(meta >= 0 && meta <= 1) || !(costoUnitario >= 0)) return null;
  const tasaActual = renuncias / n;
  const igual = Math.round(meta * 1000) === Math.round(tasaActual * 1000);
  const renunciasEstimadas = igual ? renuncias : Math.round(n * meta);
  const difRenuncias = renuncias - renunciasEstimadas;
  const costoReferencia = renuncias * costoUnitario, costoEscenario = renunciasEstimadas * costoUnitario;
  return {
    n, renuncias, tasaActual, meta, difPp: (tasaActual - meta) * 100, costoUnitario, renunciasEstimadas, difRenuncias,
    costoReferencia, costoEscenario, difCosto: costoReferencia - costoEscenario,
    tipo: difRenuncias > 0 ? "menor rotación" : difRenuncias < 0 ? "mayor rotación" : "sin diferencia",
  };
}
// Entradas de texto del formulario (admite coma decimal). Devuelven el valor o un mensaje de error.
export function validarMeta(txt: string): { valor: number } | { error: string } {
  const t = txt.trim().replace(",", ".");
  if (!t) return { error: "Ingrese la meta de rotación temprana (entre 0 y 100 %)." };
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: "La meta debe ser un número entre 0 y 100, sin símbolos." };
  const v = Number(t);
  if (v < 0 || v > 100) return { error: `La meta debe estar entre 0 y 100 %; se recibió ${txt.trim()}.` };
  return { valor: v / 100 };
}
export function validarCosto(txt: string): { valor: number } | { error: string } {
  const t = txt.trim().replace(/[.\s$]/g, "").replace(",", ".");
  if (!t) return { error: "Ingrese el costo por reemplazo en pesos colombianos." };
  if (/^-/.test(t)) return { error: "El costo por reemplazo no puede ser negativo." };
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: "El costo debe ser un número en pesos, por ejemplo 2550000." };
  return { valor: Number(t) };
}
