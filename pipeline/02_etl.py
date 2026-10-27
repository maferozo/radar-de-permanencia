"""
Radar de permanencia - ETL bronce -> plata -> oro (CU-08, HU-01, HU-02, HU-16).
Implementa las reglas de calidad 11.8, la anonimización 12.2 y las variables 11.6 / 12.3.
Uso:  python pipeline/02_etl.py [--bronce datos_demo/bronce/2026-09-30] [--corte 2026-09-30]
La sal se lee de la variable de entorno RADAR_SAL (en la demo hay un valor por defecto
que NUNCA debe usarse con datos reales).
"""
import argparse, hashlib, json, os, sys
import numpy as np
import pandas as pd

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ap = argparse.ArgumentParser()
ap.add_argument("--bronce", default=os.path.join(RAIZ, "datos_demo", "bronce", "2026-09-30"))
ap.add_argument("--corte", default="2026-09-30")
ap.add_argument("--salida", default=os.path.join(RAIZ, "datos_demo"))
args = ap.parse_args()

FECHA_CORTE = pd.Timestamp(args.corte)
SAL = os.environ.get("RADAR_SAL", "SAL_DEMO_NO_USAR_CON_DATOS_REALES")
DOMINIOS = {
    "turno": {"Mañana", "Tarde", "Noche", "Rotativo"},
    "nivel_educativo": {"Bachiller", "Técnico", "Tecnólogo", "Profesional"},
    "canal_reclutamiento": {"Referido", "Portal de empleo", "Redes sociales", "Feria"},
    "tipo_retiro": {"Voluntario", "Despido"},
    "motivo_retiro": {"Horario", "Salario", "Estudio", "Clima laboral", "Otro"},
}
reporte = {"fecha_corte": args.corte, "fuente": os.path.relpath(args.bronce, RAIZ), "reglas": [], "estado": "OK"}

def regla(nombre, descripcion, afectados, accion, ok=True):
    reporte["reglas"].append(dict(regla=nombre, descripcion=descripcion, registros_afectados=int(afectados), accion=accion, cumple_tras_accion=ok))

def anonimizar(v):
    return hashlib.sha256((SAL + str(v)).encode("utf-8")).hexdigest()

# 1. Extracción
emp = pd.read_csv(os.path.join(args.bronce, "empleados.csv"))
ret = pd.read_csv(os.path.join(args.bronce, "retiros.csv"))
des = pd.read_csv(os.path.join(args.bronce, "desempeno.csv"))
sup = pd.read_csv(os.path.join(args.bronce, "supervisores.csv"))
costos = pd.read_csv(os.path.join(args.bronce, "costos.csv")) if os.path.exists(os.path.join(args.bronce, "costos.csv")) else None
reporte["filas_bronce"] = {"empleados": len(emp), "retiros": len(ret), "desempeno": len(des), "supervisores": len(sup)}

# 2. Calidad - unicidad
n0 = len(emp); emp = emp.drop_duplicates(); exactos = n0 - len(emp)
conflictos = emp["id_empleado"].duplicated(keep=False).sum()
emp = emp[~emp["id_empleado"].duplicated(keep=False)]
regla("Unicidad", "id_empleado único en empleados", exactos + conflictos,
      f"Eliminados {exactos} duplicados exactos; {conflictos} conflictos reportados y excluidos")
# Integridad referencial
huerf = ~ret["id_empleado"].isin(emp["id_empleado"])
regla("Integridad referencial", "Todo id en retiros existe en empleados", huerf.sum(), "Excluidos y reportados")
ret = ret[~huerf]
huerf_d = ~des["id_empleado"].isin(emp["id_empleado"]); des = des[~huerf_d]
# Coherencia de fechas
emp["fecha_ingreso"] = pd.to_datetime(emp["fecha_ingreso"])
ret["fecha_retiro"] = pd.to_datetime(ret["fecha_retiro"])
m = ret.merge(emp[["id_empleado", "fecha_ingreso"]], on="id_empleado", how="left")
malas = (m["fecha_retiro"] < m["fecha_ingreso"]) | (m["fecha_retiro"] > FECHA_CORTE)
ids_malos = set(m.loc[malas, "id_empleado"])
regla("Coherencia de fechas", "fecha_retiro >= fecha_ingreso y <= fecha_corte", malas.sum(),
      "Excluidos y reportados (empleado completo excluido para no sesgar la tasa)")
ret = ret[~ret["id_empleado"].isin(ids_malos)]
emp = emp[~emp["id_empleado"].isin(ids_malos)]
fut = emp["fecha_ingreso"] > FECHA_CORTE
regla("Coherencia de fechas (ingreso)", "fecha_ingreso <= fecha_corte", fut.sum(), "Excluidos"); emp = emp[~fut]
# Dominio
fuera = (emp["puntaje_prueba_tecnica"] < 0) | (emp["puntaje_prueba_tecnica"] > 100)
emp.loc[fuera, "puntaje_prueba_tecnica"] = np.nan
regla("Dominio", "puntaje_prueba_tecnica en [0, 100]", fuera.sum(), "Marcados como nulo")
fd = (emp["distancia_km"] < 0) | (emp["distancia_km"] > 100); emp.loc[fd, "distancia_km"] = np.nan
regla("Dominio", "distancia_km en [0, 100]", fd.sum(), "Marcados como nulo")
for c, dom in DOMINIOS.items():
    if c in emp:
        bad = emp[c].notna() & ~emp[c].isin(dom); emp.loc[bad, c] = np.nan
        regla("Dominio", f"{c} en categorías definidas", bad.sum(), "Marcados como nulo")
for c in ("motivo_retiro",):
    if c in ret:
        bad = ret[c].notna() & ~ret[c].isin(DOMINIOS[c]); ret.loc[bad, c] = np.nan
        regla("Dominio", f"{c} en categorías definidas", bad.sum(), "Marcados como nulo")
# Completitud
nulos = {}
for c in ["distancia_km", "experiencia_previa_meses", "puntaje_prueba_tecnica", "turno", "nivel_educativo", "canal_reclutamiento", "campana"]:
    pct = float(emp[c].isna().mean() * 100); nulos[c] = round(pct, 2)
    if pct >= 20:
        reporte["estado"] = "DETENIDO"
regla("Completitud", "% de nulos por columna (< 20 % se imputa en el pipeline del modelo con mediana/moda)",
      sum(emp[c].isna().sum() for c in nulos), json.dumps(nulos, ensure_ascii=False))
reporte["nulos_pct"] = nulos
if reporte["estado"] == "DETENIDO":  # CU-08 A1
    json.dump(reporte, open(os.path.join(args.salida, "reporte_calidad.json"), "w"), ensure_ascii=False, indent=1)
    sys.exit("El reporte de calidad no cumple las reglas; proceso detenido (CU-08 A1).")

# 3-5. Integración + anonimización
df = emp.merge(ret, on="id_empleado", how="left")
agg = des.groupby("id_empleado").agg(cumplimiento_prom=("cumplimiento_metas_pct", "mean"), ausencias_tot=("ausencias", "sum")).reset_index()
df = df.merge(agg, on="id_empleado", how="left")
df["id_empleado"] = df["id_empleado"].map(anonimizar)
df["id_supervisor_hash"] = df["id_supervisor"].map(anonimizar)
df = df.drop(columns=["nombre", "documento"])  # minimización
regla("Anonimización", "Plata y oro sin nombres ni documentos", 0, "Columnas nombre y documento eliminadas; ids con SHA-256 + sal")

# 6. Variables calculadas (12.3)
df["fecha_corte"] = FECHA_CORTE
df["fecha_fin"] = df["fecha_retiro"].fillna(FECHA_CORTE)
df["antiguedad_dias"] = (df["fecha_fin"] - df["fecha_ingreso"]).dt.days
df["ventana_observada"] = (FECHA_CORTE - df["fecha_ingreso"]).dt.days >= 180
df["renuncia_temprana"] = ((df["tipo_retiro"] == "Voluntario") & (df["antiguedad_dias"] <= 180)).astype(int)
df["despido_temprano"] = ((df["tipo_retiro"] == "Despido") & (df["antiguedad_dias"] <= 180)).astype(int)
df["mes_antiguedad_retiro"] = np.where(df["renuncia_temprana"] == 1, np.ceil(df["antiguedad_dias"] / 30).clip(1, 6), np.nan)
df["cohorte_ingreso"] = df["fecha_ingreso"].dt.strftime("%Y-%m")
df["rango_puntaje"] = pd.cut(df["puntaje_prueba_tecnica"], [-0.1, 59.999, 69.999, 79.999, 89.999, 100], labels=["0–59", "60–69", "70–79", "80–89", "90–100"]).astype(str).replace("nan", "Sin dato")
df["rango_distancia"] = pd.cut(df["distancia_km"], [-0.1, 4.999, 10, 15, 1000], labels=["< 5 km", "5–10 km", "10–15 km", "> 15 km"]).astype(str).replace("nan", "Sin dato")
df["rango_experiencia"] = np.select([df["experiencia_previa_meses"].isna(), df["experiencia_previa_meses"] == 0, df["experiencia_previa_meses"] <= 12],
                                    ["Sin dato", "Sin experiencia", "1–12 meses"], "> 12 meses")
df["rango_edad"] = pd.cut(df["edad"], [0, 24, 34, 200], labels=["18–24", "25–34", "35+"]).astype(str)

# Pruebas unitarias del ETL (estrategia de pruebas, sección 17) - asserts
assert df["id_empleado"].is_unique, "Unicidad"
assert not (df["fecha_retiro"] < df["fecha_ingreso"]).any(), "Fechas imposibles"
assert set(df["renuncia_temprana"].unique()) <= {0, 1}
assert df.loc[df["renuncia_temprana"] == 1, "mes_antiguedad_retiro"].between(1, 6).all()
assert not any(c in df.columns for c in ["nombre", "documento"]), "Anonimización"
assert df["id_empleado"].str.len().eq(64).all()

if "motivo_retiro" not in df.columns:  # la encuesta de salida es opcional (HU-10)
    df["motivo_retiro"] = None
df["motivo_retiro"] = np.where(df["renuncia_temprana"] == 1, df["motivo_retiro"], None)
# 7. Carga plata / oro
os.makedirs(os.path.join(args.salida, "plata"), exist_ok=True); os.makedirs(os.path.join(args.salida, "oro"), exist_ok=True)
df.drop(columns=["id_supervisor"]).to_csv(os.path.join(args.salida, "plata", "empleados_integrado.csv"), index=False)
fact_cols = ["id_empleado", "cohorte_ingreso", "fecha_ingreso", "campana", "turno", "id_supervisor", "distancia_km", "experiencia_previa_meses",
             "nivel_educativo", "canal_reclutamiento", "puntaje_prueba_tecnica", "rango_puntaje", "rango_distancia", "rango_experiencia",
             "ventana_observada", "renuncia_temprana", "despido_temprano", "mes_antiguedad_retiro", "antiguedad_dias", "motivo_retiro"]
# Nota: id_supervisor se conserva como CÓDIGO ANÓNIMO ficticio (SUP-xx) - el diccionario lo define como código anónimo.
df[fact_cols].to_csv(os.path.join(args.salida, "oro", "fact_contrataciones.csv"), index=False)
modelo_cols = ["id_empleado", "cohorte_ingreso", "distancia_km", "experiencia_previa_meses", "puntaje_prueba_tecnica", "turno",
               "nivel_educativo", "canal_reclutamiento", "campana", "renuncia_temprana"]
equidad_cols = ["id_empleado", "sexo", "rango_edad", "estado_civil", "estrato"]
base = df[df["ventana_observada"]]
base[modelo_cols].to_csv(os.path.join(args.salida, "oro", "dataset_modelo.csv"), index=False)
base[equidad_cols].to_csv(os.path.join(args.salida, "oro", "equidad_atributos_sensibles.csv"), index=False)

if costos is not None:
    costos.to_csv(os.path.join(args.salida, "oro", "dim_costos.csv"), index=False)
reporte["filas_salida"] = {"fact_contrataciones": len(df), "cohortes_con_ventana": int(df["ventana_observada"].sum()),
                           "renuncias_tempranas_ventana": int(base["renuncia_temprana"].sum())}
json.dump(reporte, open(os.path.join(args.salida, "reporte_calidad.json"), "w"), ensure_ascii=False, indent=1, default=str)
print(json.dumps(reporte, ensure_ascii=False, indent=1, default=str))
