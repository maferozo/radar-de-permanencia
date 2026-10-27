"""Criterios de publicación del modelo (CU-09, secciones 13.5, 13.8 y 13.10). Funciones puras para poder probarlas."""

def supera_referencia(modelo: dict, referencia: dict, margen_auc: float = 0.05) -> bool:
    return modelo["recall"] > referencia["recall"] and (modelo.get("auc") or 0) > 0.5 + margen_auc

def cumple_equidad(brechas: list, max_pp: float) -> bool:
    if not brechas:
        return False  # sin grupos comparables no se puede afirmar que cumple
    return all(b["brecha_recall_pp"] <= max_pp and b["brecha_fp_pp"] <= max_pp for b in brechas)

def decidir_publicacion(modelo: dict, referencia: dict, brechas: list, hay_aproximaciones: bool, max_pp: float = 10.0) -> dict:
    a = supera_referencia(modelo, referencia); b = cumple_equidad(brechas, max_pp); c = not hay_aproximaciones
    return {"supera_referencia": a, "cumple_equidad": b, "sin_aproximaciones": c, "publicable": a and b and c,
            "accion": "Publicar coeficientes y umbrales" if (a and b and c) else "No publicar; activar plan B (reglas de alerta)"}
