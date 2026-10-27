# Radar de permanencia · Power BI

Proyecto en formato **PBIP** (Power BI Project), generado por `pipeline/05_exportar_powerbi.py` desde la capa oro.
Datos **ficticios de demostración** (sección 4.2 del documento técnico).

## Abrir
1. Requisitos: Windows 10/11 y Power BI Desktop actualizado (2024 o posterior).
   Si su versión lo pide: Archivo › Opciones › Características en versión preliminar › «Guardar como proyecto de Power BI (.pbip)».
2. Copie la carpeta `powerbi` a `C:\RadarPermanencia\powerbi\` (o a otra ruta).
3. Abra `Radar_de_permanencia.pbip`.
4. Si la ruta es otra: Transformar datos › Administrar parámetros › `RutaDatos` = ruta de la carpeta `datos`, terminada en `\`.
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
