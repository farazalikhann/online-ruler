export const CALIBRATION_STORAGE_KEY = 'measurekit.calibration.v1';
export const CARD_WIDTH_MM = 85.6;
export const CARD_HEIGHT_MM = 53.98;
export const CARD_ASPECT_RATIO = CARD_WIDTH_MM / CARD_HEIGHT_MM;

const STORAGE_VERSION = 1;
const DEFAULT_DIAGONAL_FALLBACK = 13.3;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function numberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function currentViewportScale() {
  if (!isBrowser()) {
    return 1;
  }

  return numberOrFallback(window.visualViewport?.scale, 1);
}

export function currentEnvironment() {
  if (!isBrowser()) {
    return {
      dpr: 1,
      viewportScale: 1,
      zoomFactor: 1,
      screenWidth: 0,
      screenHeight: 0,
      screenAvailWidth: 0,
      screenAvailHeight: 0
    };
  }

  const dpr = numberOrFallback(window.devicePixelRatio, 1);
  const viewportScale = currentViewportScale();

  return {
    dpr,
    viewportScale,
    zoomFactor: dpr * viewportScale,
    screenWidth: numberOrFallback(window.screen?.width, 0),
    screenHeight: numberOrFallback(window.screen?.height, 0),
    screenAvailWidth: numberOrFallback(window.screen?.availWidth, 0),
    screenAvailHeight: numberOrFallback(window.screen?.availHeight, 0)
  };
}

function toPositiveFinite(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return parsed;
}

function buildBaseRecord({ source, physicalPpi, notes = '', measurement = {} }) {
  const environment = currentEnvironment();

  return {
    version: STORAGE_VERSION,
    source,
    physicalPpi: toPositiveFinite(physicalPpi, 'physicalPpi'),
    notes,
    measurement,
    environment,
    createdAt: new Date().toISOString()
  };
}

export function createCardCalibration({ measuredWidthPx, notes = '' }) {
  const environment = currentEnvironment();
  const widthPx = toPositiveFinite(measuredWidthPx, 'measuredWidthPx');
  const cssPxPerMm = widthPx / CARD_WIDTH_MM;
  const physicalPpi = cssPxPerMm * environment.zoomFactor * 25.4;

  return buildBaseRecord({
    source: 'card',
    physicalPpi,
    notes,
    measurement: {
      measuredWidthPx: widthPx,
      cardWidthMm: CARD_WIDTH_MM,
      cardHeightMm: CARD_HEIGHT_MM,
      cssPxPerMm,
      zoomFactor: environment.zoomFactor
    }
  });
}

export function createDiagonalCalibration({ diagonalInches, notes = '' }) {
  const environment = currentEnvironment();
  const diagonal = toPositiveFinite(diagonalInches, 'diagonalInches');
  const physicalPixels = Math.hypot(environment.screenWidth * environment.dpr, environment.screenHeight * environment.dpr);
  const physicalPpi = physicalPixels / diagonal;

  return buildBaseRecord({
    source: 'diagonal',
    physicalPpi,
    notes,
    measurement: {
      diagonalInches: diagonal,
      screenWidth: environment.screenWidth,
      screenHeight: environment.screenHeight,
      zoomFactor: environment.zoomFactor
    }
  });
}

function normalizeStoredCalibration(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  if (record.version !== STORAGE_VERSION) {
    return null;
  }

  const physicalPpi = Number(record.physicalPpi);
  if (!Number.isFinite(physicalPpi) || physicalPpi <= 0) {
    return null;
  }

  const environment = record.environment && typeof record.environment === 'object' ? record.environment : currentEnvironment();
  return {
    ...record,
    physicalPpi,
    environment: {
      dpr: numberOrFallback(environment.dpr, 1),
      viewportScale: numberOrFallback(environment.viewportScale, 1),
      zoomFactor: numberOrFallback(environment.zoomFactor, 1),
      screenWidth: numberOrFallback(environment.screenWidth, 0),
      screenHeight: numberOrFallback(environment.screenHeight, 0),
      screenAvailWidth: numberOrFallback(environment.screenAvailWidth, 0),
      screenAvailHeight: numberOrFallback(environment.screenAvailHeight, 0)
    }
  };
}

export function loadCalibration() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeStoredCalibration(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCalibration(calibration) {
  if (!isBrowser()) {
    return calibration;
  }

  const normalized = normalizeStoredCalibration(calibration);
  if (!normalized) {
    throw new Error('Calibration could not be saved because the record was invalid.');
  }

  window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearCalibration() {
  if (isBrowser()) {
    window.localStorage.removeItem(CALIBRATION_STORAGE_KEY);
  }
}

export function getCalibration() {
  const stored = loadCalibration();
  if (!stored) {
    return null;
  }

  const environment = currentEnvironment();
  const zoomFactor = numberOrFallback(environment.zoomFactor, 1);
  const effectivePxPerMm = stored.physicalPpi / (zoomFactor * 25.4);
  const calibrationZoomFactor = numberOrFallback(stored.environment?.zoomFactor, 1);
  const stale = Math.abs(calibrationZoomFactor - zoomFactor) / calibrationZoomFactor > 0.01;

  return {
    ...stored,
    environment,
    effectivePxPerMm,
    pxPerMm: effectivePxPerMm,
    mmPerPx: 1 / effectivePxPerMm,
    stale,
    staleReasons: getStaleReasons(stored.environment, environment)
  };
}

function getStaleReasons(storedEnvironment = {}, currentEnvironmentSnapshot = {}) {
  const reasons = [];

  if (numberOrFallback(storedEnvironment.zoomFactor, 1) !== numberOrFallback(currentEnvironmentSnapshot.zoomFactor, 1)) {
    reasons.push('zoom');
  }

  if (numberOrFallback(storedEnvironment.dpr, 1) !== numberOrFallback(currentEnvironmentSnapshot.dpr, 1)) {
    reasons.push('devicePixelRatio');
  }

  if (numberOrFallback(storedEnvironment.viewportScale, 1) !== numberOrFallback(currentEnvironmentSnapshot.viewportScale, 1)) {
    reasons.push('viewportScale');
  }

  if (numberOrFallback(storedEnvironment.screenWidth, 0) !== numberOrFallback(currentEnvironmentSnapshot.screenWidth, 0)
    || numberOrFallback(storedEnvironment.screenHeight, 0) !== numberOrFallback(currentEnvironmentSnapshot.screenHeight, 0)) {
    reasons.push('screen');
  }

  return reasons;
}

export function getCalibrationStatus() {
  const calibration = getCalibration();
  if (!calibration) {
    return {
      hasCalibration: false,
      needsCalibration: true,
      warning: 'No calibration saved yet.'
    };
  }

  return {
    hasCalibration: true,
    needsCalibration: false,
    warning: calibration.stale
      ? 'Browser zoom or display settings changed. Recalibrate for best accuracy.'
      : ''
  };
}

export function mmToPx(mm, calibration = getCalibration()) {
  if (!calibration) {
    throw new Error('MeasureKit is not calibrated yet.');
  }

  return toPositiveFinite(mm, 'mm') * calibration.effectivePxPerMm;
}

export function pxToMm(px, calibration = getCalibration()) {
  if (!calibration) {
    throw new Error('MeasureKit is not calibrated yet.');
  }

  return Number(px) / calibration.effectivePxPerMm;
}

export function inToPx(inches, calibration = getCalibration()) {
  return mmToPx(toPositiveFinite(inches, 'inches') * 25.4, calibration);
}

export function pxToIn(px, calibration = getCalibration()) {
  return pxToMm(px, calibration) / 25.4;
}

export function watchCalibrationEnvironment(callback) {
  if (!isBrowser()) {
    return () => {};
  }

  let frame = 0;
  const emit = () => {
    if (frame) {
      window.cancelAnimationFrame(frame);
    }

    frame = window.requestAnimationFrame(() => {
      callback(getCalibration(), currentEnvironment());
    });
  };

  window.addEventListener('resize', emit, { passive: true });
  window.addEventListener('orientationchange', emit, { passive: true });
  window.visualViewport?.addEventListener('resize', emit, { passive: true });
  window.visualViewport?.addEventListener('scroll', emit, { passive: true });

  emit();

  return () => {
    if (frame) {
      window.cancelAnimationFrame(frame);
    }

    window.removeEventListener('resize', emit);
    window.removeEventListener('orientationchange', emit);
    window.visualViewport?.removeEventListener('resize', emit);
    window.visualViewport?.removeEventListener('scroll', emit);
  };
}

export function formatCalibrationSummary(calibration) {
  if (!calibration) {
    return 'Not calibrated';
  }

  return `${calibration.physicalPpi.toFixed(2)} PPI · ${calibration.effectivePxPerMm.toFixed(3)} px/mm`;
}

export function formatPixelsPerMm(mm, calibration = getCalibration()) {
  return mmToPx(mm, calibration).toFixed(2);
}

export function defaultCalibrationDiagonal() {
  const calibration = getCalibration();
  if (!calibration) {
    return DEFAULT_DIAGONAL_FALLBACK;
  }

  const physicalDiagonal = Math.hypot(calibration.environment.screenWidth * calibration.environment.dpr, calibration.environment.screenHeight * calibration.environment.dpr);
  return physicalDiagonal > 0 ? physicalDiagonal / calibration.physicalPpi : DEFAULT_DIAGONAL_FALLBACK;
}