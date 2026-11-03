// Parámetros del modelo 3D aproximado (mm). Estimados a partir de fotografías:
// NO son medidas del robot. Editables desde la interfaz.

export interface ModelParams {
  bodyLength: number;
  bodyWidth: number;
  bodyHeight: number;
  /** Distancia lateral del eje de cadera (horn en la placa extrema) al centro. */
  hipInset: number;
  /** Distancia lateral del plano del servo superior al centro. */
  shoulderOut: number;
  thighLength: number;
  shinLength: number;
}

export const DEFAULT_MODEL_PARAMS: ModelParams = {
  bodyLength: 300,
  bodyWidth: 110,
  bodyHeight: 72,
  hipInset: 32,
  shoulderOut: 92,
  thighLength: 112,
  shinLength: 128,
};

export const MODEL_PARAM_LABEL: Record<keyof ModelParams, string> = {
  bodyLength: 'Largo del cuerpo',
  bodyWidth: 'Ancho del cuerpo',
  bodyHeight: 'Alto del cuerpo',
  hipInset: 'Eje de cadera (desde el centro)',
  shoulderOut: 'Plano del servo superior',
  thighLength: 'Tramo superior (cadera→rodilla)',
  shinLength: 'Tramo inferior (rodilla→pie)',
};

export const MODEL_PARAM_RANGE: Record<keyof ModelParams, [number, number]> = {
  bodyLength: [180, 450],
  bodyWidth: [70, 180],
  bodyHeight: [40, 120],
  hipInset: [10, 60],
  shoulderOut: [60, 140],
  thighLength: [60, 200],
  shinLength: [60, 220],
};

export function sanitizeModelParams(p: Partial<ModelParams> | null | undefined): ModelParams {
  const out = { ...DEFAULT_MODEL_PARAMS };
  if (!p) return out;
  for (const k of Object.keys(DEFAULT_MODEL_PARAMS) as (keyof ModelParams)[]) {
    const v = p[k];
    const [lo, hi] = MODEL_PARAM_RANGE[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}
