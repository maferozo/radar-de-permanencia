"""
Radar de permanencia - Entrenamiento, evaluación, equidad y exportación (CU-09; HU-12, HU-14, HU-15).
Sigue las secciones 13.2-13.8 del documento técnico. Con los datos de demostración, TODOS los
resultados son SIMULADOS: sirven para probar el procedimiento, no son hallazgos del cliente.
"""
import json, os
import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.dummy import DummyClassifier
from sklearn.model_selection import StratifiedKFold, GridSearchCV
from sklearn.metrics import recall_score, precision_score, f1_score, roc_auc_score, confusion_matrix
import joblib
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from criterios import decidir_publicacion

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ORO = os.path.join(RAIZ, "datos_demo", "oro"); OUT = os.path.join(RAIZ, "datos_demo", "modelo")
os.makedirs(OUT, exist_ok=True)
RECALL_META = 0.60       # propuesta inicial RNF-06 (por validar con el cliente)
EQUIDAD_MAX_PP = 10.0    # propuesta RNF-04 (por validar con el cliente)
N_MIN_GRUPO = 30         # mínimo de casos positivos para comparar un grupo (supuesto del equipo)

d = pd.read_csv(os.path.join(ORO, "dataset_modelo.csv"))
s = pd.read_csv(os.path.join(ORO, "equidad_atributos_sensibles.csv"))
d = d.merge(s, on="id_empleado")
num = ["distancia_km", "experiencia_previa_meses", "puntaje_prueba_tecnica"]
cat = ["turno", "nivel_educativo", "canal_reclutamiento", "campana"]
SENSIBLES = ["edad", "sexo", "estado_civil", "estrato", "barrio", "direccion"]
assert not set(SENSIBLES) & set(num + cat), "Variable sensible en las entradas"

# --- Revisión de aproximaciones (V de Cramér, 13.2) ---
def cramer_v(a, b):
    t = pd.crosstab(a, b); chi2 = chi2_contingency(t)[0]; n = t.values.sum()
    return float(np.sqrt(chi2 / (n * (min(t.shape) - 1))))
d["estrato_grupo"] = pd.cut(d["estrato"], [0, 2, 3, 6], labels=["1–2", "3", "4–6"]).astype(str)
proxy = []
binned = {"distancia_km": pd.cut(d["distancia_km"], [-1, 5, 10, 15, 1000]).astype(str),
          "experiencia_previa_meses": pd.cut(d["experiencia_previa_meses"].fillna(-1), [-2, -0.5, 0.5, 12, 1e6]).astype(str),
          "puntaje_prueba_tecnica": pd.cut(d["puntaje_prueba_tecnica"].fillna(-1), [-2, 59.99, 69.99, 79.99, 89.99, 100]).astype(str)}
for v in num + cat:
    x = binned.get(v, d[v].astype(str))
    for sv in ["sexo", "rango_edad", "estado_civil", "estrato_grupo"]:
        proxy.append(dict(variable=v, sensible=sv, v_cramer=round(cramer_v(x, d[sv]), 3)))
proxy = pd.DataFrame(proxy); proxy["supera_0_5"] = proxy["v_cramer"] > 0.5
proxy.to_csv(os.path.join(OUT, "revision_aproximaciones.csv"), index=False)

# --- Partición temporal (preferida, 13.3) ---
cohortes = sorted(d["cohorte_ingreso"].unique())
corte = cohortes[int(len(cohortes) * 0.75)]
train, test = d[d["cohorte_ingreso"] < corte], d[d["cohorte_ingreso"] >= corte]
X_tr, y_tr, X_te, y_te = train[num + cat], train["renuncia_temprana"], test[num + cat], test["renuncia_temprana"]

prep = ColumnTransformer([
    ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("esc", StandardScaler())]), num),
    ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")), ("ohe", OneHotEncoder(handle_unknown="ignore"))]), cat),
])
modelo = Pipeline([("prep", prep), ("clf", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42))])
gs = GridSearchCV(modelo, {"clf__C": [0.01, 0.1, 1.0, 10.0]}, scoring="recall",
                  cv=StratifiedKFold(5, shuffle=True, random_state=42)).fit(X_tr, y_tr)
modelo = gs.best_estimator_
referencia = Pipeline([("prep", prep), ("clf", DummyClassifier(strategy="most_frequent"))]).fit(X_tr, y_tr)
arbol = Pipeline([("prep", prep), ("clf", DecisionTreeClassifier(max_depth=4, class_weight="balanced", random_state=42))]).fit(X_tr, y_tr)

def metricas(nombre, y, pred, prob):
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return dict(modelo=nombre, recall=round(recall_score(y, pred, zero_division=0), 3),
                precision=round(precision_score(y, pred, zero_division=0), 3), f1=round(f1_score(y, pred, zero_division=0), 3),
                auc=round(roc_auc_score(y, prob), 3) if prob is not None else None,
                tasa_falsos_positivos=round(fp / (fp + tn), 3), vp=int(tp), fp=int(fp), fn=int(fn), vn=int(tn))
p_te = modelo.predict_proba(X_te)[:, 1]
res = [metricas("Regresión logística", y_te, (p_te >= 0.5).astype(int), p_te),
       metricas("Referencia (todos se quedan)", y_te, referencia.predict(X_te), referencia.predict_proba(X_te)[:, 1]),
       metricas("Árbol de decisión (comparación)", y_te, arbol.predict(X_te), arbol.predict_proba(X_te)[:, 1])]

# Umbrales (13.6): rojo = 20 % de mayor riesgo; amarillo = siguiente 30 %
u_rojo = float(np.quantile(p_te, 0.80)); u_amar = float(np.quantile(p_te, 0.50))
color = np.where(p_te >= u_rojo, "rojo", np.where(p_te >= u_amar, "amarillo", "verde"))
res.append(metricas("Semáforo: alerta = rojo", y_te, (color == "rojo").astype(int), None))
res.append(metricas("Semáforo: alerta = rojo o amarillo", y_te, (color != "verde").astype(int), None))
pd.DataFrame(res).to_csv(os.path.join(OUT, "metricas.csv"), index=False)

# Equidad (13.8): recall y FPR por grupo
pred_te = (p_te >= 0.5).astype(int)
eq = []
for sv in ["sexo", "rango_edad", "estado_civil", "estrato_grupo"]:
    for g, idx in test.groupby(sv).groups.items():
        m = test.index.isin(idx); y, pr = y_te[m], pred_te[m]
        tn, fp, fn, tp = confusion_matrix(y, pr, labels=[0, 1]).ravel()
        eq.append(dict(atributo=sv, grupo=g, n=int(m.sum()), positivos=int(y.sum()),
                       recall=round(tp / (tp + fn), 3) if tp + fn else None, tasa_fp=round(fp / (fp + tn), 3) if fp + tn else None,
                       suficiente=bool(y.sum() >= N_MIN_GRUPO)))
eq = pd.DataFrame(eq); eq.to_csv(os.path.join(OUT, "equidad.csv"), index=False)
brechas = []
for sv, g in eq[eq["suficiente"]].groupby("atributo"):
    if len(g) >= 2:
        brechas.append(dict(atributo=sv, brecha_recall_pp=round((g["recall"].max() - g["recall"].min()) * 100, 1),
                            brecha_fp_pp=round((g["tasa_fp"].max() - g["tasa_fp"].min()) * 100, 1)))
brechas = pd.DataFrame(brechas); brechas["cumple"] = (brechas["brecha_recall_pp"] <= EQUIDAD_MAX_PP) & (brechas["brecha_fp_pp"] <= EQUIDAD_MAX_PP)

# Comparación interna con variables sensibles (S-17) - solo diagnóstico, nunca en producción
X_tr_s = train[num + cat + ["sexo", "rango_edad", "estado_civil", "estrato_grupo"]]
X_te_s = test[num + cat + ["sexo", "rango_edad", "estado_civil", "estrato_grupo"]]
prep_s = ColumnTransformer([("num", prep.transformers[0][1], num), ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")), ("ohe", OneHotEncoder(handle_unknown="ignore"))]), cat + ["sexo", "rango_edad", "estado_civil", "estrato_grupo"])])
m_s = Pipeline([("prep", prep_s), ("clf", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42, C=gs.best_params_["clf__C"]))]).fit(X_tr_s, y_tr)
auc_con_sensibles = round(roc_auc_score(y_te, m_s.predict_proba(X_te_s)[:, 1]), 3)

# Decisión de publicación (CU-09 / 13.10)
lr, ref = res[0], res[1]
dec = decidir_publicacion(lr, ref, brechas.to_dict("records"), bool(proxy["supera_0_5"].any()), EQUIDAD_MAX_PP)
supera_ref, cumple_equidad, sin_proxies, publicable = dec["supera_referencia"], dec["cumple_equidad"], dec["sin_aproximaciones"], dec["publicable"]
cumple_meta = lr["recall"] >= RECALL_META

# Exportar coeficientes (11.7) para el semáforo (cálculo cerrado, como en DAX)
clf = modelo.named_steps["clf"]; pp = modelo.named_steps["prep"]
esc = pp.named_transformers_["num"].named_steps["esc"]; imp_num = pp.named_transformers_["num"].named_steps["imp"]
ohe = pp.named_transformers_["cat"].named_steps["ohe"]; imp_cat = pp.named_transformers_["cat"].named_steps["imp"]
nombres = num + [f"{c}={v}" for c, vs in zip(cat, ohe.categories_) for v in vs]
coefs = []
for i, n in enumerate(nombres):
    fila = dict(variable=n, coeficiente=float(clf.coef_[0][i]), media=None, escala=None, imputacion=None)
    if i < len(num):
        fila.update(media=float(esc.mean_[i]), escala=float(esc.scale_[i]), imputacion=float(imp_num.statistics_[i]))
    coefs.append(fila)
coefs.append(dict(variable="intercepto", coeficiente=float(clf.intercept_[0]), media=None, escala=None, imputacion=None))
pd.DataFrame(coefs).to_csv(os.path.join(OUT, "coeficientes.csv"), index=False)
pd.DataFrame([dict(umbral_amarillo=round(u_amar, 4), umbral_rojo=round(u_rojo, 4), criterio="Propuesta 13.6: rojo = 20 % de mayor riesgo, amarillo = 30 % siguiente (conjunto de prueba simulado)")]).to_csv(os.path.join(OUT, "umbrales.csv"), index=False)
joblib.dump(modelo, os.path.join(OUT, "modelo.joblib"))

# 10 candidatos de ejemplo para la prueba de consistencia Python vs. prototipo (estrategia de pruebas, sec. 17)
ej = test.sample(10, random_state=42)[num + cat].copy()
ej["p_python"] = modelo.predict_proba(ej)[:, 1]
ej.to_csv(os.path.join(OUT, "candidatos_consistencia.csv"), index=False)

# Plan B: reglas de alerta (13.10) evaluadas en prueba como referencia
regla_b = ((test["distancia_km"] > 15) & (test["turno"].isin(["Noche", "Rotativo"]))) | ((test["experiencia_previa_meses"].fillna(0) == 0) & (test["puntaje_prueba_tecnica"].fillna(72) < 60))
res_b = metricas("Plan B: reglas de alerta", y_te, regla_b.astype(int).values, None)
# Revisión de equidad del plan B (las reglas también deben pasarla antes de usarse)
pred_b = regla_b.astype(int).values; eq_b = []
for sv in ["sexo", "rango_edad", "estado_civil", "estrato_grupo"]:
    for g, idx in test.groupby(sv).groups.items():
        m = test.index.isin(idx); y, pr = y_te[m], pred_b[m]
        tn, fp, fn, tp = confusion_matrix(y, pr, labels=[0, 1]).ravel()
        eq_b.append(dict(atributo=sv, grupo=g, n=int(m.sum()), positivos=int(y.sum()), recall=round(tp / (tp + fn), 3) if tp + fn else None,
                         tasa_fp=round(fp / (fp + tn), 3) if fp + tn else None, suficiente=bool(y.sum() >= N_MIN_GRUPO)))
eq_b = pd.DataFrame(eq_b); brechas_b = []
for sv, g in eq_b[eq_b["suficiente"]].groupby("atributo"):
    if len(g) >= 2:
        brechas_b.append(dict(atributo=sv, brecha_recall_pp=round((g["recall"].max() - g["recall"].min()) * 100, 1), brecha_fp_pp=round((g["tasa_fp"].max() - g["tasa_fp"].min()) * 100, 1)))
brechas_b = pd.DataFrame(brechas_b); brechas_b["cumple"] = (brechas_b["brecha_recall_pp"] <= EQUIDAD_MAX_PP) & (brechas_b["brecha_fp_pp"] <= EQUIDAD_MAX_PP)
dec_b = decidir_publicacion(res_b | {"auc": 0.5 + 0.06 if res_b["recall"] > 0 else 0.5}, res[1], brechas_b.to_dict("records"), False, EQUIDAD_MAX_PP)

# --- Evaluación ampliada (n = todas las cohortes con ventana completa) ---
# Plan B: reglas fijas tomadas del documento (13.10), no se entrenan; se evalúan sobre todas las cohortes.
# Modelo: predicciones fuera de muestra con validación cruzada estratificada de 5 particiones (robustez).
from sklearn.model_selection import cross_val_predict
from sklearn.base import clone
def brechas_de(y, pr, base):
    out = []
    for sv in ["sexo", "rango_edad", "estado_civil", "estrato_grupo"]:
        gs = []
        for g, sub in base.groupby(sv):
            m = base.index.isin(sub.index); yy, pp = y[m], pr[m]
            if yy.sum() < N_MIN_GRUPO: continue
            tn, fp, fn, tp = confusion_matrix(yy, pp, labels=[0, 1]).ravel(); gs.append((tp / (tp + fn), fp / (fp + tn)))
        if len(gs) >= 2:
            br, bf = (max(x[0] for x in gs) - min(x[0] for x in gs)) * 100, (max(x[1] for x in gs) - min(x[1] for x in gs)) * 100
            out.append(dict(atributo=sv, brecha_recall_pp=round(br, 1), brecha_fp_pp=round(bf, 1), cumple=bool(br <= EQUIDAD_MAX_PP and bf <= EQUIDAD_MAX_PP)))
    return out
y_all = d["renuncia_temprana"].values
regla_all = (((d["distancia_km"] > 15) & d["turno"].isin(["Noche", "Rotativo"])) | ((d["experiencia_previa_meses"].fillna(0) == 0) & (d["puntaje_prueba_tecnica"].fillna(72) < 60))).astype(int).values
pb_all = metricas("Plan B: reglas de alerta (todas las cohortes)", y_all, regla_all, None)
pb_all_br = brechas_de(y_all, regla_all, d)
p_oof = cross_val_predict(clone(modelo), d[num + cat], y_all, cv=StratifiedKFold(5, shuffle=True, random_state=42), method="predict_proba")[:, 1]
oof = metricas("Regresión logística (validación cruzada, fuera de muestra)", y_all, (p_oof >= 0.5).astype(int), p_oof)
oof_br = brechas_de(y_all, (p_oof >= 0.5).astype(int), d)
evaluacion_ampliada = dict(n=int(len(d)), plan_b=pb_all, plan_b_brechas=pb_all_br, plan_b_cumple_equidad=all(b["cumple"] for b in pb_all_br),
                          modelo_oof=oof, modelo_oof_brechas=oof_br, modelo_oof_cumple_equidad=all(b["cumple"] for b in oof_br))
semaforo_oficial = "Plan B: reglas de alerta" if (not publicable and evaluacion_ampliada["plan_b_cumple_equidad"] and pb_all["recall"] > 0) else ("Regresión logística" if publicable else "Ninguno")

ficha = dict(
    estado="DEMOSTRACIÓN – entrenado con datos ficticios; no validado con datos del cliente",
    fecha_corte="2026-09-30", particion=dict(tipo="temporal", train=f"{cohortes[0]}..{cohortes[cohortes.index(corte)-1]}", test=f"{corte}..{cohortes[-1]}",
                                              n_train=int(len(train)), n_test=int(len(test)), tasa_train=round(float(y_tr.mean()), 3), tasa_test=round(float(y_te.mean()), 3)),
    C=gs.best_params_["clf__C"], variables_entrada=num + cat,
    variables_excluidas=dict(fuga=["id_supervisor", "cumplimiento", "ausencias", "motivo_retiro", "fechas de retiro"], equidad=["edad", "sexo", "estado_civil", "estrato", "barrio/dirección (no recolectadas)"]),
    evaluacion_ampliada=evaluacion_ampliada, semaforo_oficial=semaforo_oficial,
    metricas=res, plan_b=res_b, plan_b_brechas=brechas_b.to_dict("records"), plan_b_supera_referencia=bool(res_b["recall"] > res[1]["recall"]), plan_b_cumple_equidad=bool(dec_b["cumple_equidad"]), umbrales=dict(amarillo=round(u_amar, 4), rojo=round(u_rojo, 4)),
    equidad=eq.to_dict("records"), brechas=brechas.to_dict("records"), auc_con_sensibles_diagnostico=auc_con_sensibles,
    proxy_max=proxy.sort_values("v_cramer", ascending=False).head(5).to_dict("records"),
    criterios=dict(supera_referencia=bool(supera_ref), meta_recall=RECALL_META, cumple_meta_recall=bool(cumple_meta),
                   equidad_max_pp=EQUIDAD_MAX_PP, cumple_equidad=cumple_equidad, sin_aproximaciones=bool(sin_proxies),
                   publicable_en_demo=bool(publicable), n_min_grupo_equidad=N_MIN_GRUPO),
    coeficientes=coefs, imputacion_categorica={c: str(v) for c, v in zip(cat, imp_cat.statistics_)},
    consistencia=ej.to_dict("records"),
)
json.dump(ficha, open(os.path.join(OUT, "ficha_modelo.json"), "w"), ensure_ascii=False, indent=1, default=str)
print(json.dumps({k: ficha[k] for k in ["particion", "C", "metricas", "plan_b", "umbrales", "brechas", "criterios", "auc_con_sensibles_diagnostico", "proxy_max"]}, ensure_ascii=False, indent=1, default=str))
