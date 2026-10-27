"""
Pruebas del pipeline (CU-08 y CU-09): ETL, calidad, anonimización, variable objetivo y criterios del modelo.
Ejecutar desde la raíz:  python3 pruebas/test_pipeline.py
Escribe pruebas/resultados_pipeline.json con el resultado observado de cada prueba.
"""
import hashlib, json, os, subprocess, sys, tempfile, datetime, platform
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "pipeline"))
from criterios import decidir_publicacion  # noqa: E402

BRONCE = os.path.join(RAIZ, "datos_demo", "bronce", "2026-09-30")
resultados = []

def prueba(id_, cu, nombre, entrada, esperado):
    def deco(fn):
        try:
            ok, obs = fn()
        except Exception as e:  # noqa: BLE001
            ok, obs = False, f"Error: {e}"
        resultados.append(dict(id=id_, cu=cu, nombre=nombre, entrada=entrada, esperado=esperado, observado=obs, estado="Aprobada" if ok else "Fallida"))
        print(("OK   " if ok else "FALLA"), id_, nombre, "→", obs)
        return fn
    return deco

def etl(bronce, salida, corte="2026-09-30"):
    return subprocess.run([sys.executable, os.path.join(RAIZ, "pipeline", "02_etl.py"), "--bronce", bronce, "--corte", corte, "--salida", salida], capture_output=True, text=True)

# --- Ejecución sobre la capa bronce ficticia con errores sembrados ---
tmp = tempfile.mkdtemp(prefix="radar_")
r = etl(BRONCE, tmp)
assert r.returncode == 0, r.stderr
rep = json.load(open(os.path.join(tmp, "reporte_calidad.json")))
plata = pd.read_csv(os.path.join(tmp, "plata", "empleados_integrado.csv"))
emp_b = pd.read_csv(os.path.join(BRONCE, "empleados.csv")); ret_b = pd.read_csv(os.path.join(BRONCE, "retiros.csv"))
regla = lambda n: [x for x in rep["reglas"] if x["regla"] == n]

@prueba("PT-08-01", "CU-08", "Datos duplicados", "empleados.csv con 15 filas duplicadas exactas", "Se eliminan; id_empleado queda único")
def _():
    dup = int(emp_b.duplicated().sum()); u = plata["id_empleado"].is_unique
    return dup == 15 and u and regla("Unicidad")[0]["registros_afectados"] >= 15, f"{dup} duplicados en bronce; plata con ids únicos = {u}"

@prueba("PT-08-02", "CU-08", "Fechas de retiro anteriores al ingreso", "6 retiros con fecha 10 días antes del ingreso", "Se excluyen y se reportan")
def _():
    n = regla("Coherencia de fechas")[0]["registros_afectados"]
    malas = (pd.to_datetime(plata["fecha_retiro"]) < pd.to_datetime(plata["fecha_ingreso"])).sum()
    return n == 6 and malas == 0, f"Reportados {n}; quedan {malas} con fecha imposible"

@prueba("PT-08-03", "CU-08", "Retiros huérfanos (integridad referencial)", "3 retiros con ids inexistentes", "Se excluyen y se reportan")
def _():
    n = regla("Integridad referencial")[0]["registros_afectados"]; return n == 3, f"Reportados {n}"

@prueba("PT-08-04", "CU-08", "Puntaje fuera de dominio", "Puntajes 105, 130 y −4", "Se marcan como nulo")
def _():
    n = [x for x in rep["reglas"] if "puntaje" in x["descripcion"]][0]["registros_afectados"]
    fuera = ((plata["puntaje_prueba_tecnica"] > 100) | (plata["puntaje_prueba_tecnica"] < 0)).sum()
    return n == 3 and fuera == 0, f"Marcados {n}; quedan {fuera} fuera de rango"

@prueba("PT-08-05", "CU-08 / HU-16", "Anonimización con hash y sal", "Columnas nombre, documento e id_empleado", "Sin nombre ni documento; id de 64 caracteres; hash distinto con otra sal")
def _():
    sin = not {"nombre", "documento"} & set(plata.columns); largo = plata["id_empleado"].str.len().eq(64).all()
    h1 = hashlib.sha256(("SAL_DEMO_NO_USAR_CON_DATOS_REALES" + "EMP-00001").encode()).hexdigest(); h2 = hashlib.sha256(("otra_sal" + "EMP-00001").encode()).hexdigest()
    return sin and largo and h1 in set(plata["id_empleado"]) and h1 != h2, f"sin PII={sin}; 64 caracteres={largo}; hash cambia con la sal={h1 != h2}"

# --- Casos controlados para la variable objetivo (HU-02) ---
caso = tempfile.mkdtemp(prefix="radar_caso_"); os.makedirs(os.path.join(caso, "b"))
base = dict(campana="Campaña B · Banca", turno="Mañana", id_supervisor="SUP-02", distancia_km=5.0, experiencia_previa_meses=6, nivel_educativo="Técnico",
            canal_reclutamiento="Referido", puntaje_prueba_tecnica=70.0, edad=25, sexo="Femenino", estado_civil="Soltero/a", estrato=2, nombre="x", documento="y")
emp = pd.DataFrame([dict(base, id_empleado=f"C{i}", fecha_ingreso=f) for i, f in enumerate(["2025-01-01", "2025-01-01", "2025-01-01", "2026-06-01", "2025-01-01"])])
ret = pd.DataFrame([dict(id_empleado="C0", fecha_retiro="2025-06-30", tipo_retiro="Voluntario"),   # día 180
                    dict(id_empleado="C1", fecha_retiro="2025-07-01", tipo_retiro="Voluntario"),   # día 181
                    dict(id_empleado="C2", fecha_retiro="2025-01-31", tipo_retiro="Despido")])     # despido día 30
emp.to_csv(os.path.join(caso, "b", "empleados.csv"), index=False); ret.to_csv(os.path.join(caso, "b", "retiros.csv"), index=False)
pd.DataFrame(columns=["id_empleado", "periodo", "cumplimiento_metas_pct", "ausencias"]).to_csv(os.path.join(caso, "b", "desempeno.csv"), index=False)
pd.DataFrame([dict(id_supervisor="SUP-02", campana="Campaña B · Banca")]).to_csv(os.path.join(caso, "b", "supervisores.csv"), index=False)
rc = etl(os.path.join(caso, "b"), caso)
fc = pd.read_csv(os.path.join(caso, "oro", "fact_contrataciones.csv")).sort_values("fecha_ingreso")

@prueba("PT-08-06", "CU-08 / HU-02", "Definición de renuncia temprana", "Renuncia día 180, renuncia día 181, despido día 30, activo", "1, 0, 0 (despido aparte), 0")
def _():
    v = dict(zip(fc["antiguedad_dias"], fc["renuncia_temprana"])); d = int(fc["despido_temprano"].sum())
    return rc.returncode == 0 and v.get(180) == 1 and v.get(181) == 0 and d == 1, f"día 180 → {v.get(180)}; día 181 → {v.get(181)}; despidos tempranos aparte = {d}"

@prueba("PT-08-07", "CU-08 / RF-03", "Cohorte sin 180 días de observación", "Ingreso 2026-06-01, corte 2026-09-30 (121 días)", "ventana_observada = False; no entra en tasas ni en el dataset del modelo")
def _():
    f = fc[fc["cohorte_ingreso"] == "2026-06"]; dm = pd.read_csv(os.path.join(caso, "oro", "dataset_modelo.csv"))
    return (not f["ventana_observada"].iloc[0]) and "2026-06" not in set(dm["cohorte_ingreso"]), f"ventana_observada = {bool(f['ventana_observada'].iloc[0])}; filas en dataset del modelo = {len(dm)}"

# --- CU-08 A1: el proceso se detiene si la calidad no cumple ---
gate = tempfile.mkdtemp(prefix="radar_gate_"); os.makedirs(os.path.join(gate, "b"))
e2 = emp_b.drop_duplicates().copy(); e2.loc[e2.sample(frac=0.3, random_state=1).index, "distancia_km"] = None
e2.to_csv(os.path.join(gate, "b", "empleados.csv"), index=False)
for t in ["retiros", "desempeno", "supervisores"]:
    pd.read_csv(os.path.join(BRONCE, f"{t}.csv")).to_csv(os.path.join(gate, "b", f"{t}.csv"), index=False)
rg = etl(os.path.join(gate, "b"), gate)

@prueba("PT-08-08", "CU-08 (A1)", "Reporte de calidad que no cumple", "30 % de nulos en distancia_km", "El proceso se detiene y no escribe plata ni oro")
def _():
    ok = rg.returncode != 0 and not os.path.exists(os.path.join(gate, "oro", "fact_contrataciones.csv"))
    return ok, f"código de salida {rg.returncode}; capa oro creada = {os.path.exists(os.path.join(gate, 'oro', 'fact_contrataciones.csv'))}"

# --- CU-09: modelo ---
ficha = json.load(open(os.path.join(RAIZ, "datos_demo", "modelo", "ficha_modelo.json")))
coefs = pd.read_csv(os.path.join(RAIZ, "datos_demo", "modelo", "coeficientes.csv"))

@prueba("PT-09-01", "CU-09 / HU-15", "Intento de usar variables sensibles en el modelo", "Revisión de coeficientes exportados", "Ninguna variable de edad, sexo, estado civil, estrato, barrio o dirección")
def _():
    sens = [v for v in coefs["variable"] if any(s in v.lower() for s in ["edad", "sexo", "estado_civil", "estrato", "barrio", "direccion"])]
    return not sens, f"{len(coefs) - 1} coeficientes; sensibles encontrados = {sens}"

@prueba("PT-09-02", "CU-09 / HU-14", "Evaluación con datos no usados para entrenar", "Partición temporal", "Cohortes de prueba posteriores y disjuntas de las de entrenamiento")
def _():
    p = ficha["particion"]; fin_tr = p["train"].split("..")[1]; ini_te = p["test"].split("..")[0]
    return fin_tr < ini_te, f"entrenamiento {p['train']} (n={p['n_train']}); prueba {p['test']} (n={p['n_test']})"

@prueba("PT-09-03", "CU-09 (A1)", "Modelo que no supera la referencia", "Recall 0 y AUC 0,50 (igual a «todos se quedan»)", "No se publica; se activa el plan B")
def _():
    d = decidir_publicacion({"recall": 0.0, "auc": 0.5}, {"recall": 0.0, "auc": 0.5}, [{"brecha_recall_pp": 1, "brecha_fp_pp": 1}], False)
    return (not d["publicable"]) and "plan B" in d["accion"], d["accion"]

@prueba("PT-09-04", "CU-09 (A1) / HU-15", "Modelo que incumple equidad", "Modelo demo: brechas por sexo y edad > 10 p.p.", "No se publica; se activa el plan B")
def _():
    c = ficha["criterios"]; b = {x["atributo"]: x["brecha_recall_pp"] for x in ficha["brechas"]}
    return (not c["cumple_equidad"]) and (not c["publicable_en_demo"]), f"brechas de recall (p.p.) = {b}; publicable = {c['publicable_en_demo']}"

@prueba("PT-09-05", "CU-09 / RNF-09", "Reproducibilidad del entrenamiento", "Segunda ejecución con random_state = 42", "Coeficientes idénticos")
def _():
    antes = coefs.copy(); subprocess.run([sys.executable, os.path.join(RAIZ, "pipeline", "03_modelo.py")], capture_output=True, check=True)
    despues = pd.read_csv(os.path.join(RAIZ, "datos_demo", "modelo", "coeficientes.csv"))
    dif = float((antes["coeficiente"] - despues["coeficiente"]).abs().max())
    return dif < 1e-12, f"diferencia máxima entre ejecuciones = {dif:.2e}"

@prueba("PT-09-06", "CU-09 / RNF-06", "Meta de recall propuesta (≥ 0,60)", "Métricas sobre el conjunto de prueba", "Se informa si se alcanza; no se presenta como lograda si no se alcanza")
def _():
    lr = ficha["metricas"][0]; c = ficha["criterios"]
    return c["cumple_meta_recall"] == (lr["recall"] >= 0.6), f"recall = {lr['recall']} → meta {'alcanzada' if c['cumple_meta_recall'] else 'no alcanzada'} (registrado correctamente)"

@prueba("PT-09-07", "CU-09 (A1) / 13.10", "Plan B: referencia y equidad", "Reglas fijas sobre todas las cohortes con ventana", "Supera la referencia y cumple ≤ 10 p.p. en los 4 atributos")
def _():
    e = ficha["evaluacion_ampliada"]; br = {b["atributo"]: max(b["brecha_recall_pp"], b["brecha_fp_pp"]) for b in e["plan_b_brechas"]}
    return e["plan_b"]["recall"] > 0 and e["plan_b_cumple_equidad"] and ficha["semaforo_oficial"].startswith("Plan B"), f"recall {e['plan_b']['recall']} vs 0; brechas (p.p.) {br}; oficial: {ficha['semaforo_oficial']}"

@prueba("PT-10-01", "Power BI / RF-18", "Exportación a Power BI", "pipeline/05_exportar_powerbi.py", "CSV sin identificadores, totales iguales a la capa oro, JSON válidos y medidas del informe definidas")
def _():
    import re
    subprocess.run([sys.executable, os.path.join(RAIZ, "pipeline", "05_exportar_powerbi.py")], capture_output=True, check=True)
    pb = os.path.join(RAIZ, "powerbi"); fpb = pd.read_csv(os.path.join(pb, "datos", "fact_contrataciones.csv"))
    b = fpb[fpb["ventana_observada"]]; mb = json.load(open(os.path.join(pb, "Radar_de_permanencia.SemanticModel", "model.bim")))
    rep = json.load(open(os.path.join(pb, "Radar_de_permanencia.Report", "report.json")))
    meds = {m["name"] for t in mb["model"]["tables"] for m in t.get("measures", [])}
    cols = {(t["name"], c["name"]) for t in mb["model"]["tables"] for c in t["columns"]}
    usados = set()
    for sec in rep["sections"]:
        for v in sec["visualContainers"]:
            for sel in json.loads(v["config"]).get("singleVisual", {}).get("prototypeQuery", {}).get("Select", []):
                usados.add(sel["Name"])
    faltan = [u for u in usados if not (u.split(".", 1)[1] in meds or tuple(u.split(".", 1)) in cols)]
    ok = "id_empleado" not in fpb.columns and len(b) == 2528 and int(b["renuncia_temprana"].sum()) == 780 and not faltan and len(rep["sections"]) == 4 and len(mb["model"]["roles"]) >= 2
    return ok, f"{len(b)} personas / {int(b['renuncia_temprana'].sum())} renuncias; {len(meds)} medidas; {len(usados)} campos usados en 4 páginas, {len(faltan)} sin definir; {len(mb['model']['roles'])} roles RLS"

out = dict(fecha=datetime.datetime.now().isoformat(timespec="seconds"), entorno=f"Python {platform.python_version()} · pandas {pd.__version__} · {platform.platform()}", resultados=resultados)
json.dump(out, open(os.path.join(RAIZ, "pruebas", "resultados_pipeline.json"), "w"), ensure_ascii=False, indent=1)
print(f"\n{sum(r['estado'] == 'Aprobada' for r in resultados)}/{len(resultados)} aprobadas")
sys.exit(0 if all(r["estado"] == "Aprobada" for r in resultados) else 1)
