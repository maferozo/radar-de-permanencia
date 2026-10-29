// Genera documentacion/documento_cierre.docx a partir de los resultados reales de esta entrega.
// Ejecutar desde la raíz:  node documentacion/generar_documento_cierre.js
const fs = require("fs"), path = require("path");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, HeadingLevel, ImageRun,
  PageOrientation, Footer, Header, PageNumber, LevelFormat, BorderStyle, PageBreak, TableLayoutType } = require("docx");

const R = path.join(__dirname, "..");
const J = p => JSON.parse(fs.readFileSync(path.join(R, p), "utf8"));
const PR = J("pruebas/resultados_consolidados.json"), M = J("datos_demo/modelo/ficha_modelo.json"), CAL = J("datos_demo/reporte_calidad.json");
const RD = J("metricas/rendimiento/resultados_rendimiento.json"), TR = J("prototipo/src/data/trazabilidad.json"), JI = J("evidencias/jira/jira_snapshot_2026-10-27_post.json");
const E2 = J("pruebas/resultados_e2e.json");

const ACC = "1D5C63", GRIS = "485956", F = "Arial";
const coma = (x, d = 1) => Number(x).toFixed(d).replace(".", ",");
const pct = (x, d = 1) => coma(x * 100, d) + " %";

// ---------- helpers ----------
const run = (t, o = {}) => new TextRun({ text: t, font: F, size: o.size ?? 20, bold: o.bold, italics: o.italics, color: o.color });
function P(t, o = {}) {
  const kids = Array.isArray(t) ? t.map(x => typeof x === "string" ? run(x, o) : x) : [run(t, o)];
  return new Paragraph({ children: kids, spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 276 }, alignment: o.align, keepNext: o.keepNext });
}
const B = t => run(t, { bold: true });
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: F, size: 30, bold: true, color: ACC })], spacing: { before: 280, after: 140 }, keepNext: true });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: F, size: 24, bold: true, color: "142321" })], spacing: { before: 200, after: 100 }, keepNext: true });
const LI = (t, nivel = 0) => new Paragraph({ numbering: { reference: "vinetas", level: nivel }, children: (Array.isArray(t) ? t : [t]).map(x => typeof x === "string" ? run(x) : x), spacing: { after: 60, line: 264 } });
const NUM = t => new Paragraph({ numbering: { reference: "numeros", level: 0 }, children: [run(t)], spacing: { after: 60 } });
const borde = { style: BorderStyle.SINGLE, size: 4, color: "B9C3C0" };
const BORDES = { top: borde, bottom: borde, left: borde, right: borde };
const COLOR_ESTADO = { "Finalizado": "E3F4E3", "En revisión": "DCEBEB", "En curso": "FFF1CC", "Pendiente": "FBE5E5", "No verificado": "EEF1F0", "Aprobada": "E3F4E3", "Fallida": "FBE5E5", "Cumple": "E3F4E3", "Parcial": "FFF1CC", "No cumple": "FBE5E5" };
function tabla(anchos, filas, o = {}) {
  const total = anchos.reduce((a, b) => a + b, 0); const tam = o.size ?? 16;
  const rows = filas.map((f, i) => new TableRow({
    tableHeader: i === 0, cantSplit: true,
    children: f.map((c, j) => {
      const enc = i === 0; const txt = c === null || c === undefined ? "—" : String(c);
      const fill = enc ? ACC : (o.estadoCol === j && COLOR_ESTADO[txt]) ? COLOR_ESTADO[txt] : (i % 2 === 0 ? "F6F7F6" : "FFFFFF");
      return new TableCell({
        width: { size: anchos[j], type: WidthType.DXA }, borders: BORDES, shading: { fill, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 50, bottom: 50, left: 80, right: 80 },
        children: txt.split("\n").map(l => new Paragraph({ children: [new TextRun({ text: l, font: F, size: tam, bold: enc || (o.boldCol === j), color: enc ? "FFFFFF" : "142321" })], spacing: { after: 20 } })),
      });
    }),
  }));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: anchos, rows, layout: TableLayoutType.FIXED });
}
function imagen(rel, ancho, pie) {
  const buf = fs.readFileSync(path.join(R, rel)); const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const alto = Math.round(ancho * h / w);
  return [new Paragraph({ children: [new ImageRun({ type: "png", data: buf, transformation: { width: ancho, height: alto }, altText: { title: pie, description: pie, name: pie } })], alignment: AlignmentType.CENTER, spacing: { after: 60 }, keepNext: true }),
    P(pie, { italics: true, size: 17, color: GRIS, align: AlignmentType.CENTER, after: 200 })];
}
const nota = (t) => new Paragraph({ children: Array.isArray(t) ? t.map(x => typeof x === "string" ? run(x, { size: 19 }) : x) : [run(t, { size: 19 })], shading: { fill: "FFF4D9", type: ShadingType.CLEAR, color: "auto" },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: "8A5A00", space: 6 } }, spacing: { before: 80, after: 160, line: 264 }, indent: { left: 120, right: 120 } });

const cnt = (s) => PR.funcionales.filter(f => f.suite.startsWith(s));
const apr = l => l.filter(x => x.estado === "Aprobada").length;
const perf = n => RD.filas.find(f => f.prueba.startsWith(n));
const lr = M.metricas[0], ref = M.metricas[1];
const brecha = a => M.brechas.find(b => b.atributo === a);
const EA = M.evaluacion_ampliada; const maxBrechaB = Math.max(...EA.plan_b_brechas.flatMap(b => [b.brecha_recall_pp, b.brecha_fp_pp]));
const huJira = {}; JI.filter(x => x.type === "Historia").forEach(x => { const m = x.summary.match(/HU-?(\d+)/); if (m) huJira["HU-" + m[1].padStart(2, "0")] = x; });

// ================= CONTENIDO =================
const portada = [
  new Paragraph({ spacing: { before: 1800 }, children: [] }),
  P("Universidad Católica Luis Amigó · Equipo CoE de Datos", { color: GRIS, size: 22 }),
  P("Caso 4: People Analytics — Rotación y Desempeño (Recursos Humanos)", { color: GRIS, size: 22, after: 600 }),
  new Paragraph({ children: [new TextRun({ text: "Documento de cierre y estado de entrega — Radar de permanencia", font: F, size: 52, bold: true, color: ACC })], spacing: { after: 300 } }),
  P("Cierre técnico de la entrega académica del 27 de octubre de 2026", { size: 28, after: 120 }),
  P("Este documento no declara el proyecto formalmente aceptado ni cerrado: no hay evidencia de aprobación del cliente. El acta de validación está lista para firmarse en la demo; el cronograma oficial continúa hasta el 16 de noviembre de 2026.", { size: 21, color: GRIS, after: 900 }),
  tabla([3000, 7080], [["Campo", "Detalle"], ["Versión", "1.2 · 27 de octubre de 2026 (mejora de claridad del prototipo: lectura ejecutiva, ranking de causas, plan de acción, semáforo explicado, seguimiento ampliado y guía de demostración)"], ["Documento base", "Radar_de_permanencia_Documento_tecnico.docx, v1.0 (20/10/2026)"],
    ["Estado", "Pendiente de la validación del cliente (acta en documentacion/acta_validacion_cliente.pdf, sin firmar)"], ["Fecha de corte de datos (ficticios)", "30 de septiembre de 2026"],
    ["Tablero Jira", "Proyecto SCRUM («Mi equipo de software»), actualizado y consultado el 27 de octubre de 2026"]], { size: 18 }),
  new Paragraph({ children: [new PageBreak()] }),
];

const contenido = [H1("Contenido"), ...["Información general del proyecto", "Objetivo y problema abordado", "Alcance aprobado y alcance condicionado", "Resumen de los entregables",
  "Estado de las 16 historias de usuario", "Estado de los nueve casos de uso", "Matriz de requisitos funcionales RF-01 a RF-19", "Matriz de requisitos no funcionales RNF-01 a RNF-13",
  "Estado del prototipo y sus funcionalidades", "Resultados de las pruebas funcionales", "Burndown chart y seguimiento de sprints", "Métricas DORA", "Indicadores de rendimiento",
  "Riesgos, limitaciones y dependencias", "Privacidad, protección de datos y equidad", "Pendientes y recomendaciones", "Criterios de aceptación de la entrega", "Conclusiones", "Anexos técnicos"]
  .map((t, i) => P(`${i + 2}. ${t}`, { after: 40 })),
  P("La sección 1 corresponde a la portada.", { italics: true, color: GRIS, size: 18, before: 80 }),
  H2("Cómo leer los estados"),
  tabla([2200, 7880], [["Estado", "Significado en este documento"],
    ["Pendiente", "No hay trabajo verificable o depende de datos o decisiones externas."],
    ["En curso", "Hay trabajo verificable, pero uno o más criterios de aceptación no se cumplen todavía."],
    ["En revisión", "Implementado y probado con datos ficticios; falta la revisión por otro integrante y la validación del cliente en el acta antes de pasar a Finalizado."],
    ["Finalizado", "Cumple sus criterios de aceptación con datos ficticios de demostración (sección 4.2 del documento técnico), tiene pruebas automatizadas aprobadas y la Product Owner la movió a Finalizado en Jira el 27-oct-2026. Queda pendiente repetir con datos reales del cliente."],
    ["No verificado", "No hubo acceso a la evidencia necesaria para verificarlo (por ejemplo, permisos de Drive o documento legal)."]], { size: 17, estadoCol: 0 }),
  nota([B("Fuentes de este documento. "), "Documento técnico v1.0; tablero Jira actualizado y consultado el 27-oct-2026 (evidencias/jira/); pipeline, prototipo y pruebas construidos y ejecutados en esta entrega. Todos los datos del dashboard y del modelo son ficticios de demostración (semilla 42); ninguna cifra analítica describe al cliente."]),
  new Paragraph({ children: [new PageBreak()] }),
];

const s2a5 = [
  H1("2. Información general del proyecto"),
  tabla([3000, 7080], [["Campo", "Detalle"], ["Proyecto", "Radar de permanencia"], ["Caso", "Caso 4: People Analytics — Rotación y Desempeño (Recursos Humanos)"],
    ["Cliente", "Área de Recursos Humanos de un call center tipo BPO. En el contexto académico, el profesor asume el rol de cliente."],
    ["Equipo", "Equipo CoE de Datos, Universidad Católica Luis Amigó"],
    ["Roles según el documento técnico", "Product Owner: María Fernanda. Scrum Master: Nicolás Raigoza Taborda. Data/Arquitectura, Data Analyst y BI/UX/ML: nombres pendientes de completar en el documento técnico."],
    ["Integrantes con ítems asignados en Jira", "María Fernanda Rozo Ramírez, Nicolás Raigoza Taborda, Manuel Alejandro Hernández Lizcano, Luis Fernando Rendón López y Santiago Rojas Pulgarín"],
    ["Período", "21 de septiembre al 16 de noviembre de 2026 (ocho semanas, cuatro sprints)"], ["Metodología", "Scrum con sprints de dos semanas; tablero en Jira; Definition of Done de la sección 15.4"],
    ["Stack documentado", "Python (pandas, scikit-learn) en Google Colab, Google Drive (capas bronce, plata y oro), Power BI Desktop, GitHub y Jira"],
    ["Stack del prototipo de esta entrega", "Python 3 para ETL y modelo; React 18 + TypeScript + Recharts para el prototipo web (HTML autocontenido); Playwright para pruebas"]], { size: 18 }),
  H1("3. Objetivo y problema abordado"),
  P([B("Problema. "), "La rotación temprana, definida como la renuncia voluntaria dentro de los primeros 180 días desde el ingreso, genera costo económico (reclutamiento, formación y tiempo improductivo), costo operativo (puestos vacíos y menor calidad de atención) y falta de diagnóstico sobre sus causas."]),
  P([B("Objetivo general. "), "Proveer a Recursos Humanos una herramienta analítica que explique las causas de la rotación temprana y apoye la decisión de contratación con una estimación explicable y justa del riesgo de renuncia de cada candidato."]),
  P("La solución responde dos preguntas de negocio:", { after: 60 }),
  LI([B("¿Por qué se están yendo? "), "Dashboard descriptivo y diagnóstico (pantallas Panorama, Causas y Resumen y acciones)."]),
  LI([B("¿Podemos anticipar qué candidatos tienen mayor probabilidad de permanecer? "), "Semáforo de candidatos basado en regresión logística interpretable, con plan B de reglas de alerta."]),
  H1("4. Alcance aprobado y alcance condicionado"),
  H2("4.1 Alcance aprobado (MVP)"),
  P("Según el documento técnico, el MVP es un dashboard que muestra cuánta rotación temprana hay, cuándo ocurre y con qué factores se asocia, y un semáforo que estima el riesgo de renuncia temprana de un candidato con información de la entrevista, de forma explicable y sin variables discriminatorias. El documento indica que esta línea base fue validada en el Sprint 0."),
  nota([B("Actualización del 27-oct-2026. "), "Hasta esta fecha, siete tareas del Sprint 0 seguían abiertas en Jira y el sprint continuaba «activo». Se movieron a Finalizado (sus entregables están consolidados en el documento técnico v1.0) y el Sprint 0 se cerró."]),
  H2("4.2 Alcance condicionado"),
  LI([B("HU-05 Costo de la rotación (3 pts): "), "requiere costos de reemplazo del cliente o la validación de supuestos (S-14). Como no hay costos reales, se adoptaron supuestos simulados del equipo (reclutamiento $450.000, formación $1.200.000 y tiempo improductivo $900.000 COP por reemplazo), marcados como no validados y editables en el prototipo y en Power BI. Con ellos el costo estimado es $1.989 millones COP (780 renuncias × $2.550.000)."]),
  LI([B("HU-10 Motivos declarados de renuncia (3 pts): "), "requiere encuesta o registro de salida (S-15). Se simuló una encuesta de salida (12 % sin respuesta): en las cohortes con ventana completa los motivos más frecuentes son Horario (175), Salario (170) y Otro (152). El prototipo los contrasta con los factores medidos; si la columna no existe, el visual se oculta (CU-03, A2)."]),
  nota([B("Decisión del 27-oct-2026. "), "La estudiante a cargo indicó que no hay datos reales del cliente y pidió completar el alcance con datos inventados. Todo lo que depende de ellos queda «En revisión», no «Finalizado», hasta que el cliente lo valide en el acta."]),
  H2("4.3 Fuera de alcance"),
  ...["Integración automática con sistemas de nómina o reclutamiento.", "Actualización automática de datos y reentrenamiento automático.", "Predicción de riesgo para empleados ya contratados.", "Aplicación productiva con gestión real de usuarios y permisos.", "Modelos complejos de caja negra."].map(t => LI(t)),
  H1("5. Resumen de los entregables"),
  H2("5.1 Entregables de esta entrega"),
  tabla([2300, 4580, 1500, 1700], [["Entregable", "Contenido", "Estado", "Ubicación"],
    ["1. Prototipo funcional", "Aplicación web navegable con las 4 pantallas, filtros, semáforo explicable y sección de seguimiento. Datos ficticios identificados.", "En revisión", "prototipo/ (dist/index.html) y artefacto publicado"],
    ["2. Burndown", "Gráficos del proyecto y de los Sprints 1, 2 y 3; tabla planificado/completado; registro editable en el prototipo y en Excel.", "En revisión", "metricas/burndown/"],
    ["3. Documento de cierre", "Este documento (DOCX y PDF).", "En revisión", "documentacion/"],
    ["4. Métricas DORA", "Definiciones, fórmulas, estado «Sin despliegues medidos», registro editable y ejemplo demostrativo separado.", "En revisión", "metricas/dora/ y prototipo"],
    ["5. Indicadores de rendimiento", "Pruebas reproducibles ejecutadas, resultados medidos y plantilla.", "En revisión", "metricas/rendimiento/"],
    ["Complementos", "Pipeline ETL y modelo (Python), datos ficticios, 71 pruebas automatizadas, matriz de trazabilidad, evidencias.", "En revisión", "pipeline/, pruebas/, evidencias/"],
    ["Proyecto Power BI", "Proyecto PBIP con modelo semántico (relaciones, 22 medidas DAX, 3 roles RLS) y 4 páginas con 42 visuales, sobre los datos ficticios.", "No verificado", "powerbi/ (abrir el .pbip en Power BI Desktop)"],
    ["Cumplimiento y acta", "Documento de cumplimiento de la Ley 1581 (borrador para revisión) y acta de validación del cliente en blanco con 9 decisiones.", "En revisión", "documentacion/"]], { size: 17, estadoCol: 2 }),
  H2("5.2 Entregables del producto definidos en el documento técnico"),
  tabla([2300, 4880, 2900], [["Entregable del producto", "Situación", "Evidencia"],
    ["1. Base de datos unificada", "Pipeline bronce → plata → oro implementado y probado con datos ficticios. Falta ejecutarlo con los exportes reales y en Google Drive.", "pipeline/02_etl.py; datos_demo/; PT-08-01 a PT-08-08"],
    ["2. Dashboard descriptivo y diagnóstico", "Implementado como prototipo web y como proyecto Power BI (PBIP) generado por código. El PBIP no se abrió en Power BI Desktop porque el entorno de construcción no tiene Windows; su integridad (campos, medidas y roles) se verificó con la prueba PT-10-01. powerbi/LEEME.md explica cómo abrirlo y una ruta manual si falla.", "Prototipo; powerbi/; PF-01 a PF-09; PT-10-01"],
    ["3. Resumen de causas", "Implementado; factores simulados.", "PF-10, PF-11, PU-05"],
    ["4. Modelo y semáforo", "Modelo entrenado con datos ficticios; no publicable (no cumple equidad). Según CU-09 A1, el semáforo oficial es el plan B de reglas de alerta, que cumple la revisión de equidad; el modelo queda solo para comparación.", "PT-09-01 a PT-09-07; PF-12 a PF-20"],
    ["5. Ficha del modelo", "Generada automáticamente con métricas, equidad y variables usadas y excluidas (simulada).", "datos_demo/modelo/ficha_modelo.json; Anexo E"]], { size: 17 }),
];

// ---------- 6 HU ----------
const HU = [
  ["HU-01", "Información unificada y confiable", "Fuentes integradas con id único; sin duplicados ni fechas imposibles; faltantes documentados.", "Finalizado", "02_etl.py; reporte de calidad; PT-08-01 a 08-05", "Validado con datos ficticios; falta ejecutar con los exportes reales.", "Ejecutar con exportes reales del cliente."],
  ["HU-02", "Definición única de renuncia temprana", "Voluntaria ≤ 180 días; despidos explícitos; tasas solo con ventana completa.", "Finalizado", "PT-08-06, PT-08-07, PU-01, PU-02; despidos mostrados aparte", "La pregunta de validación 2 (despidos) no tiene respuesta registrada.", "Confirmar con el cliente."],
  ["HU-03", "Evolución de la rotación temprana", "Tasa y cantidad por cohorte; tendencia en gráfico de línea.", "Finalizado", "Panorama; PF-01, PF-03", "Replicado en el proyecto Power BI (sin abrir en Desktop); datos ficticios.", "Abrir el PBIP y conciliar con el prototipo."],
  ["HU-04", "Mes crítico de renuncia", "Distribución meses 1 a 6; mes crítico resaltado.", "Finalizado", "Panorama; PF-01", "Datos ficticios.", "Conciliar con la base real."],
  ["HU-05", "Costo de la rotación temprana", "Costo = renuncias × costo por reemplazo; supuestos validados.", "En revisión", "Tarjeta con supuestos simulados; PF-02, PU-19; medida DAX", "Costos simulados; supuestos por validar (acta, decisión 4).", "Validar supuestos en el acta."],
  ["HU-06", "Filtrar el dashboard", "Filtros en todos los gráficos; opción para limpiar.", "Finalizado", "PF-04, PF-05, PF-06, PU-03, PU-17", "Movida al Sprint 1 en Jira el 27-oct (estaba en el Sprint 2).", "Conciliar con Power BI."],
  ["HU-07", "Retención por supervisor", "Tasa y n por supervisor; grupos bajo el mínimo no se comparan.", "Finalizado", "Causas; PF-07, PU-04", "Mínimo por grupo (30) es supuesto del equipo.", "Acordar el mínimo con el cliente."],
  ["HU-08", "Pruebas técnicas y permanencia", "Rotación por rango de puntaje; conclusión explícita.", "Finalizado", "Causas; PF-07", "Conclusión calculada sobre datos ficticios.", "Recalcular con datos reales."],
  ["HU-09", "Perfiles con mayor rotación", "Tasas por variable con tamaño de grupo; top 3 resaltado.", "Finalizado", "Causas; PF-08", "Datos ficticios.", "Revisar con RR. HH."],
  ["HU-10", "Motivos declarados de renuncia", "Top 5 motivos; coincidencias y contradicciones.", "En revisión", "Gráfico de motivos y contraste; PF-09, PU-18", "Encuesta de salida simulada (acta, decisión 5).", "Validar con el registro de salida real."],
  ["HU-11", "Resumen de causas y recomendaciones", "Top 3 a 5 factores con evidencia; una recomendación por factor.", "Finalizado", "Resumen; PF-10, PF-11, PU-05", "Factores simulados; recomendaciones sin validar (S-05).", "Validar recomendaciones con RR. HH."],
  ["HU-12", "Semáforo de riesgo del candidato", "Verde, amarillo o rojo; solo datos de entrevista; umbrales acordados con RR. HH.", "En revisión", "Plan B oficial; PF-12, PF-16, PF-17, PF-19, PU-20", "Semáforo por reglas; reglas y umbrales sin aprobar por RR. HH.", "Aprobar reglas en el acta (decisión 7)."],
  ["HU-13", "Explicación del riesgo", "3 factores principales y acción sugerida.", "En revisión", "PF-13, PU-10", "Acciones sugeridas redactadas por el equipo.", "Validar acciones con RR. HH."],
  ["HU-14", "Confiabilidad de la herramienta", "% de renuncias detectadas y falsas alarmas; supera la referencia; datos no usados; meta con el cliente.", "En revisión", "PF-20, PT-09-02, PT-09-06, PT-09-07", `Plan B: recall ${coma(EA.plan_b.recall, 3)}, precisión ${coma(EA.plan_b.precision, 3)} (simulado); meta no acordada.`, "Acordar la meta en el acta (decisión 6)."],
  ["HU-15", "Herramienta no discriminatoria", "Sin variables sensibles ni aproximaciones; no se equivoca más con un grupo; decisión final humana.", "En revisión", "PT-09-01, PT-09-04, PT-09-07, PU-08, PF-12", `Plan B cumple: brecha máxima ${coma(maxBrechaB)} p.p. El modelo no cumple y no se publica.`, "Confirmar el criterio de 10 p.p. en el acta."],
  ["HU-16", "Protección de datos personales", "Sin nombres ni documentos; acceso por roles; cumplimiento de la Ley 1581 documentado.", "En revisión", "PT-08-05, PU-16, PF-18; roles RLS en Power BI; cumplimiento_ley_1581.pdf", "Documento de cumplimiento en borrador, sin revisión jurídica; RLS sin probar en el servicio.", "Revisión jurídica y del cliente."],
];
const s6 = [
  H1("6. Estado de las 16 historias de usuario"),
  P(`Estado tras actualizar el tablero Jira el 27-oct-2026. Las historias de los Sprints 1 y 2 cumplen sus criterios de aceptación con datos ficticios, tienen pruebas automatizadas aprobadas y están en «Finalizado». Las del Sprint 3 y las condicionadas HU-05 y HU-10 se completaron con datos simulados y están «En revisión»: el semáforo oficial es el plan B, que cumple equidad, pero las metas, reglas y supuestos requieren la validación del cliente.`),
  tabla([700, 1600, 2500, 1050, 2350, 2600, 2150], [["ID", "Historia de usuario", "Criterio de aceptación", "Estado", "Evidencia disponible", "Pendiente o limitación", "Próxima acción"],
    ...HU.map(h => [h[0], h[1] + (huJira[h[0]] ? `\n(Jira ${huJira[h[0]].key}: ${huJira[h[0]].status})` : ""), h[2], h[3], h[4], h[5], h[6]])], { size: 15, estadoCol: 3, boldCol: 0 }),
  P(`Resumen: ${HU.filter(h => h[3] === "Finalizado").length} finalizadas (${HU.filter(h => h[3] === "Finalizado").reduce((a, h) => a + ({ "HU-01": 8, "HU-03": 5, "HU-09": 5, "HU-11": 5 }[h[0]] ?? 3), 0)} pts), ${HU.filter(h => h[3] === "En revisión").length} en revisión, ${HU.filter(h => h[3] === "En curso").length} en curso y ${HU.filter(h => h[3] === "Pendiente").length} pendientes (condicionadas). Además, «Dataset del modelo» (SCRUM-54, 5 pts) está en Finalizado.`, { before: 120, bold: true }),
];
// ---------- 7 CU ----------
const CU = [
  ["CU-01", "Consultar panorama", "Implementado (A1 incluido)", "PF-01, PF-02, PF-03, PU-01, PU-02", "Pendiente", "Finalizado"],
  ["CU-02", "Filtrar el dashboard", "Implementado (A1 incluido)", "PF-04, PF-05, PF-06, PU-03, PU-17", "Pendiente", "Finalizado"],
  ["CU-03", "Analizar causas", "Implementado (A1 y A2 incluidos)", "PF-07, PF-08, PF-09, PU-04", "Pendiente", "Finalizado"],
  ["CU-04", "Consultar resumen y acciones", "Implementado. A1 (descarga PDF de Power BI) reemplazado por «Copiar resumen (CSV)»", "PF-10, PF-11, PU-05", "Pendiente", "Finalizado"],
  ["CU-05", "Evaluar candidato", "Implementado con el plan B como semáforo oficial (CU-09 A1); el modelo se muestra solo para comparación", "PF-12, PF-14 a PF-19, PU-06 a PU-09, PU-11, PU-20", "Pendiente (acta)", "En revisión"],
  ["CU-06", "Ver explicación del riesgo", "Implementado (contribución β × x, 3 factores, acción)", "PF-13, PU-10", "Pendiente", "En revisión"],
  ["CU-07", "Consultar confiabilidad del modelo", "Implementado («Ver detalle», lenguaje no técnico); muestra la confiabilidad del plan B", "PF-20", "Pendiente (acta)", "En revisión"],
  ["CU-08", "Cargar y procesar datos", "Implementado con datos ficticios (A1 incluido). Paso 5 (actualizar Power BI) no aplica al prototipo", "PT-08-01 a PT-08-08", "Pendiente", "Finalizado"],
  ["CU-09", "Entrenar y publicar el modelo", "Implementado. El flujo A1 se activó: el modelo no se publica y el plan B pasa a ser el semáforo oficial", "PT-09-01 a PT-09-07, PF-19", "Pendiente (acta)", "En revisión"],
];
const s7 = [H1("7. Estado de los nueve casos de uso"),
  tabla([800, 2000, 4100, 3000, 1500, 1350, ], [["CU", "Nombre", "Implementación", "Pruebas ejecutadas (todas aprobadas)", "Validación del cliente", "Estado"], ...CU], { size: 16, estadoCol: 5, boldCol: 0 })];
// ---------- 8 RF ----------
const RF_EST = { "RF-06": "En revisión", "RF-11": "En revisión", "RF-13": "En revisión", "RF-14": "En revisión", "RF-15": "En revisión", "RF-16": "En revisión", "RF-17": "En revisión", "RF-18": "En revisión", "RF-19": "En revisión" };
const RF_EV = { "RF-01": "PT-08-01, PT-08-05", "RF-02": "PT-08-01 a 08-04, 08-08", "RF-03": "PT-08-06, PT-08-07", "RF-04": "PF-01, PF-03", "RF-05": "PF-01", "RF-06": "PF-02", "RF-07": "PF-04 a PF-06", "RF-08": "PF-07, PU-04", "RF-09": "PF-07", "RF-10": "PF-08", "RF-11": "PF-09", "RF-12": "PF-10, PF-11, PU-05", "RF-13": "PF-12, PF-14 a PF-17", "RF-14": "PF-13, PU-10", "RF-15": "PF-20", "RF-16": "PT-09-01, PT-09-04, PU-08", "RF-17": "PF-12, PF-19", "RF-18": "PU-16, PT-08-05", "RF-19": "PT-09-05; pipeline 01 a 04" };
const RF_PEND = { "RF-06": "Costos simulados; validar supuestos.", "RF-11": "Encuesta de salida simulada.", "RF-13": "Semáforo por reglas (plan B); reglas sin aprobar.", "RF-15": "Métricas simuladas.", "RF-16": "El modelo no cumple; el plan B sí (PT-09-07).", "RF-17": "Plan B oficial; validar reglas.", "RF-18": "Roles RLS definidos en Power BI, sin probar en el servicio.", "RF-01": "Datos ficticios.", "RF-02": "Datos ficticios.", "RF-19": "Falta ejecución por otro integrante (RNF-09)." };
const s8 = [H1("8. Matriz de requisitos funcionales RF-01 a RF-19"),
  tabla([750, 3000, 2300, 1050, 1800, 2200, 1900], [["ID", "Requisito", "Dónde se cumple", "Estado", "Evidencia", "Pendiente o limitación", "Próxima acción"],
    ...TR.map(t => [t.id, t.req + ` (${t.hu})`, t.donde, RF_EST[t.id] ?? "Finalizado", RF_EV[t.id], RF_PEND[t.id] ?? "Repetir con datos reales del cliente.", RF_EST[t.id] === "Pendiente" ? "Esperar datos del cliente." : RF_EST[t.id] === "En curso" ? "Completar en el Sprint 3." : RF_EST[t.id] === "En revisión" ? "Revisión por pares y validación en el acta." : "Mostrar en la Sprint Review del 2-nov."])], { size: 15, estadoCol: 3, boldCol: 0 })];
// ---------- 9 RNF ----------
const fil = perf("Respuesta a un filtro"), sem = perf("Semáforo"), vol = RD.filas.find(f => f.registros === 50000 && f.umbral);
const RNF = [
  ["RNF-01", "Privacidad", "Anonimización con hash SHA-256 con sal en plata", "En revisión", "PT-08-05: sin nombre ni documento; hash cambia con la sal", "La sal de la demo es un valor de ejemplo; usar una sal secreta fuera del repositorio."],
  ["RNF-02", "Seguridad", "Drive con acceso restringido; datos fuera del repositorio", "No verificado", "Sin acceso a Drive ni al repositorio del equipo", "Revisar permisos de la carpeta y el .gitignore."],
  ["RNF-03", "Cumplimiento legal", "Ley 1581 de 2012 y Decreto 1377 de 2013", "En revisión", "documentacion/cumplimiento_ley_1581.pdf (borrador del equipo)", "Revisión jurídica y aprobación del cliente; el equipo no es asesor legal."],
  ["RNF-04", "Equidad", "Brecha de recall y FPR ≤ 10 p.p. (propuesta)", "En revisión", `Plan B (oficial): brecha máxima ${coma(maxBrechaB)} p.p., cumple. Modelo: sexo ${coma(brecha("sexo").brecha_recall_pp)} p.p., no cumple.`, "Confirmar el criterio con el cliente; repetir con datos reales."],
  ["RNF-05", "Explicabilidad", "3 factores de mayor contribución por predicción", "En revisión", "PU-10, PF-13", "Validar redacción con reclutadores."],
  ["RNF-06", "Desempeño del modelo", "Supera la referencia; recall ≥ 0,60 (propuesta)", "En curso", `Modelo: AUC ${coma(lr.auc, 3)} vs. 0,500; recall ${coma(lr.recall, 3)}. Plan B: recall ${coma(EA.plan_b.recall, 3)}`, "Meta de recall no alcanzada; acordar la meta (acta, decisión 6)."],
  ["RNF-07", "Rendimiento", "Filtro < 3 s; semáforo < 2 s; hasta 50.000 registros", "En revisión", `Máximos medidos: filtro ${coma(fil.max)} ms; semáforo ${coma(sem.max)} ms; 50.000 registros ${coma(vol.max)} ms`, "Medido en el prototipo web; falta medir el dashboard Power BI en el equipo del cliente."],
  ["RNF-08", "Usabilidad", "Usuario no técnico identifica tasa y mes crítico en < 1 min", "No verificado", "Requiere prueba con el cliente en la Sprint Review", "Cronometrar con el cliente."],
  ["RNF-09", "Reproducibilidad", "Semilla 42; mismo resultado en otra ejecución", "En revisión", "PT-09-05: diferencia 0 entre ejecuciones", "Ejecución por un integrante distinto."],
  ["RNF-10", "Mantenibilidad", "Capas con interfaz por archivos; funciones reutilizables", "En revisión", "pipeline/criterios.py, prototipo/src/calc.ts", "Revisión de código por pares."],
  ["RNF-11", "Trazabilidad", "Bronce inmutable por fecha; cifras rastreables", "En curso", "bronce/2026-09-30; reporte de calidad", "Auditoría formal de un indicador oro → bronce."],
  ["RNF-12", "Calidad de datos", "0 duplicados, 0 fechas imposibles, nulos documentados", "En revisión", "PT-08-01 a PT-08-04; reporte de calidad", "Repetir con datos reales."],
  ["RNF-13", "Costo y portabilidad", "Herramientas sin costo de licencia", "En revisión", "Stack de código abierto; prototipo sin servidor", "Confirmar licencias del entorno del cliente."],
];
const s9 = [H1("9. Matriz de requisitos no funcionales RNF-01 a RNF-13"),
  tabla([850, 1500, 3000, 1100, 3500, 3050], [["ID", "Categoría", "Criterio de verificación", "Estado", "Evidencia", "Pendiente o limitación"], ...RNF], { size: 15, estadoCol: 3, boldCol: 0 })];

// ---------- 10 Prototipo ----------
const FUNC = [
  ["Navegación entre 4 pantallas, seguimiento y botón «Volver al panorama»", "Sí", "Sí (PF-21)", "Pendiente", "—"],
  ["Indicadores del panorama y gráficos por cohorte y por mes", "Sí", "Sí (PF-01, PF-03)", "Pendiente", "Datos reales"],
  ["Filtros por período, campaña y supervisor; limpiar; estado vacío", "Sí", "Sí (PF-04 a PF-06)", "Pendiente", "—"],
  ["Costo estimado con supuestos", "Sí (supuestos simulados)", "Sí (PF-02, PU-19)", "Pendiente", "Validar supuestos"],
  ["Causas: supervisor, prueba técnica con conclusión, perfiles, top 3, avisos de grupos pequeños", "Sí", "Sí (PF-07, PF-08)", "Pendiente", "Mínimo por grupo acordado"],
  ["Motivos de renuncia y contraste con factores medidos", "Sí (encuesta simulada)", "Sí (PF-09, PU-18)", "Pendiente", "Encuesta real"],
  ["Resumen de 3 a 5 factores con «Ver en Causas»", "Sí", "Sí (PF-10, PF-11)", "Pendiente", "Validar recomendaciones"],
  ["Semáforo con validaciones, 3 factores y aviso humano (modelo solo para comparación)", "Sí", "Sí (PF-12 a PF-18)", "Pendiente", "Validar reglas"],
  ["Plan B: reglas de alerta como semáforo oficial", "Sí", "Sí (PF-19, PU-20, PT-09-07)", "Pendiente", "Aprobar reglas"],
  ["Confiabilidad y revisión de equidad", "Sí", "Sí (PF-20)", "Pendiente", "Métricas reales"],
  ["Seguimiento: burndown editable, DORA, rendimiento, pruebas, calidad, trazabilidad", "Sí", "Sí (PF-22, PF-23)", "Pendiente", "Datos de Jira y despliegues"],
  ["Diseño adaptable a teléfono y temas claro/oscuro", "Sí", "Sí (PF-24)", "Pendiente", "—"],
  ["Lectura ejecutiva, filtros activos e incluidos/excluidos en el Panorama", "Sí", "Sí (PF-26)", "Pendiente", "—"],
  ["Ranking de factores con interpretación, recomendación y limitaciones", "Sí", "Sí (PF-27, PU-21)", "Pendiente", "—"],
  ["Plan de acción por factor (hallazgo a indicador de seguimiento)", "Sí", "Sí (PF-28, PU-23)", "Pendiente", "Responsables y plazos por acordar"],
  ["Semáforo con condiciones evaluadas, justificación y limitaciones", "Sí", "Sí (PF-29, PU-22)", "Pendiente", "Validar reglas"],
  ["Matriz de pruebas filtrable, UAT separada y trazabilidad RF → HU → CU → prueba", "Sí", "Sí (PF-30, PF-31)", "Pendiente", "UAT con el cliente"],
  ["Ayudas contextuales, glosario y enlace «Saltar al contenido»", "Sí", "Sí (PF-27, PF-32)", "Pendiente", "—"],
  ["Simulador de escenarios: meta de rotación, costo supuesto, comparación de hasta 3 escenarios y CSV", "Sí", "Sí (PF-33 a PF-38, PU-24 a PU-27)", "Pendiente", "Validar el costo por reemplazo"],
  ["Dashboard en Power BI (PBIP: 4 páginas, 22 medidas, 3 roles RLS)", "Sí (generado)", "Integridad (PT-10-01); no abierto en Desktop", "Pendiente", "Abrir y verificar en Windows"],
];
const s10 = [H1("10. Estado del prototipo y sus funcionalidades"),
  P("El prototipo es una aplicación web en React y TypeScript compilada como un único archivo HTML (prototipo/dist/index.html) que se abre sin servidor, sin credenciales y sin servicios externos. No simula conexiones a Jira, Power BI ni Google Drive: los datos del tablero se incluyeron como una consulta fechada. El semáforo abre en el plan B (oficial); el modelo aparece en una pestaña aparte, marcado como no publicado. Toda pantalla muestra la etiqueta «Datos ficticios de demostración»."),
  tabla([4000, 1500, 1900, 1350, 1330], [["Funcionalidad", "Implementada", "Probada", "Validada por el cliente", "Pendiente"], ...FUNC], { size: 16 }),
  P("", { after: 80 }),
  ...imagen("evidencias/capturas/PF-01_panorama.png", 600, "Figura 1. Pantalla Panorama (captura de la prueba PF-01, datos ficticios)"),
  ...imagen("evidencias/capturas/PF-29_semaforo_reglas.png", 430, "Figura 2. Semáforo oficial (plan B) con reglas, condiciones evaluadas y limitaciones (PF-29, datos ficticios)"),
];

// ---------- 11 Pruebas ----------
const s11 = [H1("11. Resultados de las pruebas funcionales"),
  P(`Se ejecutaron ${PR.funcionales.length} pruebas automatizadas el ${PR.fecha}; ${apr(PR.funcionales)} aprobaron y ninguna falló. Cubren los casos de uso CU-01 a CU-09, incluidas las pruebas negativas solicitadas. La matriz completa está en el Anexo A.`),
  tabla([3400, 1200, 1300, 4180], [["Suite", "Pruebas", "Aprobadas", "Alcance"],
    ["Pipeline (Python)", cnt("Pipeline").length, apr(cnt("Pipeline")), "ETL, calidad, anonimización, variable objetivo, criterios del modelo, plan B, exportación a Power BI (CU-08, CU-09)"],
    ["Unitarias (TypeScript)", cnt("Unitaria").length, apr(cnt("Unitaria")), "Fórmulas, validaciones, consistencia Python vs. prototipo, burndown, DORA, ranking de factores, plan de acción, condiciones del semáforo"],
    ["Extremo a extremo (Playwright)", cnt("Extremo").length, apr(cnt("Extremo")), "Interacción real en el navegador (CU-01 a CU-07), navegación, accesibilidad por teclado, matriz de pruebas, trazabilidad, móvil"],
    ["Aceptación del cliente (UAT)", "0 de 16", "—", "Pendiente: se ejecuta en la demo con el acta de validación"]], { size: 17 }),
  H2("11.1 Pruebas negativas solicitadas"),
  tabla([3600, 1300, 5180], [["Prueba negativa", "ID", "Resultado observado"],
    ...[["Puntaje de prueba superior a 100", "PF-15, PU-06"], ["Campos obligatorios vacíos", "PF-14, PU-07"], ["Filtros sin registros", "PF-06, PU-03"], ["Datos duplicados", "PT-08-01"], ["Fechas de retiro anteriores al ingreso", "PT-08-02"],
      ["Cohortes sin 180 días de observación", "PT-08-07, PU-02"], ["Intento de introducir variables sensibles", "PU-08, PT-09-01"], ["Modelo que no supera la referencia", "PT-09-03"], ["Modelo que incumple los criterios de equidad", "PT-09-04"]]
      .map(([n, ids]) => [n, ids, PR.funcionales.find(f => f.id === ids.split(",")[0].trim()).observado])], { size: 16 }),
  nota([B("Alcance de la verificación. "), "Las pruebas comprueban que el prototipo y el pipeline se comportan según los requisitos con datos ficticios. No sustituyen la prueba de aceptación con el cliente (UAT), la conciliación con Power BI ni la ejecución con datos reales, que siguen pendientes."]),
];

// ---------- 12 Burndown ----------
const s12 = [H1("12. Burndown chart y seguimiento de sprints"),
  P("Trabajo restante = puntos comprometidos − puntos aceptados como finalizados. Solo cuentan los puntos de historias que cumplen la Definition of Done y fueron revisadas por otro integrante; las tareas en curso o en revisión no se descuentan. La línea ideal es lineal en días hábiles hasta llegar a cero al cierre del sprint. Las historias «En revisión» no se descuentan."),
  P([B("Fuente del avance real. "), "Tablero Jira del proyecto SCRUM. Hasta el 27-oct-2026 ninguna historia había cambiado de estado y los sprints de construcción no se habían iniciado en Jira. Ese día se actualizó el tablero: se cargaron los puntos, se cerró el Sprint 0, se inició y cerró el Sprint 1 con sus fechas oficiales y se inició el Sprint 2. Las historias de los Sprints 1 y 2 pasaron a «Finalizado» el 27-oct. No se inventaron puntos diarios: la línea real une solo las fechas con registro."]),
  tabla([1700, 1700, 1100, 1500, 1100, 1300, 1680], [["Sprint", "Fechas", "Planif.", "Complet. dentro del sprint", "Pend.", "Variación vs. ideal", "Finalizado en Jira al 27-oct"],
    ["Sprint 0", "21-sep a 5-oct", "—", "—", "—", "Sin puntos", "Cerrado; 9 tareas finalizadas"], ["Sprint 1", "6 a 19-oct", "22", "0", "22", "−22,0 al cierre", "22 (aceptados 8 días tarde)"],
    ["Sprint 2", "20-oct a 2-nov", "21", "21", "0", "+9,3 al 27-oct", "21"], ["Sprint 3", "3 a 16-nov", "26", "—", "—", "No iniciado", "0 (26 pts en revisión)"],
    ["Total comprometido", "6-oct a 16-nov", "69", "43", "26", "+7,3 al 27-oct", "43"], ["Backlog condicionado", "—", "6", "—", "—", "No comprometido", "HU-05, HU-10 en revisión"]], { size: 16 }),
  P([B("Interpretación. "), "El Sprint 1 no quemó puntos dentro de sus fechas: su línea real queda plana en 22 y sus historias se aceptaron el 27-oct, después del cierre programado. El Sprint 2 y el proyecto aparecen adelantados frente a la línea ideal al 27-oct (21 de 21 y 43 de 69 puntos), porque el trabajo de ambos sprints se aceptó el mismo día. Para la retrospectiva conviene registrar que el avance se concentró al final y que el tablero no se actualizó durante el Sprint 1."], { before: 120 }),
  ...imagen("metricas/burndown/burndown_proyecto.png", 600, "Figura 3. Burndown del proyecto (Sprints 1 a 3)"),
  ...imagen("metricas/burndown/burndown_s1.png", 520, "Figura 4. Burndown del Sprint 1"),
  ...imagen("metricas/burndown/burndown_s2.png", 520, "Figura 5. Burndown del Sprint 2"),
  ...imagen("metricas/burndown/burndown_s3.png", 520, "Figura 6. Burndown del Sprint 3 (solo línea ideal: el sprint no ha iniciado)"),
  H2("12.1 Cambios aplicados en Jira el 27-oct-2026"),
  ...["Puntos de historia cargados en las 16 historias (69 comprometidos y 6 condicionados).", "Sprint 0 cerrado; sus siete tareas abiertas pasaron a Finalizado.",
    "Sprint 1 iniciado con fechas 6 a 19-oct y cerrado con 22 de 22 puntos en Finalizado.", "Sprint 2 iniciado con fechas 20-oct a 2-nov; 21 de 21 puntos en Finalizado; sigue activo hasta la Sprint Review.", "Tareas técnicas del Sprint 3 (SCRUM-33, 38, 40, 43, 44, 45) en revisión.",
    "HU-06 pasó al Sprint 1; HU-15 y HU-16 pasaron del «SCRUM Sprint 4» al Sprint 3; HU-05 y HU-10 al backlog condicionado.", "Se creó SCRUM-54 «Dataset del modelo» (5 pts) en el Sprint 2.",
    "Sprint 3: HU-12 a HU-16 en revisión con el plan B como semáforo oficial; HU-05 y HU-10 en revisión con datos simulados. Cada historia tiene un comentario con su evidencia y la decisión del acta que le falta."].map(t => LI(t)),
  H2("12.2 Desviaciones y riesgos"),
  LI("El Sprint 1 se cerró 8 días después de su fecha de fin y sus puntos se aceptaron fuera del sprint."),
  LI("El «SCRUM Sprint 4» quedó vacío y no existe en el cronograma oficial; puede eliminarse desde el tablero."),
  LI("Los 26 puntos del Sprint 3 están en revisión, pero no se descuentan hasta la validación del cliente. R-02 se materializó con los datos simulados (el modelo no cumple equidad) y el plan B quedó como semáforo oficial."),
  LI("El 2 y el 16 de noviembre de 2026 son festivos en Colombia: la Sprint Review del Sprint 2 y la demo final caen en festivo y deben reprogramarse o confirmarse."),
];

// ---------- 13 DORA ----------
const s13 = [H1("13. Métricas DORA"),
  P("El proyecto no tiene un entorno productivo ni despliegues registrados al 27-oct-2026. Por eso las cuatro métricas quedan en «Sin despliegues medidos». Para este proyecto se define despliegue como la publicación de una versión utilizable por el cliente en su entorno de uso; no cuentan un commit, un merge, una entrega académica ni una demo local. La publicación del prototipo hecha en esta entrega es una entrega académica de demostración y no se contabiliza."),
  tabla([1100, 1150, 1150, 850, 550, 750, 1200, 1000, 1100, 1230], [["Métrica", "Definición", "Fórmula", "Período", "Valor", "Unidad", "Fuente de evidencia", "Estado", "Interpretación", "Acción de mejora"],
    ["Frecuencia de despliegue", "Despliegues exitosos por período", "Despliegues exitosos ÷ semanas observadas", "21-sep a 16-nov", "—", "despl./semana", "Tags o releases de GitHub; registro de publicaciones", "Sin despliegues medidos", "Mayor = entregas más pequeñas", "Definir y registrar cada publicación"],
    ["Tiempo de entrega de cambios", "Del primer commit al despliegue", "Promedio (despliegue − primer commit)", "21-sep a 16-nov", "—", "horas", "Historial de Git + registro", "Sin despliegues medidos", "Menor = valor llega antes", "Vincular ítems de Jira con ramas o PR"],
    ["Tasa de fallos de cambios", "% de despliegues con corrección, reversión o intervención urgente", "Desp. con fallo ÷ total × 100", "21-sep a 16-nov", "—", "%", "Registro de incidentes", "Sin despliegues medidos", "Menor = cambios más confiables", "Registrar toda corrección urgente"],
    ["Tiempo de recuperación", "Del inicio del incidente a la recuperación verificada", "Promedio (recuperación − inicio)", "21-sep a 16-nov", "—", "horas", "Registro de incidentes con horas", "Sin despliegues medidos", "Menor = recuperación más rápida", "Anotar detección y verificación"]], { size: 13 }),
  H2("13.1 Evidencia necesaria para calcularlas"),
  ...["Un registro por cambio con la fecha del primer commit y la fecha de despliegue (plantilla metricas/dora/dora_registro_y_resultados.xlsx o pestaña Seguimiento › Métricas DORA del prototipo).",
    "Un repositorio con tags o releases que marquen cada versión publicada.", "Un registro de incidentes con la hora de inicio y la hora de recuperación verificada, vinculado al despliegue que lo causó."].map(t => LI(t)),
  nota([B("Ejemplo demostrativo, separado de los resultados. "), "Con tres despliegues inventados en 20 días (uno con fallo recuperado en 3,5 h), las fórmulas dan 1,05 despliegues por semana, 60,3 h de tiempo de entrega, 33,3 % de tasa de fallos y 3,5 h de recuperación. Estos valores solo ilustran el cálculo y no son resultados del proyecto."]),
];

// ---------- 14 Rendimiento ----------
const s14 = [H1("14. Indicadores de rendimiento"),
  H2("14.1 Rendimiento del sistema (medido)"),
  P(`Objetivos de diseño propuestos en el documento (RNF-07): filtro < 3 s, semáforo < 2 s, hasta 50.000 registros. Los valores de la tabla son mediciones reales del prototipo web, tomadas el ${RD.fecha.replace("T", " ")} en: ${RD.entorno}. Los tiempos de Playwright incluyen la sobrecarga de la herramienta y son una cota superior.`),
  tabla([3530, 900, 600, 850, 850, 850, 850, 750, 900], [["Prueba", "Registros", "Rep.", "Mín. ms", "Prom. ms", "Med. ms", "Máx. ms", "Errores", "Resultado"],
    ...RD.filas.map(f => [f.prueba, f.registros.toLocaleString("es-CO"), f.n, coma(f.min), coma(f.promedio), coma(f.mediana), coma(f.max), f.errores, f.umbral ? (f.max < f.umbral && !f.errores ? "Cumple" : "No cumple") : "Informativo"])], { size: 15, estadoCol: 8 }),
  P(`Porcentaje de operaciones exitosas en las pruebas de rendimiento: 100 % (0 errores). Errores de validación esperados y mostrados correctamente: 7 campos vacíos (PF-14), puntaje fuera de rango (PF-15) y umbrales inválidos (PF-16). Procedimiento reproducible: «npm run build» y «python3 pruebas/test_e2e.py».`, { before: 100 }),
  nota([B("Pendiente. "), "Estas cifras corresponden al prototipo web. El proyecto Power BI no se abrió ni se midió (no hay Windows en el entorno de construcción) y el equipo del cliente tampoco; la plantilla metricas/rendimiento/rendimiento_resultados_y_plantilla.xlsx deja el registro listo."]),
  H2("14.2 Indicadores analíticos del producto (datos ficticios)"),
  tabla([3600, 2000, 4480], [["Indicador", "Valor (simulado)", "Nota"],
    ["Personas en cohortes con ventana completa", "2.528", "Cohortes 2024-07 a 2026-04"], ["Renuncias tempranas", "780", "Despidos tempranos mostrados aparte: 55"],
    ["Tasa de rotación temprana", "30,9 %", "renuncias ÷ contratados con ventana observada"], ["Mes crítico de renuncia", "Mes 2", "204 renuncias (26,2 % del total)"],
    ["Mayor tasa por grupo", "> 15 km: 43,7 %", "+12,8 p.p. frente al promedio (n = 405)"], ["Costo estimado", "$1.989 millones COP", "780 × $2.550.000; supuestos simulados (HU-05)"],
    ["Motivo declarado más frecuente", "Horario: 175", "22,4 % de las renuncias; 82 sin respuesta (encuesta simulada)"]], { size: 17 }),
  H2("14.3 Calidad del modelo (demostración simulada)"),
  P(`Evaluación con cohortes no usadas para entrenar (entrenamiento ${M.particion.train}, n = ${M.particion.n_train}; prueba ${M.particion.test}, n = ${M.particion.n_test}).`),
  tabla([3300, 1100, 1100, 1100, 1100, 1300, 1080], [["Modelo o criterio", "Recall", "Precisión", "F1", "AUC", "Tasa FP", "Falsas alarmas"],
    ...[...M.metricas, M.plan_b].map(m => [m.modelo, coma(m.recall, 3), coma(m.precision, 3), coma(m.f1, 3), m.auc === null ? "—" : coma(m.auc, 3), coma(m.tasa_falsos_positivos, 3), m.fp])], { size: 16 }),
  tabla([2500, 2500, 2500, 2580], [["Atributo (simulado)", "Brecha de recall", "Brecha de tasa FP", "Criterio ≤ 10 p.p."],
    ...M.brechas.map(b => [b.atributo.replace("_grupo", ""), coma(b.brecha_recall_pp) + " p.p.", coma(b.brecha_fp_pp) + " p.p.", b.cumple ? "Cumple" : "No cumple"])], { size: 16, estadoCol: 3 }),
  P(`Lectura: el modelo supera a la referencia «todos se quedan» (recall ${coma(lr.recall, 3)} frente a 0; AUC ${coma(lr.auc, 3)} frente a 0,500), pero no alcanza la meta propuesta de recall ≥ 0,60 ni el criterio de equidad propuesto. Las metas son propuestas por validar con el cliente y no se presentan como logradas. Con los datos ficticios, las brechas de equidad provienen del azar en grupos pequeños, porque las variables sensibles se simularon sin relación con la renuncia; aun así, la regla se aplica y el modelo no se publica (CU-09, A1).`, { before: 120 }),
  H2("14.4 Semáforo oficial: plan B evaluado en todas las cohortes"),
  P(`Para no depender del azar de un solo corte de prueba, se evaluaron el plan B y el modelo (validación cruzada de 5 particiones, predicciones fuera de muestra) sobre las ${EA.n.toLocaleString("es-CO")} personas con ventana completa.`),
  tabla([3300, 1100, 1100, 1100, 1100, 1300, 1080], [["Criterio", "Recall", "Precisión", "F1", "AUC", "Tasa FP", "Falsas alarmas"],
    ...[EA.plan_b, EA.modelo_oof].map(m => [m.modelo, coma(m.recall, 3), coma(m.precision, 3), coma(m.f1, 3), m.auc === null ? "—" : coma(m.auc, 3), coma(m.tasa_falsos_positivos, 3), m.fp])], { size: 16 }),
  tabla([2500, 1900, 1900, 1900, 1880], [["Atributo (simulado)", "Plan B: brecha recall", "Plan B: brecha FP", "Modelo: brecha recall", "Resultado"],
    ...EA.plan_b_brechas.map((b, i) => { const o = EA.modelo_oof_brechas[i]; return [b.atributo.replace("_grupo", ""), coma(b.brecha_recall_pp) + " p.p.", coma(b.brecha_fp_pp) + " p.p.", coma(o.brecha_recall_pp) + " p.p.", (b.cumple ? "Plan B cumple" : "Plan B no cumple") + (o.cumple ? "" : "; modelo no")]; })], { size: 16 }),
  P(`Lectura: el plan B cumple la revisión de equidad en los cuatro atributos (brecha máxima ${coma(maxBrechaB)} p.p.) y por eso es el semáforo oficial. Detecta menos renuncias que el modelo (recall ${coma(EA.plan_b.recall, 3)} frente a ${coma(EA.modelo_oof.recall, 3)}), pero con muchas menos falsas alarmas (${EA.plan_b.fp} frente a ${EA.modelo_oof.fp}). El cliente debe decidir en el acta si acepta esa sensibilidad o pide otra meta.`, { before: 120 }),
];

// ---------- 15–19 ----------
const s15 = [H1("15. Riesgos, limitaciones y dependencias"),
  tabla([1100, 3100, 900, 4980], [["ID", "Riesgo", "Nivel", "Mitigación o contingencia"],
    ["R-01", "Datos incompletos, de mala calidad o sin variables clave", "Crítico", "Pipeline con reglas de calidad probado; ejecutar con exportes reales cuanto antes."],
    ["R-02", "El modelo no supera la referencia, tiene fuga o sesgo", "Alto", "Materializado en la demo por equidad y recall; plan B de reglas implementado en el semáforo."],
    ["R-03", "Poco dominio de herramientas y dependencia de una persona", "Alto", "Prototipo, pruebas y README documentados para que cualquier integrante los ejecute."],
    ["R-04 (nuevo)", "Tablero Jira sin actualizar durante el Sprint 1", "Medio", "Mitigado el 27-oct: tablero alineado con el documento. Actualizar estados a diario."],
    ["R-05 (nuevo)", "El proyecto Power BI generado no se ha abierto en Power BI Desktop", "Medio", "Integridad verificada por prueba (PT-10-01); abrirlo en Windows antes de la demo; LEEME.md trae la ruta manual."],
    ["R-06 (nuevo)", "Festivos del 2 y 16 de noviembre reducen días hábiles", "Medio", "Adelantar la demo final o acordar la fecha con el cliente."],
    ["R-07 (nuevo)", "Datos, costos y motivos simulados podrían tomarse como reales", "Alto", "Etiqueta en todas las pantallas y en Power BI; el acta pide al cliente confirmar que entiende que son simulados."]], { size: 16 }),
  H2("Limitaciones"),
  ...["Todos los datos son ficticios; ninguna cifra analítica describe al cliente.", "El proyecto Power BI se entrega como PBIP (no como .pbix) y no se abrió en Power BI Desktop.", "El modelo de demostración no es publicable; el semáforo usa reglas fijas (plan B) de menor sensibilidad.", "El control de acceso por roles existe solo como roles RLS en Power BI, sin probar en el servicio.", "Costos de reemplazo y motivos de renuncia son simulados.", "El mínimo de 30 personas por grupo es un supuesto del equipo."].map(t => LI(t)),
  H2("Dependencias del cliente"),
  ...["Exportes reales de empleados, retiros, desempeño y supervisores (S-11, S-12, S-13).", "Costos de reemplazo (HU-05) y encuesta de salida (HU-10) reales.", "Meta de recall, reglas del plan B y criterio de equidad (acta de validación).", "Respuestas a las cinco preguntas de validación (sección 4.4 del documento técnico)."].map(t => LI(t)),
];
const s16 = [H1("16. Privacidad, protección de datos y equidad"),
  ...[[B("Datos agregados. "), "El dashboard muestra solo conteos y tasas; el archivo de datos del prototipo no contiene id_empleado, nombres ni documentos (PU-16)."],
    [B("Anonimización. "), "SHA-256 con sal en la capa plata; nombre y documento se eliminan (PT-08-05). La sal de la demo es un valor de ejemplo que no debe usarse con datos reales."],
    [B("Semáforo sin almacenamiento. "), "Los datos del candidato viven solo en memoria; tras recargar no queda rastro en el navegador (PF-18)."],
    [B("Sin variables sensibles. "), "Edad, sexo, estado civil, estrato, barrio y dirección no entran al modelo ni al formulario; si se intentan enviar, se rechazan (PU-08, PT-09-01). La máxima asociación de una entrada con una variable sensible es V de Cramér = " + coma(M.proxy_max[0].v_cramer, 3) + " (límite 0,5)."],
    [B("Decisión humana. "), "El aviso «La herramienta apoya la decisión; la decisión final corresponde al reclutador» aparece en todo resultado (PF-12, PF-19)."],
    [B("Grupos pequeños. "), "Los grupos bajo el mínimo se muestran en gris y no se comparan (PF-07)."],
    [B("Equidad. "), "La revisión por grupo se ejecuta y bloquea la publicación cuando una brecha supera 10 p.p. (PT-09-04)."],
    [B("Roles. "), "El proyecto Power BI define tres roles RLS: Gerencia RR. HH. (todo), Operaciones - Campaña A y Operaciones - Campaña B (solo su campaña)."],
    [B("Cumplimiento legal. "), "documentacion/cumplimiento_ley_1581.pdf describe finalidad, autorización, datos tratados y excluidos, seguridad y derechos de los titulares según la Ley 1581 de 2012 y el Decreto 1377 de 2013. Es un borrador del equipo: requiere revisión jurídica y aprobación del cliente."]].map(t => LI(t))];
const s17 = [H1("17. Pendientes y recomendaciones"),
  P("Con los datos simulados, todo el alcance quedó implementado. Lo que falta no lo puede resolver el equipo por su cuenta:"),
  tabla([700, 5200, 2200, 1980], [["#", "Pendiente o recomendación", "Responsable sugerido", "Fecha sugerida"],
    ["1", "Validación del cliente: revisar la demo y diligenciar y firmar el acta (9 decisiones)", "Profesor (cliente) y Product Owner", "Demo final"],
    ["2", "Abrir powerbi/Radar_de_permanencia.pbip en Power BI Desktop (Windows), actualizar datos y verificar las 4 páginas", "BI/UX/ML", "Antes de la demo"],
    ["3", "Definir qué cuenta como despliegue y empezar el registro DORA", "Scrum Master", "Sprint 3"],
    ["4", "Con el acta firmada: mover a Finalizado las historias en revisión y cerrar los Sprints 2 y 3", "Scrum Master", "Tras la demo"],
    ["5", "Si llegan datos reales: ejecutar el pipeline, reentrenar y repetir la revisión de equidad", "Data/Arquitectura", "Cuando existan"],
    ["6", "Revisión jurídica del documento de cumplimiento y prueba de usabilidad (RNF-08)", "Product Owner", "Demo final"],
    ["7", "Eliminar del tablero el «SCRUM Sprint 4» vacío", "Scrum Master", "Inmediato"]], { size: 16 })];
const CRIT = [
  ["El prototipo permite navegar por las cuatro pantallas", "Cumple", "PF-21"], ["Las interacciones implementadas funcionan", "Cumple", `${apr(PR.funcionales)}/${PR.funcionales.length} pruebas`],
  ["Los gráficos presentan datos coherentes con sus fórmulas", "Cumple", "PU-01, PU-09, PF-01; conciliación Python ↔ prototipo"], ["Los filtros y el formulario responden correctamente", "Cumple", "PF-04 a PF-06, PF-14 a PF-17"],
  ["Los datos simulados están identificados", "Cumple", "Etiqueta en todas las pantallas; avisos en Resumen y Semáforo"], ["El burndown tiene línea ideal y permite registrar el avance real", "Cumple", "PF-22; plantilla Excel"],
  ["Las métricas DORA tienen definiciones, fórmulas y fuentes de evidencia", "Cumple", "Sección 13; PF-23"], ["Los indicadores de rendimiento tienen umbrales y procedimiento", "Cumple", "Sección 14; resultados medidos"],
  ["Existe una matriz de pruebas trazable a los casos de uso", "Cumple", "Anexo A"], ["El documento distingue avances comprobados de pendientes", "Cumple", "Secciones 6 a 10"],
  ["Se respetan privacidad, equidad y decisión humana", "Cumple", "Sección 16"], ["Los archivos están organizados y tienen instrucciones", "Cumple", "README.md; Anexo B"],
  ["Aceptación del cliente (UAT) y Definition of Done de las historias", "Parcial", "9 historias y el dataset del modelo en Finalizado; 7 historias en revisión; acta sin firmar"],
  ["Dashboard en Power BI", "Parcial", "PBIP generado y verificado por prueba; no abierto en Desktop"],
];
const s18 = [H1("18. Criterios de aceptación de la entrega"), tabla([5600, 1300, 3180], [["Criterio", "Estado", "Evidencia"], ...CRIT], { size: 16, estadoCol: 1 })];
const s19 = [H1("19. Conclusiones"),
  ...[`La entrega del 27-oct-2026 deja un prototipo funcional y demostrable de las cuatro pantallas del documento técnico, un pipeline reproducible, un proyecto Power BI y ${PR.funcionales.length} pruebas automatizadas aprobadas, todo con datos ficticios claramente identificados.`,
    "El prototipo cumple con holgura los objetivos de rendimiento propuestos: el filtro más lento tardó " + coma(fil.max) + " ms y el semáforo " + coma(sem.max) + " ms, frente a 3 s y 2 s.",
    "El modelo de demostración supera a la referencia, pero no cumple el criterio de equidad; según CU-09 A1 no se publica y el semáforo oficial es el plan B de reglas, que cumple la equidad en todas las cohortes (brecha máxima " + coma(maxBrechaB) + " p.p.).",
    "El tablero Jira quedó alineado con el cronograma oficial: 43 de 69 puntos en Finalizado (Sprints 1 y 2) y los 26 del Sprint 3, más HU-05 y HU-10, en revisión. El burndown muestra que el Sprint 1 no quemó puntos dentro de sus fechas.",
    "El proyecto no puede declararse cerrado: falta la validación del cliente (acta sin firmar), abrir el proyecto Power BI en Windows y medir despliegues. Los datos reales no existen; se trabajó con datos simulados por decisión del equipo. Este documento es un cierre técnico de la entrega académica, con los pendientes explícitos."].map(t => LI(t))];

// ---------- 20 Anexos ----------
const s20 = [H1("20. Anexos técnicos"),
  H2("Anexo B. Estructura de archivos"),
  ...["README.md: instrucciones de ejecución.", "prototipo/: código React + TypeScript; dist/index.html autocontenido; pruebas/unit.test.ts.", "pipeline/: 01_generar_datos_demo.py, 02_etl.py, 03_modelo.py, 04_exportar_prototipo.py, 05_exportar_powerbi.py, criterios.py.", "powerbi/: proyecto PBIP (modelo semántico y reporte), datos/ en CSV, medidas.dax y LEEME.md.",
    "datos_demo/: bronce/2026-09-30 (con errores sembrados), plata/, oro/, modelo/ (coeficientes, umbrales, métricas, equidad, ficha) y reporte_calidad.json.",
    "pruebas/: test_pipeline.py, test_e2e.py y resultados en JSON.", "metricas/: burndown/ (PNG y XLSX), dora/ (XLSX), rendimiento/ (JSON y XLSX).", "documentacion/: este documento, el documento de cumplimiento de la Ley 1581 y el acta de validación del cliente, en DOCX y PDF, con sus generadores.", "evidencias/: capturas de las pruebas y consulta de Jira del 27-oct-2026."].map(t => LI(t)),
  H2("Anexo C. Ejecución"),
  ...["Prototipo sin instalar nada: abrir prototipo/dist/index.html en Chrome, Edge o Firefox.", "Desarrollo: cd prototipo; npm install; npm run dev. Compilar: npm run build.",
    "Regenerar datos y modelo: python3 pipeline/01_generar_datos_demo.py; python3 pipeline/02_etl.py; python3 pipeline/03_modelo.py; python3 pipeline/04_exportar_prototipo.py; python3 pipeline/05_exportar_powerbi.py.", "Power BI: abrir powerbi/Radar_de_permanencia.pbip en Power BI Desktop y ajustar el parámetro RutaDatos a la carpeta powerbi/datos.",
    "Pruebas: python3 pruebas/test_pipeline.py; cd prototipo && npm run test:unit; python3 pruebas/test_e2e.py."].map(t => LI(t)),
  H2("Anexo D. Reporte de calidad del ETL (datos ficticios)"),
  tabla([2200, 3800, 1300, 2780], [["Regla", "Descripción", "Afectados", "Acción"], ...CAL.reglas.filter(r => r.registros_afectados > 0 || r.regla === "Anonimización").map(r => [r.regla, r.descripcion, r.registros_afectados, r.regla === "Completitud" ? "Imputación en el pipeline del modelo (< 20 %)" : r.accion])], { size: 15 }),
  H2("Anexo E. Coeficientes del modelo de demostración (no publicable)"),
  tabla([5200, 1600, 1600, 1680], [["Variable", "Coeficiente (log-odds)", "Media", "Escala"], ...M.coeficientes.map(c => [c.variable, coma(c.coeficiente, 4), c.media === null ? "—" : coma(c.media, 2), c.escala === null ? "—" : coma(c.escala, 2)])], { size: 15 }),
  P(`Umbrales propuestos (13.6): amarillo desde ${pct(M.umbrales.amarillo)}; rojo desde ${pct(M.umbrales.rojo)}. Regularización C = ${M.C}.`, { before: 100 }),
];
const anexoFG = [
  H2("Anexo F. Cambios de la versión 1.2 del prototipo (27-oct-2026)"),
  tabla([2000, 8080], [["Módulo", "Cambio realizado"],
    ["General", "Ayuda contextual («?») para siglas y términos (p.p., DoD, DORA, UAT, recall, ventana completa); pantalla Glosario; enlace «Saltar al contenido» para teclado; filtros con nombres comprensibles y chips de filtros activos con personas analizadas y excluidas; mensajes de confirmación al quitar o restaurar datos; corrección de desbordes en tarjetas y en teléfono."],
    ["Panorama", "Lectura rápida en lenguaje sencillo («31 de cada 100»), aclarando que es una medición histórica y que no hay meta institucional documentada; cada indicador con nombre, valor, explicación y contexto; lectura de la cohorte más alta y más baja (solo cohortes con el mínimo de personas); tabla de quiénes entran en el análisis y quiénes se excluyen y por qué; costo expresado en millones."],
    ["Causas", "Ranking de factores (una fila por variable) con personas, renuncias, tasa, promedio, diferencia en p.p. y lectura (prioritario, leve, sin diferencia, no comparable); detalle con interpretación, recomendación y limitaciones; etiquetas que distinguen dato descriptivo, conclusión estadística, recomendación (hipótesis) y datos simulados."],
    ["Resumen y acciones", "Plan de acción por factor: hallazgo, evidencia, interpretación, recomendación, responsable sugerido (según los interesados del documento técnico), plazo sugerido, indicador de seguimiento y estado «Pendiente: sin seguimiento registrado». Las acciones se presentan como hipótesis."],
    ["Semáforo", "Mensaje del plan B más corto, con el motivo de no usar el modelo desplegable; tabla de las 4 condiciones evaluadas con el valor del candidato; cada regla activada con los datos que la justifican y su acción; lista de limitaciones."],
    ["Seguimiento", "Introducción de cada pestaña. Burndown: fecha de corte, criterios explícitos del estado y explicación de variaciones por sprint. DORA: valor observado «Sin datos disponibles», fecha de medición y «Pendiente de instrumentación». Rendimiento: tipo de medición (cálculo interno o experiencia completa en pantalla). Pruebas: conteos, filtros, datos de entrada, evidencia y tabla de UAT separada. Calidad: tratamiento y resultado de cada regla. Trazabilidad: RF → HU → CU → funcionalidad → pruebas → estado, con filtro por cobertura."],
    ["Simulador de escenarios (nuevo)", "Pantalla que aplica una meta de rotación elegida por el usuario a la población filtrada: renuncias estimadas = redondeo(N × meta); costo = renuncias × costo supuesto por reemplazo; diferencias frente a lo observado. Respeta los filtros y la definición de renuncia temprana; valida entradas; compara hasta 3 escenarios y copia la comparación en CSV. No modifica datos ni otros módulos y se presenta como escenario hipotético, no como ahorro garantizado."],
    ["Rediseño v1.3 (29-oct)", "Textos en lenguaje de Recursos Humanos (por ejemplo «Mes con más renuncias», «Restablecer filtros», «Datos que no se incluyeron»). Panorama con 4 indicadores clave, hallazgo principal generado con los datos filtrados y costo en una sección económica aparte. Filtros con nombres claros, «Opciones avanzadas» para el mínimo por grupo y aviso de filtros activos. Causas con títulos que dicen el resultado. Resumen con cuatro pasos por acción: qué encontramos, por qué importa, qué recomendamos y cómo verificarlo. Semáforo con la explicación de cada color. Seguimiento del proyecto separado en el menú, bajo «Equipo del proyecto». Títulos del proyecto Power BI alineados. Fórmulas sin cambios."],
    ["Simplificación v1.4 (29-oct)", "Divulgación progresiva en Panorama, Causas y Resumen y acciones: barra de filtros compacta con «Más opciones»; hallazgo principal en dos frases; definiciones, datos excluidos, método estadístico y explicación de las etiquetas en ayudas «?» y apartados desplegables; ranking de causas con menos columnas; perfiles más frecuentes y contraste de motivos integrados; cada acción muestra la recomendación y despliega el detalle en cuatro pasos. Resultado medido a 1360 px: Panorama de 523 a 415 palabras visibles, Causas de 995 a 740 y Resumen de 718 a 461; altura de Resumen de 1579 a 1068 px. Gráficos más altos (300 px). Fórmulas sin cambios."],
    ["Pruebas", "23 pruebas nuevas en total (PU-21 a PU-27 y PF-26 a PF-41). La medición de rendimiento del semáforo usa el semáforo oficial (plan B)."]], { size: 16 }),
  H2("Anexo G. Guía breve para presentar el sistema en clase (10 a 12 minutos)"),
  tabla([700, 2300, 7080], [["#", "Pantalla", "Qué mostrar y qué decir"],
    ["1", "Panorama (2 min)", "Leer la «Lectura rápida»: 31 de cada 100 personas renuncian antes de 180 días, sobre todo en el mes 2. Señalar la etiqueta de datos ficticios. Aplicar el filtro de campaña y mostrar que cambian los indicadores y los chips de filtros activos; luego «Limpiar filtros». Abrir «¿Quiénes entran en el análisis?»."],
    ["2", "Causas (2 min)", "Mostrar el ranking: distancia > 15 km y el supervisor SUP-03 encabezan la lista. Abrir «Ver detalle» y explicar «p.p.» con el botón «?». Subrayar que es asociación, no causalidad, y que SUP-15 no se compara por tener pocas personas. Mostrar la conclusión estadística de la prueba técnica."],
    ["3", "Resumen y acciones (1,5 min)", "Recorrer el factor 1: hallazgo, evidencia, recomendación, responsable sugerido e indicador de seguimiento. Aclarar que el estado es «Pendiente» porque no hay seguimiento real."],
    ["4", "Semáforo (2,5 min)", "Evaluar el candidato de ejemplo: rojo por dos reglas combinadas. Mostrar las condiciones evaluadas y las limitaciones (detecta 16 % de las renuncias). Explicar por qué el modelo no se usa (equidad) y mostrar el aviso de decisión humana. Probar un error: puntaje 120."],
    ["5", "Seguimiento (2,5 min)", "Burndown del proyecto: 43 de 69 puntos, Sprint 1 aceptado tarde (lectura honesta). DORA en «Sin despliegues medidos». Pruebas: " + PR.funcionales.length + " aprobadas y UAT pendiente. Trazabilidad filtrada por «Parcial» para mostrar lo que depende de datos simulados."],
    ["6", "Cierre (1 min)", "Pedir al cliente (profesor) que diligencie el acta de validación: 9 decisiones. Recordar que el proyecto no se declara cerrado hasta esa firma."]], { size: 16 }),
  nota([B("Antes de la demo. "), "Abrir prototipo/dist/index.html sin internet para comprobar que carga; tener a mano el acta impresa o en PDF; si se mostrará Power BI, abrir el .pbip en Windows con anticipación."]),
];
// Anexo A (horizontal)
const filasA = PR.funcionales.map(f => {
  const e = E2.resultados.find(x => x.id === f.id);
  return [f.id, f.cu, f.nombre, e ? e.precondiciones : (f.suite.startsWith("Pipeline") ? "Capa bronce ficticia disponible" : "Datos y modelo exportados al prototipo"), e ? e.entrada : "Ver nombre de la prueba",
    e ? e.pasos : (f.suite.startsWith("Pipeline") ? "python3 pruebas/test_pipeline.py" : "npm run test:unit"), f.esperado, f.observado, f.estado, (e && e.evidencia) ? "evidencias/capturas/" + e.evidencia : f.suite, ""];
});
const anexoA = [H1("Anexo A. Matriz de pruebas"),
  P(`Ejecución: ${PR.fecha}. Entorno: ${E2.entorno}. Observaciones generales: datos ficticios; la validación del cliente no está incluida.`, { size: 18 }),
  tabla([650, 900, 1500, 1350, 1350, 1450, 1700, 2400, 850, 1250], [["ID", "Caso de uso", "Prueba", "Precondiciones", "Datos de entrada", "Pasos", "Resultado esperado", "Resultado observado", "Estado", "Evidencia"], ...filasA.map(f => f.slice(0, 10))], { size: 13, estadoCol: 8, boldCol: 0 })];

// ================= DOCUMENTO =================
const VERT = { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } };
const HORZ = { page: { size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } };
const pie = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Radar de permanencia · Documento de cierre y estado de entrega · Página ", font: F, size: 16, color: GRIS }), new TextRun({ children: [PageNumber.CURRENT], font: F, size: 16, color: GRIS }), new TextRun({ text: " de ", font: F, size: 16, color: GRIS }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: F, size: 16, color: GRIS })] })] });
const cab = new Header({ children: [new Paragraph({ children: [new TextRun({ text: "Datos del dashboard y del modelo: ficticios de demostración", font: F, size: 15, color: "8A5A00" })], alignment: AlignmentType.RIGHT })] });
const doc = new Document({
  creator: "Equipo CoE de Datos", title: "Documento de cierre y estado de entrega — Radar de permanencia", description: "Cierre técnico de la entrega académica",
  styles: { default: { document: { run: { font: F, size: 20 } } },
    paragraphStyles: [{ id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: F, size: 30, bold: true, color: ACC }, paragraph: { outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: F, size: 24, bold: true }, paragraph: { outlineLevel: 1 } }] },
  numbering: { config: [
    { reference: "vinetas", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }, { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 800, hanging: 260 } } } }] },
    { reference: "numeros", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] }] },
  sections: [
    { properties: VERT, children: portada },
    { properties: VERT, headers: { default: cab }, footers: { default: pie }, children: [...contenido, ...s2a5] },
    { properties: HORZ, headers: { default: cab }, footers: { default: pie }, children: [...s6, new Paragraph({ children: [new PageBreak()] }), ...s7, ...s8, new Paragraph({ children: [new PageBreak()] }), ...s9] },
    { properties: VERT, headers: { default: cab }, footers: { default: pie }, children: [...s10, ...s11, ...s12, ...s13, ...s14, ...s15, ...s16, ...s17, ...s18, ...s19, ...s20, ...anexoFG] },
    { properties: HORZ, headers: { default: cab }, footers: { default: pie }, children: anexoA },
  ],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(path.join(R, "documentacion", "documento_cierre.docx"), b); console.log("ok", b.length); });
