// Genera documentacion/cumplimiento_ley_1581.docx y documentacion/acta_validacion_cliente.docx
const fs = require("fs"), path = require("path");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, HeadingLevel, Footer, PageNumber, LevelFormat, BorderStyle, TableLayoutType } = require("docx");
const R = path.join(__dirname, "..");
const M = JSON.parse(fs.readFileSync(path.join(R, "datos_demo/modelo/ficha_modelo.json"), "utf8"));
const F = "Arial", ACC = "1D5C63", GRIS = "485956";
const run = (t, o = {}) => new TextRun({ text: t, font: F, size: o.size ?? 20, bold: o.bold, italics: o.italics, color: o.color });
const P = (t, o = {}) => new Paragraph({ children: (Array.isArray(t) ? t : [t]).map(x => typeof x === "string" ? run(x, o) : x), spacing: { after: o.after ?? 120, line: 276 }, alignment: o.align });
const B = t => run(t, { bold: true });
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: F, size: 28, bold: true, color: ACC })], spacing: { before: 240, after: 120 }, keepNext: true });
const LI = t => new Paragraph({ numbering: { reference: "v", level: 0 }, children: (Array.isArray(t) ? t : [t]).map(x => typeof x === "string" ? run(x) : x), spacing: { after: 60 } });
const b = { style: BorderStyle.SINGLE, size: 4, color: "B9C3C0" };
function tabla(anchos, filas, size = 17) {
  return new Table({ width: { size: anchos.reduce((a, c) => a + c, 0), type: WidthType.DXA }, columnWidths: anchos, layout: TableLayoutType.FIXED, rows: filas.map((f, i) => new TableRow({ tableHeader: i === 0, cantSplit: true, children: f.map((c, j) => new TableCell({
    width: { size: anchos[j], type: WidthType.DXA }, borders: { top: b, bottom: b, left: b, right: b }, margins: { top: 50, bottom: 50, left: 80, right: 80 },
    shading: { fill: i === 0 ? ACC : i % 2 ? "FFFFFF" : "F6F7F6", type: ShadingType.CLEAR, color: "auto" },
    children: String(c).split("\n").map(l => new Paragraph({ children: [new TextRun({ text: l, font: F, size, bold: i === 0, color: i === 0 ? "FFFFFF" : "142321" })], spacing: { after: 20 } })) })) })) });
}
const nota = t => new Paragraph({ children: (Array.isArray(t) ? t : [t]).map(x => typeof x === "string" ? run(x, { size: 19 }) : x), shading: { fill: "FFF4D9", type: ShadingType.CLEAR, color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: "8A5A00", space: 6 } }, spacing: { before: 80, after: 160 }, indent: { left: 120, right: 120 } });
const pie = titulo => new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`Radar de permanencia · ${titulo} · Página `, { size: 16, color: GRIS }), new TextRun({ children: [PageNumber.CURRENT], font: F, size: 16, color: GRIS })] })] });
const base = (titulo, hijos) => new Document({ creator: "Equipo CoE de Datos", title: titulo, styles: { default: { document: { run: { font: F, size: 20 } } } },
  numbering: { config: [{ reference: "v", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, footers: { default: pie(titulo) }, children: hijos }] });
const portada = (titulo, sub) => [P("Universidad Católica Luis Amigó · Equipo CoE de Datos · Caso 4: People Analytics", { color: GRIS, size: 19 }),
  new Paragraph({ children: [new TextRun({ text: titulo, font: F, size: 40, bold: true, color: ACC })], spacing: { before: 200, after: 120 } }), P(sub, { size: 22, color: GRIS, after: 240 })];

// ============================================================ Cumplimiento Ley 1581
const brB = M.evaluacion_ampliada.plan_b_brechas;
const cumpl = base("Cumplimiento Ley 1581 de 2012", [
  ...portada("Documento de cumplimiento — Tratamiento de datos personales", "Radar de permanencia · Ley 1581 de 2012 y Decreto 1377 de 2013 · Versión 1.0 · 27 de octubre de 2026"),
  nota([B("Alcance y advertencia. "), "Este documento describe cómo el diseño técnico de Radar de permanencia aplica la Ley 1581 de 2012 y su reglamentación. Lo elaboró el equipo del proyecto con fines académicos; no es una opinión jurídica y debe ser revisado por el área legal del cliente antes de tratar datos reales. En esta entrega solo se trataron datos ficticios."]),
  H1("1. Objeto"),
  P("Documentar las medidas con las que la solución trata los datos de empleados y candidatos de un call center BPO para analizar la rotación temprana y apoyar decisiones de contratación, conforme a la Ley Estatutaria 1581 de 2012 (protección de datos personales) y al Decreto 1377 de 2013, compilado en el Decreto Único Reglamentario 1074 de 2015. Responde al criterio de aceptación de HU-16 y al requisito RNF-03."),
  H1("2. Roles"),
  tabla([2600, 7480], [["Rol", "Quién y qué le corresponde"],
    ["Responsable del tratamiento", "La empresa cliente (área de Recursos Humanos). Debe contar con la autorización previa, expresa e informada de los titulares, tener una política de tratamiento y, si está obligada, inscribir sus bases de datos en el Registro Nacional de Bases de Datos de la Superintendencia de Industria y Comercio."],
    ["Encargado del tratamiento", "El equipo CoE de Datos, que trata los datos por cuenta del responsable y solo para la finalidad del proyecto, con los deberes de seguridad y confidencialidad del encargado."],
    ["Titulares", "Empleados contratados y candidatos evaluados con el semáforo."]]),
  H1("3. Datos tratados y finalidad"),
  tabla([2600, 4200, 3280], [["Grupo de datos", "Ejemplos", "Tratamiento en la solución"],
    ["Identificación", "Nombre, número de documento, código de empleado", "Se eliminan o se reemplazan por un hash SHA-256 con sal en la capa plata; no llegan a la capa oro ni al dashboard."],
    ["Laborales y de selección", "Fecha de ingreso y retiro, campaña, turno, supervisor, distancia, experiencia, nivel educativo, canal, puntaje", "Se usan agregados en el dashboard; solo las variables previas a la contratación entran al semáforo."],
    ["Atributos usados solo para auditar equidad", "Edad, sexo, estado civil, estrato", "Nunca entran al semáforo. Se usan únicamente para medir si la herramienta se equivoca más con un grupo que con otro."],
    ["Datos del candidato en el semáforo", "Campaña, turno, distancia, experiencia, educación, canal, puntaje", "Se procesan en memoria y no se almacenan."]], 16),
  P([B("Finalidad. "), "Explicar las causas de la rotación temprana y apoyar, con una estimación explicable, la decisión de contratación. Los datos no se usan para otra finalidad."], { after: 80 }),
  P([B("Datos sensibles. "), "La solución no recolecta datos sensibles en el sentido del artículo 5 de la Ley 1581 (origen racial o étnico, orientación política, convicciones religiosas, salud, vida sexual, datos biométricos, entre otros). Edad, sexo, estado civil y estrato se tratan con cuidado adicional por razones de equidad, aunque no estén en esa lista."]),
  H1("4. Principios del artículo 4 y cómo se aplican"),
  tabla([2300, 5480, 2300], [["Principio", "Medida en Radar de permanencia", "Evidencia"],
    ["Legalidad", "El tratamiento se ajusta a la Ley 1581 y al Decreto 1377; este documento lo registra.", "Este documento"],
    ["Finalidad", "Uso limitado al análisis de rotación y al apoyo de contratación (sección 3).", "Documento técnico, secc. 2 y 3"],
    ["Libertad", "El cliente debe tener la autorización previa, expresa e informada de los titulares (supuesto S-16).", "Pendiente: confirmación del cliente"],
    ["Veracidad o calidad", "Reglas de calidad: unicidad, integridad, fechas coherentes, dominios y nulos documentados.", "PT-08-01 a PT-08-04; reporte de calidad"],
    ["Transparencia", "Modelo interpretable; cada resultado del semáforo muestra las reglas o factores que lo explican.", "PF-13, PF-19"],
    ["Acceso y circulación restringida", "Datos en carpeta de Drive restringida, nunca en GitHub; roles en Power BI (RLS) que limitan lo que ve cada área.", "model.bim (roles); .gitignore"],
    ["Seguridad", "Anonimización con hash y sal guardada fuera del repositorio; minimización por capa.", "PT-08-05"],
    ["Confidencialidad", "El dashboard muestra solo datos agregados; los grupos pequeños no se comparan para evitar reidentificación.", "PU-16, PF-07"]], 16),
  H1("5. Medidas técnicas"),
  ...["Anonimización con SHA-256 y sal secreta en la capa plata (sección 12.2). La sal se define por variable de entorno y nunca se guarda en el código.",
    "Minimización: cada capa conserva solo las variables necesarias; el archivo que usa el dashboard no tiene identificadores (prueba PU-16).",
    "Grupos con menos de 30 personas aparecen en gris y no se comparan (prueba PF-07).",
    "El semáforo no almacena los datos ingresados: tras recargar no queda rastro en el navegador (prueba PF-18).",
    "Seguridad por roles en Power BI: «Gerencia RR. HH.» ve todo; «Operaciones» ve solo su campaña.",
    "Exclusión de variables sensibles y de sus aproximaciones en el semáforo; asociación máxima entre una entrada y un atributo sensible: V de Cramér = " + M.proxy_max[0].v_cramer + " (límite 0,5).",
    "Revisión de equidad antes de publicar: el modelo de regresión no se publicó por no cumplirla; las reglas del plan B la cumplen (brecha máxima " + Math.max(...brB.map(x => Math.max(x.brecha_recall_pp, x.brecha_fp_pp))).toFixed(1).replace(".", ",") + " p.p.)."].map(t => LI(t)),
  H1("6. Derechos de los titulares (artículo 8)"),
  P("Los titulares pueden conocer, actualizar y rectificar sus datos, solicitar prueba de la autorización, ser informados del uso, presentar quejas ante la Superintendencia de Industria y Comercio y revocar la autorización o pedir la supresión cuando proceda. Como la solución trabaja con datos anonimizados, las solicitudes se atienden en las fuentes del responsable (nómina, reclutamiento) y se reflejan en la siguiente carga de datos. El equipo informará al responsable cualquier solicitud que reciba."),
  H1("7. Decisiones sobre candidatos"),
  P("El semáforo no toma decisiones automáticas. Cada resultado muestra el aviso «La herramienta apoya la decisión; la decisión final corresponde al reclutador» y se orienta a acciones de acompañamiento, no solo al rechazo de candidatos (principio de proporcionalidad, sección 16.3 del documento técnico)."),
  H1("8. Conservación y supresión"),
  P("Los exportes de la capa bronce se conservan en la carpeta restringida solo durante el proyecto. Al cierre, el equipo devolverá o eliminará los datos según indique el responsable y dejará constancia escrita. La sal de anonimización se destruye junto con los datos."),
  H1("9. Pendientes del responsable (cliente)"),
  ...["Confirmar que cuenta con la autorización de los titulares para esta finalidad (supuesto S-16).", "Compartir su política de tratamiento de datos y, si aplica, la inscripción de la base en el Registro Nacional de Bases de Datos.",
    "Aprobar los roles de acceso del informe de Power BI.", "Indicar si los datos deben devolverse o eliminarse al cierre."].map(t => LI(t)),
  P(""), tabla([3360, 3360, 3360], [["Elaboró", "Revisó (área legal del cliente)", "Aprobó (Product Owner)"], ["\n\nNombre y firma", "\n\nNombre y firma", "\n\nNombre y firma"]]),
]);

// ============================================================ Acta de validación
const acta = base("Acta de validación del cliente", [
  ...portada("Acta de validación del cliente — Sprint Review y demo final", "Radar de permanencia · Formato para diligenciar en la reunión con el cliente"),
  nota([B("Este formato está en blanco a propósito. "), "La validación del cliente solo existe cuando el cliente (en el contexto académico, el profesor) revisa la demo y firma. El equipo no debe diligenciar las decisiones ni las firmas por su cuenta."]),
  tabla([2600, 7480], [["Campo", "Valor"], ["Fecha", ""], ["Lugar o enlace", ""], ["Cliente (nombre y cargo)", ""], ["Equipo presente", ""], ["Versión revisada", "Prototipo web, proyecto Power BI y documento de cierre del 27-oct-2026"]]),
  H1("1. Revisión de historias de usuario"),
  P("Marque una opción por historia: A = acepta, O = acepta con observaciones, R = rechaza.", { size: 18, color: GRIS }),
  tabla([900, 3800, 1100, 4280], [["HU", "Historia", "A / O / R", "Observaciones"],
    ...[["HU-01", "Información unificada y confiable"], ["HU-02", "Definición única de renuncia temprana"], ["HU-03", "Evolución de la rotación temprana"], ["HU-04", "Mes crítico de renuncia"],
      ["HU-05", "Costo de la rotación temprana"], ["HU-06", "Filtrar el dashboard"], ["HU-07", "Retención por supervisor"], ["HU-08", "Pruebas técnicas y permanencia"], ["HU-09", "Perfiles con mayor rotación"],
      ["HU-10", "Motivos declarados de renuncia"], ["HU-11", "Resumen de causas y recomendaciones"], ["HU-12", "Semáforo de riesgo del candidato"], ["HU-13", "Explicación del riesgo"],
      ["HU-14", "Confiabilidad de la herramienta"], ["HU-15", "Herramienta no discriminatoria"], ["HU-16", "Protección de datos personales"]].map(([a, c]) => [a, c, "", ""])], 16),
  H1("2. Decisiones que corresponden al cliente"),
  tabla([600, 5600, 1500, 2380], [["#", "Decisión", "Propuesta del equipo", "Decisión del cliente"],
    ["1", "¿Acepta los datos simulados (sección 4.2) como base de la entrega académica?", "Sí", ""],
    ["2", "¿Los despidos se muestran aparte y no cuentan como rotación temprana?", "Sí", ""],
    ["3", "Mínimo de personas para comparar un grupo", "30", ""],
    ["4", "Supuestos de costo por reemplazo (reclutamiento + formación + tiempo improductivo)", "COP 2.550.000", ""],
    ["5", "Meta de recall del modelo predictivo", "≥ 0,60", ""],
    ["6", "Diferencia máxima de recall y falsos positivos entre grupos", "≤ 10 p.p.", ""],
    ["7", "¿Acepta el plan B (reglas de alerta) como semáforo oficial mientras el modelo no cumpla la meta y la equidad?", "Sí", ""],
    ["8", "Reglas del plan B: rojo si distancia > 15 km con turno nocturno o rotativo, o sin experiencia con puntaje < 60; amarillo si solo un factor", "Como se describe", ""],
    ["9", "¿Las recomendaciones del resumen son accionables para la empresa (S-05)?", "Sí", ""]], 16),
  H1("3. Observaciones generales"), P("\n\n\n"),
  H1("4. Resultado"),
  P("☐ Se acepta la entrega   ☐ Se acepta con observaciones   ☐ No se acepta", { size: 21 }),
  P(""), tabla([3360, 3360, 3360], [["Cliente", "Product Owner", "Scrum Master"], ["\n\nNombre y firma", "\n\nNombre y firma", "\n\nNombre y firma"]]),
]);
Promise.all([Packer.toBuffer(cumpl), Packer.toBuffer(acta)]).then(([a, c]) => {
  fs.writeFileSync(path.join(R, "documentacion", "cumplimiento_ley_1581.docx"), a);
  fs.writeFileSync(path.join(R, "documentacion", "acta_validacion_cliente.docx"), c); console.log("ok");
});
