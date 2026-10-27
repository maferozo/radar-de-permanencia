"""
Radar de permanencia - Generador de DATOS FICTICIOS DE DEMOSTRACIÓN.

IMPORTANTE: ningún valor de este archivo proviene del cliente. Los datos se
simulan con reglas explícitas (documentadas abajo) y semilla fija (42) para
poder demostrar el pipeline, el dashboard y el semáforo (sección 4.2 del
documento técnico: "si el cliente no dispone de alguna fuente, la tabla se
simula ... documentando qué se simuló y con qué reglas").

Salida: datos_demo/bronce/2026-09-30/*.csv  (capa bronce simulada)
Incluye errores de calidad intencionales para probar el ETL (CU-08):
duplicados exactos, retiros anteriores al ingreso, retiros huérfanos,
puntajes fuera de dominio y nulos.
"""
import os
import numpy as np
import pandas as pd

SEED = 42
FECHA_CORTE = pd.Timestamp("2026-09-30")
BASE = os.path.join(os.path.dirname(__file__), "..", "datos_demo", "bronce", "2026-09-30")
rng = np.random.default_rng(SEED)

CAMPANAS = ["Campaña A · Telecomunicaciones", "Campaña B · Banca", "Campaña C · Salud", "Campaña D · Retail"]
TURNOS = ["Mañana", "Tarde", "Noche", "Rotativo"]
EDU = ["Bachiller", "Técnico", "Tecnólogo", "Profesional"]
CANALES = ["Referido", "Portal de empleo", "Redes sociales", "Feria"]

# 15 supervisores ficticios; SUP-15 tiene pocas personas (para demostrar la exclusión de grupos pequeños)
SUPERVISORES = []
for i in range(1, 16):
    SUPERVISORES.append({"id_supervisor": f"SUP-{i:02d}", "campana": CAMPANAS[(i - 1) % 4]})
SUP_EFECTO = {s["id_supervisor"]: 0.0 for s in SUPERVISORES}
SUP_EFECTO.update({"SUP-03": 0.75, "SUP-07": 0.55, "SUP-10": -0.45})  # regla de simulación

# Contrataciones mensuales jul-2024 .. sep-2026
meses = pd.period_range("2024-07", "2026-09", freq="M")
filas = []
n_id = 0
for m in meses:
    n_mes = int(rng.normal(115, 15))
    for _ in range(n_mes):
        n_id += 1
        dia = int(rng.integers(1, 28))
        fecha_ingreso = pd.Timestamp(year=m.year, month=m.month, day=dia)
        campana = rng.choice(CAMPANAS, p=[0.34, 0.26, 0.22, 0.18])
        sups = [s["id_supervisor"] for s in SUPERVISORES if s["campana"] == campana]
        pesos = np.array([0.04 if s == "SUP-15" else 1.0 for s in sups]); pesos /= pesos.sum()
        sup = rng.choice(sups, p=pesos)
        turno = rng.choice(TURNOS, p=[0.34, 0.30, 0.18, 0.18])
        distancia = float(np.clip(rng.lognormal(2.1, 0.6), 0.5, 100))
        exp = 0 if rng.random() < 0.35 else int(np.clip(rng.gamma(2.0, 8.0), 1, 120))
        edu = rng.choice(EDU, p=[0.42, 0.28, 0.18, 0.12])
        canal = rng.choice(CANALES, p=[0.25, 0.40, 0.25, 0.10])
        puntaje = float(np.clip(rng.normal(72, 12), 20, 100))
        # Variables sensibles SIMULADAS: solo para revisión de equidad, nunca entran al modelo
        edad = int(np.clip(rng.normal(25, 5), 18, 55))
        sexo = rng.choice(["Femenino", "Masculino"], p=[0.58, 0.42])
        estado_civil = rng.choice(["Soltero/a", "Casado/a o unión libre", "Otro"], p=[0.62, 0.32, 0.06])
        estrato = int(rng.choice([1, 2, 3, 4, 5, 6], p=[0.18, 0.38, 0.30, 0.09, 0.04, 0.01]))

        # Regla de simulación del riesgo (NO es un hallazgo real)
        logit = -1.55
        logit += 0.85 if distancia > 15 else (0.35 if distancia > 10 else 0.0)
        logit += {"Mañana": 0.0, "Tarde": 0.15, "Noche": 0.65, "Rotativo": 0.35}[turno]
        logit += 0.55 if exp == 0 else (-0.25 if exp > 12 else 0.0)
        logit += -0.025 * (puntaje - 72)
        logit += {"Referido": -0.55, "Portal de empleo": 0.0, "Redes sociales": 0.2, "Feria": 0.1}[canal]
        logit += {CAMPANAS[0]: 0.35, CAMPANAS[1]: -0.1, CAMPANAS[2]: 0.0, CAMPANAS[3]: 0.15}[campana]
        logit += SUP_EFECTO[sup]
        p = 1 / (1 + np.exp(-logit))

        fecha_retiro, tipo = None, None
        u = rng.random()
        if u < p:  # renuncia voluntaria temprana
            mes_ret = rng.choice([1, 2, 3, 4, 5, 6], p=[0.16, 0.27, 0.22, 0.15, 0.11, 0.09])
            dias = int(rng.integers((mes_ret - 1) * 30 + 1, mes_ret * 30 + 1))
            fecha_retiro, tipo = fecha_ingreso + pd.Timedelta(days=dias), "Voluntario"
        elif u < p + 0.05:  # despidos (se muestran aparte, no son renuncia temprana)
            dias = int(rng.integers(20, 400))
            fecha_retiro, tipo = fecha_ingreso + pd.Timedelta(days=dias), "Despido"
        elif u < p + 0.17:  # renuncias voluntarias posteriores a 180 días
            dias = int(rng.integers(181, 600))
            fecha_retiro, tipo = fecha_ingreso + pd.Timedelta(days=dias), "Voluntario"
        if fecha_retiro is not None and fecha_retiro > FECHA_CORTE:
            fecha_retiro, tipo = None, None  # aún no ha ocurrido a la fecha de corte

        filas.append(dict(
            id_empleado=f"EMP-{n_id:05d}", nombre=f"Persona ficticia {n_id:05d}", documento=f"SIM{n_id:08d}",
            fecha_ingreso=fecha_ingreso.date().isoformat(), campana=campana, turno=turno, id_supervisor=sup,
            distancia_km=round(distancia, 1), experiencia_previa_meses=exp, nivel_educativo=edu,
            canal_reclutamiento=canal, puntaje_prueba_tecnica=round(puntaje, 1),
            edad=edad, sexo=sexo, estado_civil=estado_civil, estrato=estrato,
            _fecha_retiro=None if fecha_retiro is None else fecha_retiro.date().isoformat(), _tipo=tipo,
        ))

df = pd.DataFrame(filas)
empleados = df.drop(columns=["_fecha_retiro", "_tipo"]).copy()
retiros = df.loc[df["_fecha_retiro"].notna(), ["id_empleado", "_fecha_retiro", "_tipo"]].rename(
    columns={"_fecha_retiro": "fecha_retiro", "_tipo": "tipo_retiro"})

# ---- Motivo declarado de retiro (encuesta de salida SIMULADA, HU-10) ----
# Generador aparte (semilla 4242) para no alterar el resto del dataset.
rng_m = np.random.default_rng(4242)
MOTIVOS = ["Horario", "Salario", "Estudio", "Clima laboral", "Otro"]
info = df.set_index("id_empleado")
def motivo(idx):
    r = info.loc[idx]
    w = np.array([0.22, 0.26, 0.14, 0.14, 0.24])
    if r["turno"] in ("Noche", "Rotativo"): w[0] += 0.22      # regla: turnos difíciles → horario
    if r["distancia_km"] > 15: w[0] += 0.10                    # desplazamiento largo → horario
    if r["id_supervisor"] in ("SUP-03", "SUP-07"): w[3] += 0.30  # supervisores con más rotación → clima laboral
    if r["experiencia_previa_meses"] == 0: w[1] += 0.06
    w = w / w.sum()
    return rng_m.choice(MOTIVOS, p=w) if rng_m.random() > 0.12 else None  # 12 % sin respuesta a la encuesta
retiros["motivo_retiro"] = [motivo(i) if t == "Voluntario" else None for i, t in zip(retiros["id_empleado"], retiros["tipo_retiro"])]

# ---- Errores de calidad intencionales (para demostrar las reglas 11.8) ----
idx_null_exp = rng.choice(empleados.index, 50, replace=False)
empleados.loc[idx_null_exp, "experiencia_previa_meses"] = np.nan
idx_null_canal = rng.choice(empleados.index, 30, replace=False)
empleados.loc[idx_null_canal, "canal_reclutamiento"] = np.nan
idx_dom = rng.choice(empleados.index, 3, replace=False)
empleados.loc[idx_dom, "puntaje_prueba_tecnica"] = [105.0, 130.0, -4.0]
empleados = pd.concat([empleados, empleados.sample(15, random_state=SEED)], ignore_index=True)  # duplicados exactos
malas = retiros.sample(6, random_state=7).copy()
for i in malas.index:  # retiro anterior al ingreso
    ing = pd.Timestamp(df.loc[df["id_empleado"] == malas.at[i, "id_empleado"], "fecha_ingreso"].iloc[0])
    retiros.loc[i, "fecha_retiro"] = (ing - pd.Timedelta(days=10)).date().isoformat()
huerfanos = pd.DataFrame({"id_empleado": ["EMP-99901", "EMP-99902", "EMP-99903"],
                          "fecha_retiro": ["2025-03-01", "2025-05-10", "2025-08-20"], "tipo_retiro": "Voluntario"})
retiros = pd.concat([retiros, huerfanos], ignore_index=True)

# Desempeño mensual simulado (solo dashboard; nunca entra al modelo)
des = []
for r in df.rename(columns={'_fecha_retiro':'fr'}).itertuples():
    ini = pd.Timestamp(r.fecha_ingreso).to_period("M")
    fin = (pd.Timestamp(r.fr) if isinstance(r.fr, str) else FECHA_CORTE).to_period("M")
    for per in pd.period_range(ini, min(fin, ini + 5), freq="M"):
        des.append((r.id_empleado, str(per), round(float(np.clip(rng.normal(92, 18), 0, 200)), 1), int(rng.poisson(0.8))))
desempeno = pd.DataFrame(des, columns=["id_empleado", "periodo", "cumplimiento_metas_pct", "ausencias"])

os.makedirs(BASE, exist_ok=True)
empleados.to_csv(os.path.join(BASE, "empleados.csv"), index=False)
retiros.to_csv(os.path.join(BASE, "retiros.csv"), index=False)
desempeno.to_csv(os.path.join(BASE, "desempeno.csv"), index=False)
pd.DataFrame(SUPERVISORES).to_csv(os.path.join(BASE, "supervisores.csv"), index=False)
# Costos de reemplazo SIMULADOS (HU-05). Valores por persona en COP, supuestos del equipo para la demostración.
pd.DataFrame([dict(costo_reclutamiento=450000, costo_formacion=1200000, costo_tiempo_improductivo=900000,
                   fuente="SIMULADO: supuestos del equipo (sección 4.2); pendientes de validar con el cliente")]).to_csv(os.path.join(BASE, "costos.csv"), index=False)
with open(os.path.join(BASE, "LEEME_DATOS_FICTICIOS.txt"), "w", encoding="utf-8") as f:
    f.write("DATOS FICTICIOS DE DEMOSTRACIÓN generados con semilla 42 por pipeline/01_generar_datos_demo.py.\n"
            "No representan personas ni resultados reales del cliente. costos.csv y motivo_retiro también son simulados (HU-05, HU-10).\n")
print(f"empleados={len(empleados)} retiros={len(retiros)} desempeno={len(desempeno)}")
