"""
Pruebas funcionales de extremo a extremo (CU-01 a CU-07) y pruebas de rendimiento del prototipo.
Requiere: pip install playwright  y  python -m playwright install chromium  (si no está instalado).
Ejecutar desde la raíz, tras construir el prototipo (cd prototipo && npm run build):
    python3 pruebas/test_e2e.py
Salidas: pruebas/resultados_e2e.json, metricas/rendimiento/resultados_rendimiento.json y capturas en evidencias/capturas/.
"""
import json, os, platform, statistics, time, datetime, re
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file://" + os.path.join(RAIZ, "prototipo", "dist", "index.html")
CAP = os.path.join(RAIZ, "evidencias", "capturas"); os.makedirs(CAP, exist_ok=True)
res, errores_consola = [], []

def prueba(id_, cu, nombre, pre, entrada, pasos, esperado):
    def deco(fn):
        try:
            ok, obs, ev = fn()
        except Exception as e:  # noqa: BLE001
            ok, obs, ev = False, f"Error: {str(e).splitlines()[0][:200]}", ""
        res.append(dict(id=id_, cu=cu, nombre=nombre, precondiciones=pre, entrada=entrada, pasos=pasos, esperado=esperado, observado=obs, estado="Aprobada" if ok else "Fallida", evidencia=ev))
        print(("OK   " if ok else "FALLA"), id_, nombre, "→", obs)
        return fn
    return deco

def t(sel): return f"[data-testid={sel}]"

with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 1360, "height": 900}, locale="es-CO", permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errores_consola.append(str(e)))
    pg.on("console", lambda m: errores_consola.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto(URL); pg.wait_for_selector(t("kpi-tasa"))
    def ir(r): pg.click(t("nav-" + r)); pg.wait_for_timeout(150)
    def txt(s): return pg.locator(t(s)).inner_text()
    def val(s): return pg.locator(t(s) + " .val").inner_text()

    PRE_DASH = "Prototipo construido (dist/index.html) con datos ficticios cargados"

    @prueba("PF-01", "CU-01", "Consultar panorama", PRE_DASH, "Ninguna", "Abrir la pantalla Panorama", "Tarjetas de tasa, renuncias, mes crítico y costo; gráfico por cohorte y por mes")
    def _():
        tasa, ren, mes, costo = txt("kpi-tasa"), txt("kpi-renuncias"), txt("kpi-mes"), txt("kpi-costo")
        graf = pg.locator(t("graf-cohortes") + " .recharts-line-dot").count() > 0 and pg.locator(t("graf-meses") + " .recharts-bar-rectangle").count() == 6
        pg.screenshot(path=os.path.join(CAP, "PF-01_panorama.png"), full_page=True)
        ok = "30,9" in tasa and "780" in ren and "Mes 2" in mes and graf
        return ok, f"Tasa {val('kpi-tasa')}; renuncias {val('kpi-renuncias')}; {val('kpi-mes')}; 6 barras por mes", "PF-01_panorama.png"

    @prueba("PF-02", "CU-01 / HU-05", "Costo estimado y flujo sin costos", PRE_DASH, "Supuestos simulados; luego «Quitar supuestos»", "Revisar la tarjeta, abrir supuestos y quitarlos", "Muestra el costo con supuestos simulados; sin supuestos indica «Sin datos de costo» (A1)")
    def _():
        c1 = val("kpi-costo"); pg.click(t("abrir-costos")); pg.click("text=Quitar supuestos"); c2 = txt("kpi-costo")
        pg.reload(); pg.wait_for_selector(t("kpi-tasa"))
        return "$" in c1 and "1.989" in c1 and "Sin datos de costo" in c2, f"Con supuestos: {c1}; sin supuestos: «Sin datos de costo»", ""

    @prueba("PF-03", "CU-01", "Detalle de cohorte al pasar el cursor", PRE_DASH, "Cursor sobre un punto", "Mover el cursor sobre el gráfico de cohortes", "Tooltip con tasa, renuncias y contratados")
    def _():
        pg.locator(t("graf-cohortes")).scroll_into_view_if_needed(); box = pg.locator(t("graf-cohortes")).bounding_box(); pg.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5); pg.wait_for_timeout(200)
        tip = pg.locator(".tooltip").first.inner_text(); return "Cohorte" in tip and "renuncias de" in tip, tip.replace("\n", " · "), ""

    @prueba("PF-04", "CU-02", "Aplicar filtro de campaña", PRE_DASH, "Campaña A · Telecomunicaciones", "Seleccionar la campaña", "Todos los visuales se recalculan")
    def _():
        antes = txt("kpi-tasa"); pg.select_option(t("f-campana"), index=1); pg.wait_for_timeout(150); despues = txt("kpi-tasa")
        ir("causas"); sup = pg.locator(t("graf-supervisor") + " .recharts-bar-rectangle").count(); ir("panorama")
        pg.screenshot(path=os.path.join(CAP, "PF-04_filtro_campana.png"))
        return antes != despues and sup < 15, f"Tasa global → campaña A: {despues.split(chr(10))[0] if False else val('kpi-tasa')}; supervisores en Causas: {sup} de 15", "PF-04_filtro_campana.png"

    @prueba("PF-05", "CU-02", "Limpiar filtros", "Filtro de campaña aplicado", "Botón «Limpiar filtros»", "Seleccionar «Limpiar filtros»", "Vuelve a la vista completa")
    def _():
        pg.click(t("limpiar-filtros")); pg.wait_for_timeout(150)
        return "30,9" in txt("kpi-tasa") and pg.locator(t("limpiar-filtros")).is_disabled(), f"Tasa vuelve a {val('kpi-tasa')}; botón deshabilitado sin filtros", ""

    @prueba("PF-06", "CU-02 (A1)", "Filtro sin registros", PRE_DASH, "Campaña D · Retail + supervisor de otra campaña (período 2026-04 a 2026-04, SUP-15)", "Combinar filtros que no tienen registros", "Mensaje «Sin datos para esta selección»")
    def _():
        pg.select_option(t("f-desde"), "2026-04"); pg.select_option(t("f-hasta"), "2026-04"); pg.select_option(t("f-supervisor"), "SUP-15"); pg.wait_for_timeout(150)
        vis = pg.locator(t("estado-vacio")).is_visible(); msg = pg.locator(t("estado-vacio")).inner_text() if vis else ""
        pg.screenshot(path=os.path.join(CAP, "PF-06_sin_registros.png")); pg.click(t("limpiar-filtros"))
        return vis and "Sin datos" in msg, msg.splitlines()[0] if msg else "no apareció", "PF-06_sin_registros.png"

    @prueba("PF-07", "CU-03", "Analizar causas por supervisor y prueba técnica", PRE_DASH, "Mínimo por grupo = 30", "Abrir Causas", "Barras por supervisor con n; grupos pequeños en gris con aviso; conclusión de la prueba")
    def _():
        ir("causas"); aviso = pg.locator(t("aviso-grupo-pequeno")).inner_text(); concl = txt("conclusion-prueba")
        etiquetas = " ".join(pg.locator(t("graf-supervisor") + " .recharts-label-list").all_text_contents())
        pg.screenshot(path=os.path.join(CAP, "PF-07_causas.png"), full_page=True)
        return "no se compara" in etiquetas and "1 supervisor" in aviso and "Conclusión" in concl, f"{aviso} | {concl.splitlines()[0][:90]}", "PF-07_causas.png"

    @prueba("PF-08", "CU-03", "Elegir variable de perfil y top 3", "Pantalla Causas abierta", "Variable = Turno", "Cambiar la variable de perfil", "El gráfico cambia a turnos y se resaltan 3 perfiles")
    def _():
        pg.select_option(t("sel-perfil"), "turno"); pg.wait_for_timeout(150)
        ticks = pg.locator(t("graf-perfil") + " .recharts-xAxis .recharts-cartesian-axis-tick").all_text_contents()
        top = pg.locator(t("tabla-top-perfiles") + " tbody tr").count()
        return "Noche" in ticks and top == 3, f"Ejes: {', '.join(ticks)}; top perfiles = {top}", ""

    @prueba("PF-09", "CU-03 / HU-10", "Motivos declarados y contraste con hallazgos", "Encuesta de salida simulada", "—", "Revisar la tarjeta de motivos", "Top 5 motivos con porcentaje y coincidencias o contradicciones con HU-07 a HU-09")
    def _():
        n = pg.locator(t("graf-motivos") + " .recharts-bar-rectangle").count(); c = txt("contraste-motivos")
        return n == 5 and "coincide" in c, f"{n} motivos; " + c.splitlines()[0][:110], ""

    @prueba("PF-10", "CU-04", "Consultar resumen y acciones", PRE_DASH, "—", "Abrir Resumen y acciones", "3 a 5 factores con evidencia, tasas, diferencia, n, interpretación y recomendación; aviso de datos simulados")
    def _():
        ir("resumen"); n = pg.locator(t("factor")).count(); f1 = pg.locator(t("factor")).first.inner_text()
        pg.screenshot(path=os.path.join(CAP, "PF-10_resumen.png"), full_page=True)
        ok = 3 <= n <= 5 and "Recomendación" in f1 and "tasa general" in f1.lower() and pg.locator(t("aviso-simulado")).is_visible()
        return ok, f"{n} factores; primero: " + [l for l in f1.splitlines() if ":" in l][0], "PF-10_resumen.png"

    @prueba("PF-11", "CU-04", "Ir al gráfico que respalda el factor", "Resumen abierto", "Botón «Ver en Causas» del factor 1", "Seleccionar el botón", "Navega a Causas con la sección del factor")
    def _():
        pg.locator(t("ver-grafico")).first.click(); pg.wait_for_timeout(400)
        return txt("titulo-pantalla") == "Causas" and pg.url.endswith("#causas"), f"Pantalla: {txt('titulo-pantalla')}; variable de perfil: {pg.locator(t('sel-perfil')).input_value()}", ""

    @prueba("PF-12", "CU-05", "Evaluar candidato con el modelo (comparación)", "Coeficientes exportados; modelo no publicado", "Candidato ficticio de ejemplo (Noche, 18 km, 0 meses, puntaje 58)", "Abrir Semáforo, elegir la pestaña del modelo y evaluar", "Probabilidad, color, 3 factores y aviso de decisión humana")
    def _():
        ir("semaforo"); pg.click(t("modo-modelo")); pg.click(t("evaluar")); pg.wait_for_selector(t("resultado"))
        prob, color, aviso = txt("probabilidad"), txt("color"), txt("aviso-humano")
        pg.screenshot(path=os.path.join(CAP, "PF-12_semaforo.png"), full_page=True)
        return "%" in prob and "rojo" in color and "decisión final corresponde al reclutador" in aviso, f"{prob} · {color} · aviso visible", "PF-12_semaforo.png"

    @prueba("PF-13", "CU-06", "Ver explicación del riesgo", "CU-05 ejecutado", "—", "Revisar los factores", "3 factores con «Aumenta/Disminuye el riesgo» y acción sugerida")
    def _():
        f = txt("factores"); n = f.count("Acción sugerida"); s = len(re.findall(r"(Aumenta|Disminuye) el riesgo", f))
        return n == 3 and s == 3, f"{n} acciones y {s} indicaciones de dirección", ""

    @prueba("PF-14", "CU-05 (A1)", "Campos obligatorios vacíos", "Pantalla Semáforo", "Formulario vacío", "«Limpiar formulario» y «Evaluar candidato»", "Indica los 7 campos faltantes y no calcula")
    def _():
        pg.click(t("limpiar-form")); pg.click(t("evaluar")); e = txt("errores")
        pg.screenshot(path=os.path.join(CAP, "PF-14_validacion.png"))
        return e.count("Falta") == 7 and pg.locator(t("resultado")).count() == 0, f"{e.count('Falta')} mensajes «Falta el campo…»; sin resultado", "PF-14_validacion.png"

    @prueba("PF-15", "CU-05 (A2)", "Puntaje superior a 100", "Formulario completo", "Puntaje = 120", "Ingresar 120 y evaluar", "Mensaje de rango; no calcula")
    def _():
        pg.click("text=Cargar ejemplo"); pg.fill(t("in-puntaje"), "120"); pg.click(t("evaluar"))
        return "entre 0 y 100" in txt("errores") and pg.locator(t("resultado")).count() == 0, txt("errores"), ""

    @prueba("PF-16", "CU-05", "Umbrales inválidos", "Formulario válido", "Amarillo 70 %, rojo 50 %", "Cambiar umbrales y evaluar", "Mensaje de error; no calcula")
    def _():
        pg.click("text=Cargar ejemplo"); pg.fill(t("u-amarillo"), "70"); pg.fill(t("u-rojo"), "50"); pg.click(t("evaluar"))
        ok = "menor que el rojo" in txt("errores") and pg.locator(t("resultado")).count() == 0
        pg.click("text=Restablecer propuesta"); return ok, "«El umbral amarillo debe ser menor que el rojo.»", ""

    @prueba("PF-17", "CU-05 / HU-12", "Umbrales configurables cambian el color", "Formulario válido", "Rojo desde 95 %, amarillo desde 90 %", "Evaluar con umbrales altos", "La misma probabilidad pasa a verde")
    def _():
        pg.fill(t("u-amarillo"), "90"); pg.fill(t("u-rojo"), "95"); pg.click(t("evaluar")); c = txt("color"); pg.click("text=Restablecer propuesta")
        return "verde" in c, f"Color con umbrales 90/95: {c}", ""

    @prueba("PF-18", "CU-05 / HU-16", "No almacenar datos del candidato", "Formulario con distancia 33", "Distancia 33 km, evaluar y recargar", "Recargar la página", "Ni el formulario ni el almacenamiento conservan los datos")
    def _():
        pg.fill(t("in-distancia"), "33"); pg.click(t("evaluar"))
        store = pg.evaluate("JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage))")
        pg.reload(); pg.wait_for_selector(t("form-candidato")); val = pg.locator(t("in-distancia")).input_value()
        return "33" not in store and val != "33", f"almacenamiento sin datos del candidato; distancia tras recargar = {val} (ejemplo)", ""

    @prueba("PF-19", "CU-05 / CU-09 (A1)", "Semáforo oficial: reglas de alerta (plan B)", "Pantalla Semáforo", "Candidato de ejemplo", "Elegir «Plan B» y evaluar", "Semáforo por reglas, sin probabilidad, con reglas activadas, acción sugerida y aviso humano")
    def _():
        pg.click(t("modo-reglas")); pg.click(t("evaluar")); r = txt("reglas"); c = txt("color"); pg.click(t("modo-modelo"))
        return "Distancia mayor a 15 km y turno" in r and "Acción sugerida" in r and "rojo" in c and pg.locator(t("probabilidad")).count() == 0, f"{c}; {r.splitlines()[1]}", ""

    @prueba("PF-20", "CU-07", "Consultar confiabilidad del modelo", "Modelo evaluado con conjunto de prueba", "—", "Seleccionar «Ver detalle»", "Recall, falsas alarmas, comparación con la referencia y revisión de equidad en lenguaje sencillo")
    def _():
        pg.click(t("ver-detalle")); d = txt("detalle-confiabilidad"); c = txt("confiabilidad")
        pg.screenshot(path=os.path.join(CAP, "PF-20_confiabilidad.png"), full_page=True)
        eq = txt("equidad-plan-b")
        return "Referencia" in d and "No cumple" in d and "De cada 10" in c and eq.count("Cumple") == 4, "Lenguaje sencillo + comparación con la referencia + equidad: plan B cumple en los 4 atributos; modelo no cumple", "PF-20_confiabilidad.png"

    @prueba("PF-21", "Navegación", "Navegar entre pantallas y volver al panorama", PRE_DASH, "—", "Abrir cada pantalla y usar «Volver al panorama»", "Cada pantalla abre y el botón regresa a Panorama")
    def _():
        tit = []
        for r in ["panorama", "causas", "resumen", "semaforo", "seguimiento"]:
            ir(r); tit.append(txt("titulo-pantalla"))
        pg.click(t("volver-panorama")); pg.wait_for_timeout(150)
        return txt("titulo-pantalla") == "Panorama" and len(set(tit)) == 5, " → ".join(tit) + " → Panorama", ""

    @prueba("PF-22", "Burndown", "Registrar avance y recalcular", "Pantalla Seguimiento", "Sprint 1: registro final con 11 puntos aceptados", "Cambiar el valor del registro", "Restantes = 11 y el gráfico se recalcula")
    def _():
        ir("seguimiento"); pg.select_option(t("burndown-sel"), "S1"); pg.fill(t("b-pts-1"), "11"); pg.wait_for_timeout(150)
        r = txt("b-restantes"); pg.screenshot(path=os.path.join(CAP, "PF-22_burndown_edicion.png"), full_page=True)
        pg.click("text=Restaurar datos de Jira"); r2 = txt("b-restantes")
        return r == "11" and r2 == "22", f"Restantes con 11 aceptados = {r}; tras restaurar Jira = {r2}", "PF-22_burndown_edicion.png"

    @prueba("PF-23", "DORA", "Métricas sin despliegues", "Registro DORA vacío", "—", "Abrir la pestaña Métricas DORA", "Las 4 métricas en «Sin despliegues medidos»")
    def _():
        pg.click(t("tab-dora")); n = pg.locator(t("tabla-dora") + " >> text=Sin despliegues medidos").count()
        pg.screenshot(path=os.path.join(CAP, "PF-23_dora.png"), full_page=True)
        return n == 4, f"{n} de 4 métricas en «Sin despliegues medidos»", "PF-23_dora.png"

    # --------- Mejoras de claridad (v1.2)
    @prueba("PF-26", "CU-01 / CU-02", "Lectura rápida, filtros activos e incluidos/excluidos", PRE_DASH, "Campaña A", "Abrir Panorama, leer la interpretación, aplicar un filtro y abrir «¿Quiénes entran…?»", "Frase «31 de cada 100»; chips con los filtros activos; tabla de incluidos y excluidos con motivo")
    def _():
        ir("panorama"); i = txt("interpretacion"); c0 = pg.locator(t("chip-filtro")).all_text_contents()
        pg.select_option(t("f-campana"), index=1); pg.wait_for_timeout(150); c1 = pg.locator(t("chip-filtro")).all_text_contents(); ctx = txt("kpi-tasa")
        pg.click(t("incluidos-excluidos") + " summary"); tb = txt("incluidos-excluidos"); pg.click(t("limpiar-filtros"))
        pg.screenshot(path=os.path.join(CAP, "PF-26_panorama_lectura.png"), full_page=True)
        ok = "31 de cada 100" in i and "no una predicción" in i and "Todas las campañas" in c0 and any("Campaña A" in x for x in c1) and "frente al total" in ctx and "cohortes recientes" in tb
        return ok, f"Interpretación visible; chips: {' | '.join(c1)}; contexto de la tasa: «{ctx.splitlines()[-1]}»", "PF-26_panorama_lectura.png"

    @prueba("PF-27", "CU-03", "Ranking de factores con interpretación, recomendación y limitaciones", PRE_DASH, "Mínimo por grupo = 30", "Abrir Causas, «Ver detalle» del factor 1 y la ayuda de «p.p.»", "8 variables ordenadas; detalle con dato descriptivo, recomendación (hipótesis) y limitaciones; ayuda explica p.p.")
    def _():
        ir("causas"); filas = pg.locator(t("ranking-factores") + " tbody tr").count(); pg.locator(t("ranking-detalle")).first.click()
        d = txt("ranking-factores"); pg.click(t("ayuda-pp")); ay = pg.locator(".ayuda-pop").first.inner_text(); pg.keyboard.press("Escape")
        cerrado = pg.locator(".ayuda-pop").count() == 0
        pg.screenshot(path=os.path.join(CAP, "PF-27_ranking.png"))
        return filas == 8 and "Prioritario" in d and "Recomendación (hipótesis)" in d and "Limitaciones" in d and "Puntos porcentuales" in ay and cerrado, f"8 variables + fila de detalle; ayuda: «{ay[:60]}…»; se cierra con Escape", "PF-27_ranking.png"

    @prueba("PF-28", "CU-04 / HU-11", "Plan de acción por factor", PRE_DASH, "—", "Abrir Resumen y acciones", "Cada factor con hallazgo, evidencia, interpretación, acción, responsable, plazo, indicador y estado sin marcar como ejecutado")
    def _():
        ir("resumen"); fs = pg.locator(t("factor")).all_inner_texts()
        campos = ["HALLAZGO", "EVIDENCIA", "INTERPRETACIÓN", "RECOMENDACIÓN", "RESPONSABLE SUGERIDO", "PLAZO SUGERIDO", "INDICADOR DE SEGUIMIENTO", "ESTADO"]
        ok = all(all(c in f.upper() for c in campos) for f in fs) and all("Pendiente: sin seguimiento registrado" in f for f in fs)
        return ok, f"{len(fs)} factores con los 8 campos; estado «Pendiente: sin seguimiento registrado»", ""

    @prueba("PF-29", "CU-05 / CU-06", "Semáforo explica reglas, condiciones y limitaciones", "Pantalla Semáforo", "Candidato de ejemplo", "Evaluar con el plan B y abrir «Limitaciones»", "4 condiciones con valor y Sí/No; cada regla con datos que la justifican; limitaciones visibles")
    def _():
        ir("semaforo"); pg.click("text=Cargar ejemplo"); pg.click(t("modo-reglas")); pg.click(t("evaluar"))
        c = pg.locator(t("condiciones") + " tbody tr").count(); r = txt("reglas"); pg.click(t("limitaciones") + " summary"); l = txt("limitaciones")
        pg.screenshot(path=os.path.join(CAP, "PF-29_semaforo_reglas.png"), full_page=True)
        return c == 4 and r.count("Datos que la justifican") == 2 and "16 %" in l, f"{c} condiciones; {r.count('Datos que la justifican')} reglas justificadas; limitaciones: {l.splitlines()[1][:70]}", "PF-29_semaforo_reglas.png"

    @prueba("PF-30", "Pruebas", "Matriz de pruebas filtrable y UAT separada", "Pantalla Seguimiento", "Estado = Fallida; luego Todas", "Filtrar la matriz y revisar la tabla de UAT", "Con «Fallida» no hay filas (mensaje vacío); UAT con 16 historias pendientes")
    def _():
        ir("seguimiento"); pg.click(t("tab-pruebas")); total = txt("p-conteo"); pg.select_option(t("p-estado"), "Fallida"); vacio = pg.locator("text=Ninguna prueba coincide").count()
        pg.select_option(t("p-estado"), "Todas"); uat = pg.locator(t("tabla-uat") + " tbody tr").count(); pend = pg.locator(t("tabla-uat") + " >> text=Pendiente").count()
        pg.screenshot(path=os.path.join(CAP, "PF-30_pruebas.png"))
        return vacio == 1 and uat == 16 and pend == 16, f"{total}; filtro «Fallida» → 0 filas; UAT: {pend} de {uat} pendientes", "PF-30_pruebas.png"

    @prueba("PF-31", "Trazabilidad", "Trazabilidad RF → HU → CU → prueba → estado", "Pantalla Seguimiento", "Filtro «Sin prueba»", "Abrir Trazabilidad y filtrar", "19 requisitos con CU y pruebas; ninguno sin prueba")
    def _():
        pg.click(t("tab-trazabilidad")); n = pg.locator(t("tabla-trazabilidad") + " tbody tr").count(); tx = txt("tabla-trazabilidad")
        pg.click(t("traz-sin-prueba")); sp = pg.locator(t("tabla-trazabilidad") + " tbody tr").count(); pg.click(t("traz-todos"))
        return n == 19 and "CU-08" in tx and "aprobadas" in tx and sp == 0, f"{n} requisitos con caso de uso y pruebas; sin prueba: {sp}", ""

    @prueba("PF-32", "RNF-08", "Accesibilidad: saltar al contenido y glosario", PRE_DASH, "Tecla Tab desde el inicio", "Pulsar Tab, Enter y abrir Glosario", "El primer foco es «Saltar al contenido» y lleva el foco al área principal; el glosario define las siglas")
    def _():
        pg.goto(URL); pg.wait_for_selector(t("kpi-tasa")); pg.keyboard.press("Tab"); primero = pg.evaluate("document.activeElement.textContent")
        pg.keyboard.press("Enter"); foco = pg.evaluate("document.activeElement.id"); ir("glosario"); g = txt("glosario")
        return primero == "Saltar al contenido" and foco == "contenido" and all(x in g for x in ["p.p.", "DoD", "DORA", "UAT"]), f"Primer foco: «{primero}» → foco en #{foco}; glosario con {g.count(chr(10)) // 2} líneas", ""

    # --------- Simulador de escenarios
    PRE_SIM = "Prototipo con datos ficticios; pantalla Simulador de escenarios"
    @prueba("PF-33", "Simulador", "Situación actual coincide con el Panorama y respeta filtros", PRE_SIM, "Sin filtros; luego Campaña A", "Comparar personas, renuncias y tasa del simulador con el Panorama", "Mismos valores en ambos módulos, con y sin filtro")
    def _():
        ir("panorama"); n0, t0 = val("kpi-contratados"), val("kpi-tasa"); ir("simulador"); ok0 = txt("sim-n") == n0 and txt("sim-tasa") == t0
        pg.select_option(t("f-campana"), index=1); pg.wait_for_timeout(150); n1, t1 = txt("sim-n"), txt("sim-tasa"); ir("panorama"); ok1 = val("kpi-contratados") == n1 and val("kpi-tasa") == t1
        pg.click(t("limpiar-filtros")); ir("simulador")
        return ok0 and ok1 and n1 != n0, f"Sin filtro: {n0} personas, {t0}; campaña A: {n1} personas, {t1} (iguales al Panorama)", ""

    @prueba("PF-34", "Simulador", "Ejemplo de referencia con meta del 25 %", PRE_SIM, "Meta 25; costo 2.550.000", "Escribir 25 en la meta", "632 renuncias estimadas, 148 menos; $1.989.000.000, $1.611.600.000 y $377.400.000; gráficos actualizados")
    def _():
        pg.fill(t("sim-meta"), "25"); pg.wait_for_timeout(150)
        r, d, cr, ce, dc = txt("res-renuncias"), txt("res-dif-renuncias"), txt("res-costo-ref"), txt("res-costo-esc"), txt("res-dif-costo")
        graf = pg.locator(t("sim-graf-tasa")).get_attribute("aria-label")
        pg.screenshot(path=os.path.join(CAP, "PF-34_simulador.png"), full_page=True)
        ok = r == "632" and d.startswith("148") and "1.989.000.000" in cr and "1.611.600.000" in ce and "377.400.000" in dc and "25,0" in graf and "hipotética" in txt("sim-mensaje")
        return ok, f"{r} estimadas; {d}; {cr} → {ce}; diferencia {dc}", "PF-34_simulador.png"

    @prueba("PF-35", "Simulador", "El costo cambia montos y se validan entradas", PRE_SIM, "Costo 3000000; costo −5; meta 120; meta «abc»", "Cambiar el costo y luego ingresar valores inválidos", "Renuncias iguales con otro costo; mensajes de error y sin resultados con valores inválidos")
    def _():
        antes = txt("res-renuncias"); pg.fill(t("sim-costo"), "3000000"); pg.wait_for_timeout(100); despues, ce = txt("res-renuncias"), txt("res-costo-esc")
        pg.fill(t("sim-costo"), "-5"); e1 = txt("sim-costo-error"); sin1 = pg.locator(t("sim-sin-resultado")).count()
        pg.fill(t("sim-costo"), "2550000"); pg.fill(t("sim-meta"), "120"); e2 = txt("sim-meta-error"); pg.fill(t("sim-meta"), "abc"); e3 = txt("sim-meta-error"); sin2 = pg.locator(t("sim-sin-resultado")).count()
        ok = antes == despues == "632" and "1.896.000.000" in ce and "negativo" in e1 and sin1 == 1 and "entre 0 y 100" in e2 and "número" in e3 and sin2 == 1
        return ok, f"Con $3.000.000: {despues} renuncias, {ce}; «−5» → «{e1}»; «120» → «{e2}»", ""

    @prueba("PF-36", "Simulador", "Meta mayor que la actual y restablecer", PRE_SIM, "Meta 40; luego «Restablecer escenario»", "Ingresar 40 y restablecer", "Se presenta como mayor rotación (no mejora); al restablecer la meta vuelve a la tasa actual con diferencia 0")
    def _():
        pg.fill(t("sim-meta"), "40"); m = txt("sim-mensaje"); pg.click(t("sim-restablecer")); pg.wait_for_timeout(100)
        return "mayor rotación" in m.lower() and "no es una mejora" in m and pg.locator(t("sim-meta")).input_value() == "30,9" and txt("res-dif-renuncias") == "0", f"Meta 40 %: «{m.splitlines()[0][:60]}…»; restablecido a 30,9 % con diferencia 0", ""

    @prueba("PF-37", "Simulador", "Guardar, comparar, eliminar y exportar escenarios", PRE_SIM, "Metas 28, 25 y 22", "Guardar tres escenarios, intentar un cuarto, eliminar uno y copiar el CSV", "Tabla con 3 escenarios; el cuarto se bloquea; al eliminar quedan 2; el CSV trae supuestos y resultados")
    def _():
        for m in ["28", "25", "22"]: pg.fill(t("sim-meta"), m); pg.click(t("sim-guardar"))
        filas3 = pg.locator(t("sim-tabla") + " tbody tr").count(); bloq = pg.locator(t("sim-guardar")).is_disabled()
        pg.click(t("sim-exportar")); pg.wait_for_timeout(200)
        clip = pg.evaluate("navigator.clipboard.readText()") if not pg.locator("textarea").count() else pg.locator("textarea").input_value()
        pg.locator(t("sim-eliminar")).first.click(); filas2 = pg.locator(t("sim-tabla") + " tbody tr").count()
        ok = filas3 == 3 and bloq and filas2 == 2 and "632" in clip and "costo_por_reemplazo_cop" in clip and "hipotético" in clip
        return ok, f"{filas3} guardados, cuarto bloqueado = {bloq}; tras eliminar: {filas2}; CSV con {clip.count(chr(10))} filas de datos", ""

    @prueba("PF-38", "Simulador", "Teclado y población vacía", PRE_SIM, "Flecha izquierda en el deslizador; filtros sin registros", "Mover la meta con el teclado y combinar filtros vacíos", "La meta baja 1 punto con el teclado; sin personas muestra «No disponible» sin errores")
    def _():
        pg.click(t("sim-restablecer")); pg.locator(t("sim-meta-rango")).focus(); pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(100); mv = pg.locator(t("sim-meta")).input_value()
        pg.select_option(t("f-desde"), "2026-04"); pg.select_option(t("f-hasta"), "2026-04"); pg.select_option(t("f-supervisor"), "SUP-15"); pg.wait_for_timeout(150)
        vacio = txt("estado-vacio"); pg.click(t("limpiar-filtros"))
        return mv == "30" and "No disponible" in vacio, f"Meta tras ← = {mv} %; selección vacía: «{vacio.splitlines()[0]}»", ""

    # --------- Adaptabilidad móvil
    @prueba("PF-24", "RNF-08", "Diseño adaptable a 400 px", PRE_DASH, "Viewport 400 × 860", "Abrir cada pantalla en ancho de teléfono", "Sin desplazamiento horizontal de la página")
    def _():
        m = nav.new_page(viewport={"width": 400, "height": 860}); m.goto(URL); peores = []
        for r in ["panorama", "causas", "resumen", "simulador", "semaforo", "seguimiento", "glosario"]:
            m.evaluate(f"location.hash='{r}'"); m.wait_for_timeout(300)
            peores.append(m.evaluate("document.documentElement.scrollWidth - window.innerWidth"))
        m.screenshot(path=os.path.join(CAP, "PF-24_movil.png"), full_page=True); m.close()
        return max(peores) <= 0, f"Desborde horizontal por pantalla (px): {peores}", "PF-24_movil.png"

    # =================== RENDIMIENTO ===================
    def est(v): return dict(n=len(v), min=min(v), promedio=statistics.mean(v), mediana=statistics.median(v), max=max(v))
    perf = []
    # Carga inicial
    cargas = []
    for _ in range(10):
        q = nav.new_page(); t0 = time.perf_counter(); q.goto(URL); q.wait_for_selector(t("kpi-tasa")); cargas.append((time.perf_counter() - t0) * 1000); q.close()
    perf.append(dict(prueba="Carga inicial hasta ver los indicadores", umbral=None, registros=3242, errores=0, **est(cargas)))
    # Carga de cada pantalla
    pg.goto(URL); pg.wait_for_selector(t("kpi-tasa"))
    for r in ["causas", "resumen", "semaforo", "seguimiento"]:
        v = []
        for _ in range(10):
            pg.click(t("nav-panorama")); pg.wait_for_selector(t("kpi-tasa"))
            t0 = time.perf_counter(); pg.click(t("nav-" + r)); pg.wait_for_function(f"document.querySelector('[data-testid=titulo-pantalla]').textContent !== 'Panorama'"); v.append((time.perf_counter() - t0) * 1000)
        perf.append(dict(prueba=f"Apertura de la pantalla «{r}»", umbral=None, registros=3242, errores=0, **est(v)))
    # Respuesta a filtros (acción → indicador actualizado), 20 repeticiones alternando campaña
    pg.click(t("nav-panorama")); pg.wait_for_selector(t("kpi-tasa")); v = []; err = 0
    for i in range(20):
        antes = txt("kpi-tasa"); t0 = time.perf_counter()
        pg.select_option(t("f-campana"), index=(i % 4) + 1 if i % 2 == 0 else 0)
        try: pg.wait_for_function("a => document.querySelector('[data-testid=kpi-tasa]').innerText !== a", arg=antes, timeout=3000)
        except Exception: err += 1  # noqa: E722
        v.append((time.perf_counter() - t0) * 1000)
    perf.append(dict(prueba="Respuesta a un filtro (acción → visuales actualizados)", umbral=3000, registros=3242, errores=err, **est(v)))
    pg.select_option(t("f-campana"), index=0)
    # Semáforo
    pg.click(t("nav-semaforo")); pg.click(t("modo-reglas")); v = []; err = 0
    for i in range(20):
        pg.fill(t("in-puntaje"), str(40 + i)); t0 = time.perf_counter(); pg.click(t("evaluar"))
        try: pg.wait_for_selector(t("resultado"), timeout=2000)
        except Exception: err += 1  # noqa: E722
        v.append((time.perf_counter() - t0) * 1000)
    perf.append(dict(prueba="Semáforo oficial, plan B (clic en «Evaluar» → resultado visible)", umbral=2000, registros=1, errores=err, **est(v)))
    # Volumen de 50.000 registros (benchmark interno del prototipo)
    pg.click(t("nav-seguimiento")); pg.click(t("tab-rendimiento")); pg.click(t("correr-rendimiento")); pg.wait_for_selector("text=Medición en este navegador"); pg.wait_for_timeout(200)
    pg.wait_for_function("document.querySelectorAll('table')[0] && document.querySelectorAll('table')[0].innerText.includes('50.000')", timeout=60000)
    filas = pg.locator("table").first.locator("tbody tr").all_inner_texts()
    def num(s): return float(s.replace(".", "").replace(",", "."))
    for f in filas:
        c = f.split("\t")
        if "50.000" in c[2]:  # columnas: prueba, tipo de medición, registros, repet., mín., prom., mediana, máx., errores
            perf.append(dict(prueba=c[0] + " · cálculo interno", umbral=3000 if "filtro" in c[0] else None, registros=50000, n=int(c[3]), min=num(c[4]), promedio=num(c[5]), mediana=num(c[6]), max=num(c[7]), errores=int(c[8])))
    pg.screenshot(path=os.path.join(CAP, "PF-25_rendimiento.png"), full_page=True)
    ver = nav.version
    nav.close()

entorno = f"Chromium {ver} headless (Playwright) · {platform.system()} {platform.release()} · {os.cpu_count()} CPU · contenedor en la nube, sin red externa (fuentes de Google no cargan)"
ahora = datetime.datetime.now().isoformat(timespec="seconds")
res.append(dict(id="PF-25", cu="General", nombre="Errores de JavaScript durante las pruebas", precondiciones="—", entrada="—", pasos="Registrar errores de consola y de página", esperado="0 errores", observado=f"{len(errores_consola)} errores" + (f": {errores_consola[:2]}" if errores_consola else ""), estado="Aprobada" if not errores_consola else "Fallida", evidencia=""))
json.dump(dict(fecha=ahora, entorno=entorno, resultados=res), open(os.path.join(RAIZ, "pruebas", "resultados_e2e.json"), "w"), ensure_ascii=False, indent=1)
os.makedirs(os.path.join(RAIZ, "metricas", "rendimiento"), exist_ok=True)
json.dump(dict(fecha=ahora, entorno=entorno, filas=perf), open(os.path.join(RAIZ, "metricas", "rendimiento", "resultados_rendimiento.json"), "w"), ensure_ascii=False, indent=1)
for f in perf: print(f"{f['prueba']:<65} n={f['n']:>3} min={f['min']:8.1f} prom={f['promedio']:8.1f} med={f['mediana']:8.1f} max={f['max']:8.1f} err={f['errores']}")
print(f"\n{sum(r['estado'] == 'Aprobada' for r in res)}/{len(res)} aprobadas")
