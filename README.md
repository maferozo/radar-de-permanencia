# Radar de permanencia · Entrega del 27 de octubre de 2026

People Analytics para reducir la rotación temprana en un call center BPO.
Fuente de verdad: `Radar_de_permanencia_Documento_tecnico.docx` (v1.0, 20/10/2026).

> **Todos los datos del dashboard y del modelo son ficticios de demostración** (semilla 42).
> Ninguna cifra analítica describe al cliente. El avance del burndown proviene del tablero Jira
> del proyecto SCRUM, actualizado y consultado el 27-oct-2026.

## 1. Ver el prototipo (sin instalar nada)

Abra `prototipo/dist/index.html` en Chrome, Edge o Firefox. Funciona sin servidor, sin
credenciales y sin internet (sin internet usa fuentes del sistema).

Pantallas: **Panorama**, **Causas**, **Resumen y acciones**, **Semáforo** y **Seguimiento**
(burndown, DORA, rendimiento, pruebas, calidad de datos y trazabilidad).

### Recorrido sugerido para la presentación (5 minutos)
1. Panorama: tasa 30,9 %, mes crítico 2. Cambie la campaña y luego «Limpiar filtros».
2. Elija período 2026-04 a 2026-04 y supervisor SUP-15 → mensaje «Sin datos para esta selección».
3. Causas: SUP-15 en gris (grupo pequeño), conclusión de la prueba técnica, cambie la variable de perfil.
4. Resumen y acciones: 5 factores; «Ver en Causas» lleva al gráfico que respalda cada uno.
5. Semáforo: «Evaluar candidato» con el ejemplo → 80,7 %, rojo, 3 factores, aviso humano.
   Luego «Limpiar formulario» + «Evaluar» (validaciones), puntaje 120 (rango), pestaña «Plan B».
   «Ver detalle» en Confiabilidad muestra por qué el modelo demo **no es publicable**.
6. Seguimiento › Burndown: cambie a Sprint 1 y edite los puntos aceptados para ver el recálculo.

## 2. Desarrollo y compilación

```bash
cd prototipo
npm install
npm run dev      # servidor local de desarrollo
npm run build    # genera dist/index.html autocontenido
```
Stack: React 18 + TypeScript + Recharts + Vite (vite-plugin-singlefile).

## 3. Datos de demostración, ETL y modelo

```bash
pip install pandas numpy scikit-learn scipy joblib openpyxl matplotlib
python3 pipeline/01_generar_datos_demo.py   # capa bronce ficticia con errores sembrados
python3 pipeline/02_etl.py                  # bronce → plata → oro + reporte de calidad
python3 pipeline/03_modelo.py               # regresión logística, referencia, equidad, ficha
python3 pipeline/04_exportar_prototipo.py   # datos agregados para el prototipo
cd prototipo && npm run build
```
Para usar datos reales: copie los exportes a `datos_demo/bronce/AAAA-MM-DD/` con las columnas del
diccionario de datos, defina la sal con `export RADAR_SAL=...` (nunca en el repositorio) y ejecute
`python3 pipeline/02_etl.py --bronce <carpeta> --corte AAAA-MM-DD`.

## 4. Pruebas (81 automatizadas)

```bash
python3 pruebas/test_pipeline.py            # 16 pruebas: ETL, calidad, anonimización, modelo, plan B, Power BI
cd prototipo && npm run test:unit           # 27 pruebas: fórmulas, validaciones, consistencia Python ↔ prototipo
cd .. && python3 pruebas/test_e2e.py        # 38 pruebas en navegador + mediciones de rendimiento
python3 pruebas/consolidar_resultados.py    # actualiza la pestaña Pruebas del prototipo (recompilar después)
```
`test_e2e.py` requiere Playwright (`pip install playwright && python -m playwright install chromium`).

## 5. Cómo modificar indicadores y parámetros

| Qué | Dónde |
|---|---|
| Mínimo de personas por grupo (30) | Campo «Mínimo por grupo» en la barra de filtros |
| Umbrales del semáforo | Semáforo › «Umbrales del semáforo» (propuesta 13.6 en `datos_demo/modelo/umbrales.csv`) |
| Supuestos de costo (HU-05) | Panorama › «Ingresar supuestos de costo» (no se guardan) |
| Meta de recall (0,60) y equidad (10 p.p.) | `pipeline/03_modelo.py`: `RECALL_META`, `EQUIDAD_MAX_PP` |
| Recomendaciones por factor y acciones del semáforo | `prototipo/src/calc.ts`: `RECOMENDACION`, `ACCION` |
| Reglas del plan B | `prototipo/src/calc.ts`: `reglasAlerta` |
| Cronograma, puntos y registros del burndown | `prototipo/src/data.ts` o pestaña Seguimiento (se guarda solo en ese navegador) |
| Plantillas Excel | `metricas/burndown/`, `metricas/dora/`, `metricas/rendimiento/` (celdas amarillas) |

## 6. Estructura

```
Radar_de_permanencia/
├── README.md
├── prototipo/            código React+TS, dist/index.html, pruebas/unit.test.ts
├── pipeline/             generador demo, ETL, modelo, exportación al prototipo y a Power BI, criterios
├── datos_demo/           bronce (ficticio), plata, oro, modelo/, reporte_calidad.json
├── powerbi/              Radar_de_permanencia.pbip, modelo semántico, reporte, datos/, medidas.dax, LEEME.md
├── pruebas/              test_pipeline.py, test_e2e.py, resultados_*.json
├── metricas/
│   ├── burndown/         burndown_*.png, burndown_seguimiento.xlsx
│   ├── dora/             dora_registro_y_resultados.xlsx
│   └── rendimiento/      resultados_rendimiento.json, rendimiento_resultados_y_plantilla.xlsx
├── documentacion/        documento_cierre, cumplimiento_ley_1581, acta_validacion_cliente (DOCX y PDF), generadores
└── evidencias/           capturas de las pruebas, consultas de Jira (JSON)
```

## 7. Power BI

`python3 pipeline/05_exportar_powerbi.py` genera `powerbi/`. Abra `Radar_de_permanencia.pbip` en Power BI
Desktop (Windows), ajuste el parámetro **RutaDatos** a la carpeta `powerbi/datos` y pulse «Actualizar».
Incluye 4 páginas, 22 medidas DAX y 3 roles RLS. No se ha abierto en Desktop (se generó en Linux);
`powerbi/LEEME.md` trae la ruta manual por si algo falla.

## 8. Entregado y pendiente

| Entregable | Estado |
|---|---|
| Prototipo funcional (4 pantallas + seguimiento) | Entregado; probado con datos ficticios; semáforo oficial = plan B |
| Burndown (proyecto, S1, S2, S3) | Entregado; Jira al 27-oct: 43 de 69 puntos en Finalizado; S3, HU-05 y HU-10 en revisión |
| Documento de cierre (DOCX y PDF) | Entregado como cierre técnico; no declara el proyecto cerrado |
| Métricas DORA | Definidas; **sin despliegues medidos** |
| Indicadores de rendimiento | Medidos en el prototipo; cumplen los objetivos propuestos |
| Matriz de pruebas | 81/81 aprobadas (Anexo A del documento); UAT con el cliente pendiente |
| Proyecto Power BI | Generado y verificado por prueba; **no abierto en Power BI Desktop** |
| Cumplimiento Ley 1581 | Borrador del equipo; requiere revisión jurídica |
| Acta de validación del cliente | En blanco, para firmar en la demo |

Todos los datos (incluidos costos y motivos de renuncia) son **simulados**. Pendiente: firma del acta por el
cliente, abrir el PBIP en Windows y registrar despliegues.

## 9. Versión 1.2 del prototipo y guía de demostración

La versión 1.2 agrega lectura ejecutiva en el Panorama, ranking de factores en Causas, plan de acción por
factor, semáforo con condiciones evaluadas y limitaciones, ayudas «?» con glosario, enlace «Saltar al
contenido» y un seguimiento ampliado (criterios del burndown, pruebas filtrables con UAT separada y
trazabilidad RF → HU → CU → prueba). La lista completa de cambios y la guía para presentar en clase están en
los anexos F y G de `documentacion/documento_cierre.pdf`.

## 10. Simulador de escenarios

Pantalla «Simulador de escenarios» (menú Dashboard). Aplica una meta de rotación temprana elegida por el
usuario a la población de los filtros activos: renuncias estimadas = redondeo(N × meta), costo =
renuncias × costo supuesto por reemplazo (inicia en COP 2.550.000, el supuesto del Panorama). Compara hasta
3 escenarios y copia la comparación en CSV. Fórmulas en `prototipo/src/calc.ts` (`simularEscenario`,
`validarMeta`, `validarCosto`). Los resultados son hipotéticos: no son ahorros garantizados.
