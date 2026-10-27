"""Une los resultados de las tres suites (pipeline, unitarias, e2e) y de rendimiento para el prototipo y el documento."""
import json, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pl = json.load(open(os.path.join(R, "pruebas", "resultados_pipeline.json")))
un = json.load(open(os.path.join(R, "pruebas", "resultados_unitarias.json")))
e2 = json.load(open(os.path.join(R, "pruebas", "resultados_e2e.json")))
rd = json.load(open(os.path.join(R, "metricas", "rendimiento", "resultados_rendimiento.json")))
func = [dict(id=x["id"], cu=x["cu"], nombre=x["nombre"], entrada=x.get("entrada") or "—", esperado=x["esperado"], observado=x["observado"], estado=x["estado"], suite=s, evidencia=("evidencias/capturas/" + x["evidencia"]) if x.get("evidencia") else ("pruebas/resultados_" + {"Pipeline (Python)": "pipeline", "Unitaria (TypeScript)": "unitarias", "Extremo a extremo (Playwright)": "e2e"}[s] + ".json"))
        for s, d in (("Pipeline (Python)", pl), ("Unitaria (TypeScript)", un), ("Extremo a extremo (Playwright)", e2)) for x in d["resultados"]]
out = dict(ejecutado=True, fecha=e2["fecha"][:16].replace("T", " "), entorno="Contenedor Linux en la nube; " + e2["entorno"].split(" · ")[0],
           funcionales=func, rendimiento=dict(fecha=rd["fecha"][:16].replace("T", " "), entorno=rd["entorno"], filas=rd["filas"]))
json.dump(out, open(os.path.join(R, "prototipo", "src", "data", "resultados_pruebas.json"), "w"), ensure_ascii=False, indent=0)
json.dump(out, open(os.path.join(R, "pruebas", "resultados_consolidados.json"), "w"), ensure_ascii=False, indent=1)
print(len(func), "pruebas;", sum(f["estado"] == "Aprobada" for f in func), "aprobadas")
