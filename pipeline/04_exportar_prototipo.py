"""
Exporta la capa oro (ficticia) y las salidas del modelo al formato que consume el prototipo web
(prototipo/src/data/*.json). Equivale al paso 07_exportar_powerbi del documento técnico.
Solo se exportan datos agregables y sin identificadores personales (RF-18).
"""
import json, os
import pandas as pd

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(RAIZ, "prototipo", "src", "data"); os.makedirs(OUT, exist_ok=True)
f = pd.read_csv(os.path.join(RAIZ, "datos_demo", "oro", "fact_contrataciones.csv"))

cols = ["cohorte_ingreso", "campana", "turno", "id_supervisor", "distancia_km", "experiencia_previa_meses", "nivel_educativo",
        "canal_reclutamiento", "puntaje_prueba_tecnica", "rango_puntaje", "rango_distancia", "rango_experiencia",
        "ventana_observada", "renuncia_temprana", "despido_temprano", "mes_antiguedad_retiro", "motivo_retiro"]
assert "id_empleado" not in cols
dicts = {}
out = {"fecha_corte": "2026-09-30", "n": int(len(f)), "columnas": {}, "diccionarios": {}}
for c in cols:
    s = f[c]
    if not pd.api.types.is_numeric_dtype(s) or pd.api.types.is_bool_dtype(s):
        s = s.astype(str).fillna("Sin dato").replace({"nan": "Sin dato"})
        cats = sorted(s.unique().tolist()); idx = {v: i for i, v in enumerate(cats)}
        out["diccionarios"][c] = cats; out["columnas"][c] = [idx[v] for v in s]
    else:
        out["columnas"][c] = [None if pd.isna(v) else (int(v) if float(v).is_integer() else round(float(v), 1)) for v in s]
json.dump(out, open(os.path.join(OUT, "hechos.json"), "w"), ensure_ascii=False, separators=(",", ":"))

ficha = json.load(open(os.path.join(RAIZ, "datos_demo", "modelo", "ficha_modelo.json")))
json.dump(ficha, open(os.path.join(OUT, "modelo.json"), "w"), ensure_ascii=False, indent=0, default=str)
c = pd.read_csv(os.path.join(RAIZ, "datos_demo", "oro", "dim_costos.csv")).iloc[0]
json.dump(dict(reclutamiento=int(c.costo_reclutamiento), formacion=int(c.costo_formacion), improductivo=int(c.costo_tiempo_improductivo), fuente=str(c.fuente)),
          open(os.path.join(OUT, "costos.json"), "w"), ensure_ascii=False)
calidad = json.load(open(os.path.join(RAIZ, "datos_demo", "reporte_calidad.json")))
json.dump(calidad, open(os.path.join(OUT, "calidad.json"), "w"), ensure_ascii=False, indent=0)
jira = json.load(open(os.path.join(RAIZ, "evidencias", "jira", "jira_snapshot_2026-10-27_post.json")))
jira_min = [{k: r[k] for k in ("key", "type", "status", "summary", "sprint", "catchg", "created")} for r in jira]
json.dump(jira_min, open(os.path.join(OUT, "jira.json"), "w"), ensure_ascii=False, indent=0)
if not os.path.exists(os.path.join(OUT, "resultados_pruebas.json")):
    json.dump({"ejecutado": False}, open(os.path.join(OUT, "resultados_pruebas.json"), "w"))
print("exportado", len(f), "filas")
