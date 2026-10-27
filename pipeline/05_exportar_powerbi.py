"""
Radar de permanencia - Proyecto de Power BI (formato PBIP) generado desde la capa oro.
Salida: powerbi/
  datos/                       CSV del modelo estrella (capa oro) + coeficientes, umbrales y costos
  Radar_de_permanencia.pbip    abrir con Power BI Desktop (Windows)
  Radar_de_permanencia.SemanticModel/model.bim   tablas, relaciones, medidas DAX, roles (RLS)
  Radar_de_permanencia.Report/report.json        4 páginas: Panorama, Causas, Resumen y acciones, Semáforo
  medidas.dax                  todas las medidas, para armar el informe a mano si hiciera falta
Implementa las secciones 9.4, 10.3, 13.9 y 14 del documento técnico. Datos ficticios (sección 4.2).
"""
import json, os, shutil, uuid
import pandas as pd

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(R, "powerbi"); DAT = os.path.join(OUT, "datos")
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(DAT)
NOMBRE = "Radar_de_permanencia"
ficha = json.load(open(os.path.join(R, "datos_demo", "modelo", "ficha_modelo.json")))

# ------------------------------------------------------------------ CSV (modelo estrella)
f = pd.read_csv(os.path.join(R, "datos_demo", "oro", "fact_contrataciones.csv"))
f = f.drop(columns=["id_empleado"])  # RF-18: el informe no necesita el identificador
f["mes_antiguedad_retiro"] = f["mes_antiguedad_retiro"].astype("Int64")
f.to_csv(os.path.join(DAT, "fact_contrataciones.csv"), index=False)
coh = pd.DataFrame({"cohorte_ingreso": sorted(f["cohorte_ingreso"].unique())})
coh["anio"] = coh["cohorte_ingreso"].str[:4].astype(int); coh["mes"] = coh["cohorte_ingreso"].str[5:7].astype(int)
coh["ventana_completa"] = coh["cohorte_ingreso"].isin(f.loc[f["ventana_observada"], "cohorte_ingreso"])
coh.to_csv(os.path.join(DAT, "dim_cohorte.csv"), index=False)
sup = f.groupby("id_supervisor")["campana"].agg(lambda s: s.mode()[0]).reset_index(); sup.to_csv(os.path.join(DAT, "dim_supervisor.csv"), index=False)
pd.DataFrame({"campana": sorted(f["campana"].unique())}).to_csv(os.path.join(DAT, "dim_campana.csv"), index=False)
pd.DataFrame({"mes": [1, 2, 3, 4, 5, 6], "etiqueta": [f"Mes {i}" for i in range(1, 7)]}).to_csv(os.path.join(DAT, "dim_mes_antiguedad.csv"), index=False)
shutil.copy(os.path.join(R, "datos_demo", "oro", "dim_costos.csv"), DAT)
for n in ["coeficientes.csv", "umbrales.csv", "metricas.csv"]:
    shutil.copy(os.path.join(R, "datos_demo", "modelo", n), DAT)

# ------------------------------------------------------------------ Modelo semántico (TMSL / model.bim)
def m_csv(archivo, tipos):
    t = ", ".join(f'{{"{c}", {ty}}}' for c, ty in tipos)
    return ["let",
            f'    Origen = Csv.Document(File.Contents(RutaDatos & "{archivo}"), [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),',
            "    Encabezados = Table.PromoteHeaders(Origen, [PromoteAllScalars = true]),",
            f'    Tipos = Table.TransformColumnTypes(Encabezados, {{{t}}}, "en-US")',
            "in", "    Tipos"]
MT = {"text": ("string", "type text"), "int": ("int64", "Int64.Type"), "dec": ("double", "type number"), "bool": ("boolean", "type logical")}
def tabla(nombre, archivo, cols, ocultas=(), extra=None):
    t = {"name": nombre, "columns": [], "partitions": [{"name": nombre, "mode": "import", "source": {"type": "m", "expression": m_csv(archivo, [(c, MT[k][1]) for c, k in cols])}}]}
    for c, k in cols:
        col = {"name": c, "dataType": MT[k][0], "sourceColumn": c, "summarizeBy": "none"}
        if c in ocultas: col["isHidden"] = True
        t["columns"].append(col)
    if extra: t.update(extra)
    return t

fact_cols = [("cohorte_ingreso", "text"), ("fecha_ingreso", "text"), ("campana", "text"), ("turno", "text"), ("id_supervisor", "text"), ("distancia_km", "dec"),
             ("experiencia_previa_meses", "dec"), ("nivel_educativo", "text"), ("canal_reclutamiento", "text"), ("puntaje_prueba_tecnica", "dec"),
             ("rango_puntaje", "text"), ("rango_distancia", "text"), ("rango_experiencia", "text"), ("ventana_observada", "bool"), ("renuncia_temprana", "int"),
             ("despido_temprano", "int"), ("mes_antiguedad_retiro", "int"), ("antiguedad_dias", "int"), ("motivo_retiro", "text")]
tablas = [
    tabla("fact_contrataciones", "fact_contrataciones.csv", fact_cols, ocultas=("fecha_ingreso", "antiguedad_dias", "renuncia_temprana", "despido_temprano", "ventana_observada")),
    tabla("dim_cohorte", "dim_cohorte.csv", [("cohorte_ingreso", "text"), ("anio", "int"), ("mes", "int"), ("ventana_completa", "bool")]),
    tabla("dim_supervisor", "dim_supervisor.csv", [("id_supervisor", "text"), ("campana", "text")]),
    tabla("dim_campana", "dim_campana.csv", [("campana", "text")]),
    tabla("dim_mes_antiguedad", "dim_mes_antiguedad.csv", [("mes", "int"), ("etiqueta", "text")]),
    tabla("dim_costos", "dim_costos.csv", [("costo_reclutamiento", "dec"), ("costo_formacion", "dec"), ("costo_tiempo_improductivo", "dec"), ("fuente", "text")]),
]
# Orden de rangos
for t in tablas:
    if t["name"] == "dim_mes_antiguedad":
        for c in t["columns"]:
            if c["name"] == "etiqueta": c["sortByColumn"] = "mes"

def calc(nombre, expr, cols, oculta=False):
    return {"name": nombre, "isHidden": oculta, "columns": [{"name": c, "dataType": dt, "type": "calculatedTableColumn", "sourceColumn": f"[{src}]", "isNameInferred": True, "summarizeBy": "none"} for c, dt, src in cols],
            "partitions": [{"name": nombre, "mode": "import", "source": {"type": "calculated", "expression": expr}}]}
# Entradas del semáforo (tablas desconectadas = parámetros del formulario, sección 10.3)
tablas += [
    calc("Entrada Campaña", 'SELECTCOLUMNS(DISTINCT(dim_campana[campana]), "campana", dim_campana[campana])', [("campana", "string", "campana")]),
    calc("Entrada Turno", 'DATATABLE("Turno", STRING, {{"Mañana"}, {"Tarde"}, {"Noche"}, {"Rotativo"}})', [("Turno", "string", "Turno")]),
    calc("Entrada Nivel educativo", 'DATATABLE("Nivel educativo", STRING, {{"Bachiller"}, {"Técnico"}, {"Tecnólogo"}, {"Profesional"}})', [("Nivel educativo", "string", "Nivel educativo")]),
    calc("Entrada Canal", 'DATATABLE("Canal", STRING, {{"Referido"}, {"Portal de empleo"}, {"Redes sociales"}, {"Feria"}})', [("Canal", "string", "Canal")]),
    calc("Entrada Distancia", 'SELECTCOLUMNS(GENERATESERIES(0, 100, 1), "Distancia km", [Value])', [("Distancia km", "int64", "Distancia km")]),
    calc("Entrada Experiencia", 'SELECTCOLUMNS(GENERATESERIES(0, 120, 1), "Experiencia meses", [Value])', [("Experiencia meses", "int64", "Experiencia meses")]),
    calc("Entrada Puntaje", 'SELECTCOLUMNS(GENERATESERIES(0, 100, 1), "Puntaje", [Value])', [("Puntaje", "int64", "Puntaje")]),
]

# ------------------------------------------------------------------ Medidas DAX
VF = "fact_contrataciones[ventana_observada] = TRUE()"
co = {c["variable"]: c for c in ficha["coeficientes"]}
def num(v): return f"{v:.10f}"
def sw(var, campo):
    items = [(k.split("=", 1)[1], c["coeficiente"]) for k, c in co.items() if k.startswith(campo + "=")]
    return f"SWITCH({var}, " + ", ".join(f'"{a}", {num(b)}' for a, b in items) + ", 0)"
z = (f"{num(co['intercepto']['coeficiente'])}"
     f" + {num(co['distancia_km']['coeficiente'])} * (d - {num(co['distancia_km']['media'])}) / {num(co['distancia_km']['escala'])}"
     f" + {num(co['experiencia_previa_meses']['coeficiente'])} * (e - {num(co['experiencia_previa_meses']['media'])}) / {num(co['experiencia_previa_meses']['escala'])}"
     f" + {num(co['puntaje_prueba_tecnica']['coeficiente'])} * (p - {num(co['puntaje_prueba_tecnica']['media'])}) / {num(co['puntaje_prueba_tecnica']['escala'])}"
     f" + {sw('t', 'turno')} + {sw('n', 'nivel_educativo')} + {sw('c', 'canal_reclutamiento')} + {sw('k', 'campana')}")
EA = ficha["evaluacion_ampliada"]; UMB = ficha["umbrales"]
ENTR = '''VAR d = SELECTEDVALUE('Entrada Distancia'[Distancia km])
VAR e = SELECTEDVALUE('Entrada Experiencia'[Experiencia meses])
VAR p = SELECTEDVALUE('Entrada Puntaje'[Puntaje])
VAR t = SELECTEDVALUE('Entrada Turno'[Turno])
VAR n = SELECTEDVALUE('Entrada Nivel educativo'[Nivel educativo])
VAR c = SELECTEDVALUE('Entrada Canal'[Canal])
VAR k = SELECTEDVALUE('Entrada Campaña'[campana])
VAR completo = NOT ISBLANK(d) && NOT ISBLANK(e) && NOT ISBLANK(p) && NOT ISBLANK(t) && NOT ISBLANK(n) && NOT ISBLANK(c) && NOT ISBLANK(k)'''
MED = [
    ("Contratados", f"CALCULATE(COUNTROWS(fact_contrataciones), {VF})", "#,0", "Panorama"),
    ("Renuncias tempranas", f"CALCULATE(SUM(fact_contrataciones[renuncia_temprana]), {VF})", "#,0", "Panorama"),
    ("Despidos tempranos", f"CALCULATE(SUM(fact_contrataciones[despido_temprano]), {VF})", "#,0", "Panorama"),
    ("Tasa rotación temprana", "DIVIDE([Renuncias tempranas], [Contratados])", "0.0 %", "Panorama"),
    ("Mes crítico", "VAR t = ADDCOLUMNS(VALUES(dim_mes_antiguedad[mes]), \"@r\", [Renuncias tempranas])\nVAR top = TOPN(1, FILTER(t, [@r] > 0), [@r], DESC, dim_mes_antiguedad[mes], ASC)\nRETURN IF(ISEMPTY(top), BLANK(), \"Mes \" & MAXX(top, dim_mes_antiguedad[mes]))", None, "Panorama"),
    ("Costo por reemplazo", "SUM(dim_costos[costo_reclutamiento]) + SUM(dim_costos[costo_formacion]) + SUM(dim_costos[costo_tiempo_improductivo])", "\\$ #,0", "Panorama"),
    ("Costo estimado", "IF(ISBLANK([Costo por reemplazo]), BLANK(), [Renuncias tempranas] * [Costo por reemplazo])", "\\$ #,0", "Panorama"),
    ("Tasa promedio de la selección", "CALCULATE([Tasa rotación temprana], ALLSELECTED(fact_contrataciones))", "0.0 %", "Causas"),
    ("Diferencia vs. promedio", "[Tasa rotación temprana] - [Tasa promedio de la selección]", "+0.0 %;-0.0 %", "Causas"),
    ("Tasa (grupos comparables)", "IF([Contratados] >= 30, [Tasa rotación temprana])", "0.0 %", "Causas"),
    ("Grupo comparable", "IF([Contratados] >= 30, \"Sí\", \"No (n < 30)\")", None, "Causas"),
    ("Renuncias con motivo", "CALCULATE([Renuncias tempranas], NOT ISBLANK(fact_contrataciones[motivo_retiro]))", "#,0", "Causas"),
    ("% del motivo", "DIVIDE([Renuncias con motivo], CALCULATE([Renuncias con motivo], ALLSELECTED(fact_contrataciones[motivo_retiro])))", "0.0 %", "Causas"),
    ("Semáforo (plan B)", ENTR + "\nVAR comb = (d > 15 && t IN {\"Noche\", \"Rotativo\"}) || (e = 0 && p < 60)\nRETURN IF(NOT completo, \"Seleccione un valor en cada campo\", IF(comb, \"ROJO · riesgo alto\", IF(d > 15 || e = 0, \"AMARILLO · riesgo medio\", \"VERDE · riesgo bajo\")))", None, "Semáforo"),
    ("Reglas activadas", ENTR + "\nVAR r1 = IF(d > 15 && t IN {\"Noche\", \"Rotativo\"}, \"Distancia > 15 km y turno nocturno o rotativo. \")\nVAR r2 = IF(e = 0 && p < 60, \"Sin experiencia y puntaje < 60. \")\nVAR r3 = IF(d > 15 && NOT (t IN {\"Noche\", \"Rotativo\"}), \"Distancia > 15 km. \")\nVAR r4 = IF(e = 0 && p >= 60, \"Sin experiencia previa. \")\nRETURN IF(NOT completo, BLANK(), COALESCE(r1 & r2 & r3 & r4, \"Ninguna regla activada.\"))", None, "Semáforo"),
    ("Acción sugerida", ENTR + "\nRETURN IF(NOT completo, BLANK(), IF(d > 15, \"Informar el auxilio de transporte y explorar un turno compatible. \") & IF(t IN {\"Noche\", \"Rotativo\"}, \"Explicar las condiciones del turno. \") & IF(e = 0, \"Asignar mentor durante los primeros 60 días. \") & IF(p < 60, \"Ofrecer nivelación técnica.\"))", None, "Semáforo"),
    ("Probabilidad modelo (no publicado)", ENTR + f"\nVAR z = {z}\nRETURN IF(completo, 1 / (1 + EXP(-z)))", "0.0 %", "Semáforo"),
    ("Recall plan B", num(EA["plan_b"]["recall"]), "0 %", "Semáforo"),
    ("Precisión plan B", num(EA["plan_b"]["precision"]), "0 %", "Semáforo"),
    ("Falsas alarmas plan B", str(EA["plan_b"]["fp"]), "#,0", "Semáforo"),
    ("Brecha máxima de equidad plan B (p.p.)", num(max(max(b["brecha_recall_pp"], b["brecha_fp_pp"]) for b in EA["plan_b_brechas"])), "0.0", "Semáforo"),
    ("Aviso decisión humana", "\"La herramienta apoya la decisión; la decisión final corresponde al reclutador.\"", None, "Semáforo"),
]
medidas_tabla = calc("Medidas", 'ROW("x", "")', [("x", "string", "x")])
medidas_tabla["columns"][0]["isHidden"] = True
medidas_tabla["measures"] = [dict({"name": n, "expression": e.split("\n") if "\n" in e else e, "displayFolder": fo}, **({"formatString": fs} if fs else {})) for n, e, fs, fo in MED]
tablas.append(medidas_tabla)

modelo = {"name": NOMBRE, "compatibilityLevel": 1567, "model": {
    "culture": "es-CO", "defaultPowerBIDataSourceVersion": "powerBI_V3", "sourceQueryCulture": "es-CO",
    "dataAccessOptions": {"legacyRedirects": True, "returnErrorValuesAsNull": True},
    "tables": tablas,
    "relationships": [
        {"name": "r_cohorte", "fromTable": "fact_contrataciones", "fromColumn": "cohorte_ingreso", "toTable": "dim_cohorte", "toColumn": "cohorte_ingreso"},
        {"name": "r_supervisor", "fromTable": "fact_contrataciones", "fromColumn": "id_supervisor", "toTable": "dim_supervisor", "toColumn": "id_supervisor"},
        {"name": "r_campana", "fromTable": "fact_contrataciones", "fromColumn": "campana", "toTable": "dim_campana", "toColumn": "campana"},
        {"name": "r_mes", "fromTable": "fact_contrataciones", "fromColumn": "mes_antiguedad_retiro", "toTable": "dim_mes_antiguedad", "toColumn": "mes"},
    ],
    # HU-16: acceso por roles (Row-Level Security). El informe solo muestra datos agregados.
    "roles": [
        {"name": "Gerencia RR. HH.", "modelPermission": "read"},
        {"name": "Operaciones - Campaña A", "modelPermission": "read", "tablePermissions": [{"name": "dim_campana", "filterExpression": "[campana] = \"Campaña A · Telecomunicaciones\""}]},
        {"name": "Operaciones - Campaña B", "modelPermission": "read", "tablePermissions": [{"name": "dim_campana", "filterExpression": "[campana] = \"Campaña B · Banca\""}]},
    ],
    "expressions": [{"name": "RutaDatos", "kind": "m", "expression": ['"C:\\RadarPermanencia\\powerbi\\datos\\" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]'],
                     "annotations": [{"name": "PBI_ResultType", "value": "Text"}]}],
    "annotations": [{"name": "__PBI_TimeIntelligenceEnabled", "value": "0"}],
}}
SM = os.path.join(OUT, f"{NOMBRE}.SemanticModel"); os.makedirs(SM)
json.dump(modelo, open(os.path.join(SM, "model.bim"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump({"version": "1.0", "settings": {}}, open(os.path.join(SM, "definition.pbism"), "w"), indent=2)

# ------------------------------------------------------------------ Informe (report.json)
def qref(ent, prop, medida):
    return f"{ent}.{prop}", ({"Measure" if medida else "Column": {"Expression": {"SourceRef": {"Source": ent[:1].lower() + str(abs(hash(ent)) % 97)}}, "Property": prop}, "Name": f"{ent}.{prop}"})
def visual(tipo, x, y, w, h, roles, titulo=None, objetos=None):
    froms, selects, proj = {}, [], {}
    for rol, campos in roles.items():
        proj[rol] = []
        for ent, prop, medida in campos:
            src = ent[:1].lower() + str(abs(hash(ent)) % 97); froms[src] = {"Name": src, "Entity": ent, "Type": 0}
            name = f"{ent}.{prop}"
            sel = {("Measure" if medida else "Column"): {"Expression": {"SourceRef": {"Source": src}}, "Property": prop}, "Name": name}
            if sel not in selects: selects.append(sel)
            proj[rol].append({"queryRef": name, **({} if medida else {"active": True})})
    sv = {"visualType": tipo, "projections": proj, "prototypeQuery": {"Version": 2, "From": list(froms.values()), "Select": selects}, "drillFilterOtherVisuals": True}
    if objetos: sv["objects"] = objetos
    if titulo: sv["vcObjects"] = {"title": [{"properties": {"show": {"expr": {"Literal": {"Value": "true"}}}, "text": {"expr": {"Literal": {"Value": "'" + titulo.replace("'", "''") + "'"}}}}}]}
    name = uuid.uuid4().hex[:20]
    cfg = {"name": name, "layouts": [{"id": 0, "position": {"x": x, "y": y, "z": 0, "width": w, "height": h}}], "singleVisual": sv}
    return {"x": x, "y": y, "z": 0, "width": w, "height": h, "config": json.dumps(cfg, ensure_ascii=False), "filters": "[]"}
def texto(x, y, w, h, lineas):
    pars = [{"textRuns": [{"value": t, "textStyle": ({"fontWeight": "bold", "fontSize": "18pt"} if i == 0 else {"fontSize": "10pt"})}]} for i, t in enumerate(lineas)]
    cfg = {"name": uuid.uuid4().hex[:20], "layouts": [{"id": 0, "position": {"x": x, "y": y, "z": 0, "width": w, "height": h}}],
           "singleVisual": {"visualType": "textbox", "drillFilterOtherVisuals": True, "objects": {"general": [{"properties": {"paragraphs": pars}}]}}}
    return {"x": x, "y": y, "z": 0, "width": w, "height": h, "config": json.dumps(cfg, ensure_ascii=False), "filters": "[]"}
M = lambda p: ("Medidas", p, True)
C = lambda t, p: (t, p, False)
UNO = {"selection": [{"properties": {"singleSelect": {"expr": {"Literal": {"Value": "true"}}}}}],
       "data": [{"properties": {"mode": {"expr": {"Literal": {"Value": "'Dropdown'"}}}}}]}
def filtros(y=70):
    return [visual("slicer", 20, y, 300, 60, {"Values": [C("dim_cohorte", "cohorte_ingreso")]}, "Cohorte de ingreso"),
            visual("slicer", 330, y, 300, 60, {"Values": [C("dim_campana", "campana")]}, "Campaña"),
            visual("slicer", 640, y, 300, 60, {"Values": [C("dim_supervisor", "id_supervisor")]}, "Supervisor")]
AVISO = "Datos ficticios de demostración (sección 4.2 del documento técnico). Solo datos agregados; sin nombres ni documentos."
fac = ficha  # factores del resumen se calculan con el prototipo; aquí se listan los del dataset
p1 = [texto(20, 10, 1240, 55, ["Panorama · ¿Qué está pasando?", AVISO])] + filtros() + [
    visual("card", 20, 145, 240, 110, {"Values": [M("Contratados")]}, "Personas contratadas (ventana completa)"),
    visual("card", 270, 145, 240, 110, {"Values": [M("Renuncias tempranas")]}, "Renuncias tempranas"),
    visual("card", 520, 145, 240, 110, {"Values": [M("Tasa rotación temprana")]}, "Tasa de rotación temprana"),
    visual("card", 770, 145, 240, 110, {"Values": [M("Mes crítico")]}, "Mes crítico de renuncia"),
    visual("card", 1020, 145, 240, 110, {"Values": [M("Costo estimado")]}, "Costo estimado (supuestos simulados)"),
    visual("lineChart", 20, 270, 620, 420, {"Category": [C("dim_cohorte", "cohorte_ingreso")], "Y": [M("Tasa rotación temprana")]}, "Tasa de rotación temprana por cohorte de ingreso"),
    visual("clusteredColumnChart", 660, 270, 600, 420, {"Category": [C("dim_mes_antiguedad", "etiqueta")], "Y": [M("Renuncias tempranas")]}, "Renuncias tempranas por mes de antigüedad"),
]
p2 = [texto(20, 10, 1240, 55, ["Causas · ¿Por qué se van?", "Asociación, no causalidad. Supervisores con menos de 30 personas no se comparan (quedan en blanco)."])] + filtros() + [
    visual("clusteredBarChart", 20, 145, 400, 560, {"Category": [C("dim_supervisor", "id_supervisor")], "Y": [M("Tasa (grupos comparables)")]}, "Rotación temprana por supervisor (n ≥ 30)"),
    visual("clusteredColumnChart", 430, 145, 410, 270, {"Category": [C("fact_contrataciones", "rango_puntaje")], "Y": [M("Tasa rotación temprana")]}, "Rotación por puntaje de la prueba técnica"),
    visual("clusteredColumnChart", 850, 145, 410, 270, {"Category": [C("fact_contrataciones", "rango_distancia")], "Y": [M("Tasa rotación temprana")]}, "Rotación por distancia"),
    visual("tableEx", 430, 425, 410, 280, {"Values": [C("fact_contrataciones", "turno"), M("Contratados"), M("Tasa rotación temprana"), M("Diferencia vs. promedio"), M("Grupo comparable")]}, "Perfil: turno"),
    visual("clusteredBarChart", 850, 425, 410, 280, {"Category": [C("fact_contrataciones", "motivo_retiro")], "Y": [M("% del motivo")]}, "Motivos declarados de renuncia (encuesta simulada)"),
]
# Resumen: factores calculados con la misma regla del prototipo
import importlib.util, subprocess
res_txt = json.load(open(os.path.join(R, "pruebas", "resultados_unitarias.json")))["resultados"]
f5 = next((r["observado"] for r in res_txt if r["id"] == "PU-05"), "")
p3 = [texto(20, 10, 1240, 140, ["Resumen y acciones · ¿Qué hacemos?",
                                "Ejemplos simulados, no hallazgos comprobados. Factores ordenados por diferencia frente al promedio (regla del documento, sección 14.2):",
                                f5,
                                "Recomendaciones: auxilio de transporte y turnos compatibles (distancia); acompañamiento al supervisor SUP-03; nivelación técnica (puntaje bajo); revisar el canal redes sociales; mentor para personas sin experiencia."])] + [
    visual("tableEx", 20, 160, 620, 270, {"Values": [C("fact_contrataciones", "rango_distancia"), M("Contratados"), M("Tasa rotación temprana"), M("Diferencia vs. promedio")]}, "Evidencia: distancia"),
    visual("tableEx", 650, 160, 610, 270, {"Values": [C("dim_supervisor", "id_supervisor"), M("Contratados"), M("Tasa rotación temprana"), M("Diferencia vs. promedio"), M("Grupo comparable")]}, "Evidencia: supervisor"),
    visual("tableEx", 20, 440, 620, 270, {"Values": [C("fact_contrataciones", "canal_reclutamiento"), M("Contratados"), M("Tasa rotación temprana"), M("Diferencia vs. promedio")]}, "Evidencia: canal de reclutamiento"),
    visual("tableEx", 650, 440, 610, 270, {"Values": [C("fact_contrataciones", "rango_experiencia"), M("Contratados"), M("Tasa rotación temprana"), M("Diferencia vs. promedio")]}, "Evidencia: experiencia previa"),
]
p4 = [texto(20, 10, 1240, 55, ["Semáforo · ¿Se quedará?", "Semáforo oficial: plan B (reglas de alerta, sección 13.10). El modelo no se publica (CU-09 A1). No se guardan los datos del candidato."]),
      visual("slicer", 20, 75, 300, 80, {"Values": [C("Entrada Campaña", "campana")]}, "Campaña", UNO),
      visual("slicer", 330, 75, 300, 80, {"Values": [C("Entrada Turno", "Turno")]}, "Turno", UNO),
      visual("slicer", 640, 75, 300, 80, {"Values": [C("Entrada Nivel educativo", "Nivel educativo")]}, "Nivel educativo", UNO),
      visual("slicer", 950, 75, 310, 80, {"Values": [C("Entrada Canal", "Canal")]}, "Canal de reclutamiento", UNO),
      visual("slicer", 20, 165, 410, 80, {"Values": [C("Entrada Distancia", "Distancia km")]}, "Distancia vivienda–trabajo (km)", UNO),
      visual("slicer", 440, 165, 410, 80, {"Values": [C("Entrada Experiencia", "Experiencia meses")]}, "Experiencia previa (meses)", UNO),
      visual("slicer", 860, 165, 400, 80, {"Values": [C("Entrada Puntaje", "Puntaje")]}, "Puntaje prueba técnica (0–100)", UNO),
      visual("card", 20, 260, 610, 120, {"Values": [M("Semáforo (plan B)")]}, "Resultado del semáforo"),
      visual("card", 640, 260, 620, 120, {"Values": [M("Reglas activadas")]}, "Reglas que se activaron"),
      visual("card", 20, 390, 610, 110, {"Values": [M("Acción sugerida")]}, "Acción sugerida"),
      visual("card", 640, 390, 620, 110, {"Values": [M("Probabilidad modelo (no publicado)")]}, "Probabilidad del modelo (solo comparación, no usar para decidir)"),
      visual("card", 20, 510, 300, 100, {"Values": [M("Recall plan B")]}, "Renuncias detectadas (recall)"),
      visual("card", 330, 510, 300, 100, {"Values": [M("Precisión plan B")]}, "Alertas acertadas (precisión)"),
      visual("card", 640, 510, 300, 100, {"Values": [M("Falsas alarmas plan B")]}, "Falsas alarmas"),
      visual("card", 950, 510, 310, 100, {"Values": [M("Brecha máxima de equidad plan B (p.p.)")]}, "Brecha máxima entre grupos (p.p.)"),
      visual("card", 20, 620, 1240, 80, {"Values": [M("Aviso decisión humana")]}, None),
      ]
def seccion(i, nombre, vcs):
    return {"config": "{}", "displayName": nombre, "displayOption": 1, "filters": "[]", "height": 720, "name": f"ReportSection{i}", "ordinal": i, "visualContainers": vcs, "width": 1280}
reporte = {"config": json.dumps({"version": "5.43", "themeCollection": {}, "activeSectionIndex": 0, "defaultDrillFilterOtherVisuals": True, "settings": {"useStylableVisualContainerHeader": True}}),
           "layoutOptimization": 0, "resourcePackages": [],
           "sections": [seccion(0, "Panorama", p1), seccion(1, "Causas", p2), seccion(2, "Resumen y acciones", p3), seccion(3, "Semáforo", p4)]}
RP = os.path.join(OUT, f"{NOMBRE}.Report"); os.makedirs(RP)
json.dump(reporte, open(os.path.join(RP, "report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump({"version": "1.0", "datasetReference": {"byPath": {"path": f"../{NOMBRE}.SemanticModel"}, "byConnection": None}}, open(os.path.join(RP, "definition.pbir"), "w"), indent=2)
json.dump({"version": "1.0", "artifacts": [{"report": {"path": f"{NOMBRE}.Report"}}], "settings": {"enableAutoRecovery": True}}, open(os.path.join(OUT, f"{NOMBRE}.pbip"), "w"), indent=2)
open(os.path.join(OUT, ".gitignore"), "w").write("**/.pbi/localSettings.json\n**/.pbi/cache.abf\n")

# ------------------------------------------------------------------ medidas.dax (respaldo para armar a mano)
with open(os.path.join(OUT, "medidas.dax"), "w", encoding="utf-8") as fh:
    fh.write("// Radar de permanencia · medidas DAX (tabla 'Medidas'). Generado por pipeline/05_exportar_powerbi.py\n\n")
    for n, e, fs, fo in MED:
        fh.write(f"// Carpeta: {fo}{'  · Formato: ' + fs if fs else ''}\n[{n}] =\n{e}\n\n")
    fh.write("// Tablas calculadas del semáforo (Modelado > Nueva tabla)\n")
    for t in tablas:
        for p in t["partitions"]:
            if p["source"]["type"] == "calculated" and t["name"] != "Medidas":
                fh.write(f"{t['name']} = {p['source']['expression']}\n")
LEEME = """# Radar de permanencia · Power BI

Proyecto en formato **PBIP** (Power BI Project), generado por `pipeline/05_exportar_powerbi.py` desde la capa oro.
Datos **ficticios de demostración** (sección 4.2 del documento técnico).

## Abrir
1. Requisitos: Windows 10/11 y Power BI Desktop actualizado (2024 o posterior).
   Si su versión lo pide: Archivo › Opciones › Características en versión preliminar › «Guardar como proyecto de Power BI (.pbip)».
2. Copie la carpeta `powerbi` a `C:\\RadarPermanencia\\powerbi\\` (o a otra ruta).
3. Abra `Radar_de_permanencia.pbip`.
4. Si la ruta es otra: Transformar datos › Administrar parámetros › `RutaDatos` = ruta de la carpeta `datos`, terminada en `\\`.
5. Inicio › Actualizar.

## Qué contiene
- **Modelo estrella**: `fact_contrataciones` con `dim_cohorte`, `dim_supervisor`, `dim_campana` y `dim_mes_antiguedad` (uno a muchos, filtro en una dirección), más `dim_costos`.
- **22 medidas DAX** en la tabla `Medidas` (también en `medidas.dax`): tasa, renuncias, mes crítico, costo, diferencia frente al promedio, motivos y semáforo.
- **Semáforo** (sección 13.9): tablas desconectadas como entradas del formulario, el plan B como semáforo oficial y la probabilidad del modelo solo como comparación.
- **Seguridad por roles (RLS)**: «Gerencia RR. HH.» ve todo; «Operaciones - Campaña A/B» ven solo su campaña. Pruébelos en Modelado › Ver como.
- **Informe de 4 páginas**: Panorama, Causas, Resumen y acciones, Semáforo.

## Si Power BI Desktop no abre el proyecto
El archivo se generó por código y no se pudo abrir en Windows durante su construcción. Si aparece un error:
1. Abra un informe en blanco, Obtener datos › Texto/CSV, y cargue los CSV de `datos/`.
2. Cree las relaciones indicadas arriba.
3. Cree la tabla `Medidas` y pegue las medidas de `medidas.dax`; cree las tablas calculadas del final de ese archivo.
4. Arme los visuales siguiendo el prototipo web (mismas pantallas y mismos títulos).
Tiempo estimado: 30 a 45 minutos.
"""
open(os.path.join(OUT, "LEEME.md"), "w", encoding="utf-8").write(LEEME)
print("PBIP generado:", OUT, "| medidas:", len(MED), "| páginas: 4 | visuales:", len(p1) + len(p2) + len(p3) + len(p4))
