import '../styles/global.css';
import { getCalibration, watchCalibrationEnvironment } from '../lib/calibration.js';

const app = document.getElementById('ruler-app');

app.innerHTML = `
  <section class="ruler-stage ruler-stage--horizontal" id="ruler-stage">
    <canvas class="ruler-canvas" id="ruler-canvas" aria-hidden="true"></canvas>

    <button class="ruler-marker ruler-marker--start" id="start-marker" type="button" aria-label="Move start marker">
      <span class="ruler-marker__core"></span>
    </button>

    <button class="ruler-marker ruler-marker--end" id="end-marker" type="button" aria-label="Move end marker">
      <span class="ruler-marker__core"></span>
    </button>

    <div class="ruler-pill" id="ruler-pill" aria-label="Ruler controls">
      <button class="ruler-pill__button" id="orientation-toggle" type="button" aria-label="Toggle orientation">↔</button>
      <button class="ruler-pill__button" id="unit-toggle" type="button" aria-label="Toggle units">cm</button>
      <span class="ruler-pill__dot" id="calibration-dot" aria-hidden="true"></span>
      <span class="ruler-pill__scale mono" id="scale-readout"></span>
      <button class="ruler-pill__button" id="fullscreen-button" type="button" aria-label="Enter fullscreen">⛶</button>
    </div>

    <div class="ruler-gate" id="calibration-gate" hidden>
      <section class="ruler-gate__card">
        <p class="ruler-gate__text" id="gate-copy">The ruler needs a calibration before it can show a real measurement.</p>
        <a class="button" href="./calibration.html">Calibrate now</a>
      </section>
    </div>
  </section>
`;

const stage = document.getElementById('ruler-stage');
const canvas = document.getElementById('ruler-canvas');
const pill = document.getElementById('ruler-pill');
const calibrationGate = document.getElementById('calibration-gate');
const gateCopy = document.getElementById('gate-copy');
const calibrationDot = document.getElementById('calibration-dot');
const scaleReadout = document.getElementById('scale-readout');
const orientationToggle = document.getElementById('orientation-toggle');
const unitToggle = document.getElementById('unit-toggle');
const fullscreenButton = document.getElementById('fullscreen-button');
const startMarker = document.getElementById('start-marker');
const endMarker = document.getElementById('end-marker');

const state = {
  orientation: 'horizontal',
  units: 'cm',
  calibration: getCalibration(),
  visible: true,
  hideTimer: 0,
  markers: {
    start: 84,
    end: 248
  },
  dragging: null,
  pointers: new Map(),
  pinch: null,
  markerOffset: 0,
  safeArea: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  }
};

let wakeLock = null;
let resizeObserver = null;

function readSafeAreaPx() {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.inset = '0';
  probe.style.paddingTop = 'env(safe-area-inset-top)';
  probe.style.paddingRight = 'env(safe-area-inset-right)';
  probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
  probe.style.paddingLeft = 'env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const styles = getComputedStyle(probe);
  const safeArea = {
    top: Number.parseFloat(styles.paddingTop) || 0,
    right: Number.parseFloat(styles.paddingRight) || 0,
    bottom: Number.parseFloat(styles.paddingBottom) || 0,
    left: Number.parseFloat(styles.paddingLeft) || 0
  };
  probe.remove();
  return safeArea;
}

function currentCalibration() {
  state.calibration = getCalibration();
  return state.calibration;
}

function pxPerMm() {
  return state.calibration?.effectivePxPerMm ?? 0;
}

function isCalibrated() {
  return Boolean(state.calibration && !state.calibration.stale);
}

function viewportSize() {
  return {
    width: stage.clientWidth,
    height: stage.clientHeight
  };
}

function rulerBandSize() {
  const shortestSide = Math.min(window.innerWidth, window.innerHeight);
  const base = shortestSide < 760 ? 60 : 90;
  return Math.max(base, Math.round(Math.min(96, shortestSide * 0.12)));
}

function updateSafeArea() {
  state.safeArea = readSafeAreaPx();
  stage.style.setProperty('--ruler-safe-top', `${state.safeArea.top}px`);
  stage.style.setProperty('--ruler-safe-right', `${state.safeArea.right}px`);
  stage.style.setProperty('--ruler-safe-bottom', `${state.safeArea.bottom}px`);
  stage.style.setProperty('--ruler-safe-left', `${state.safeArea.left}px`);
}

function setOrientation(orientation) {
  state.orientation = orientation;
  stage.dataset.orientation = orientation;
  orientationToggle.textContent = orientation === 'horizontal' ? '↔' : '↕';
  orientationToggle.setAttribute('aria-label', orientation === 'horizontal' ? 'Switch to vertical ruler' : 'Switch to horizontal ruler');
  state.dragging = null;
  state.pinch = null;
  state.markers.start = 84;
  state.markers.end = 248;
  updateLayout();
}

function setUnits(units) {
  state.units = units;
  unitToggle.textContent = units;
  unitToggle.setAttribute('aria-label', units === 'cm' ? 'Switch to inches' : 'Switch to centimetres');
  updateScaleLabel();
  renderCanvas();
}

function updateCalibrationGate() {
  currentCalibration();
  const calibrated = isCalibrated();
  calibrationGate.hidden = calibrated;
  if (!calibrated) {
    gateCopy.textContent = state.calibration ? 'Browser zoom changed, so the stored calibration is no longer reliable.' : 'The ruler needs a calibration before it can show a real measurement.';
  }
  calibrationDot.dataset.state = calibrated ? 'ready' : state.calibration?.stale ? 'stale' : 'missing';
}

function updateScaleLabel() {
  if (!isCalibrated()) {
    scaleReadout.textContent = '';
    return;
  }

  scaleReadout.textContent = `${pxPerMm().toFixed(2)} px/mm · ${measurementText()}`;
}

function clampMarker(value) {
  const size = state.orientation === 'horizontal' ? viewportSize().width : viewportSize().height;
  const band = rulerBandSize();
  return Math.max(0, Math.min(value, size - 1));
}

function markerAxisValue(event) {
  const rect = stage.getBoundingClientRect();
  return state.orientation === 'horizontal'
    ? event.clientX - rect.left - state.safeArea.left
    : event.clientY - rect.top - state.safeArea.top;
}

function markerSpanPx() {
  return Math.abs(state.markers.end - state.markers.start);
}

function markerMidpointPx() {
  return (state.markers.start + state.markers.end) / 2;
}

function positionMarkers() {
  const band = rulerBandSize();
  const start = clampMarker(state.markers.start);
  const end = clampMarker(state.markers.end);
  const [first, second] = start <= end ? [start, end] : [end, start];
  state.markers.start = first;
  state.markers.end = second;

  if (state.orientation === 'horizontal') {
    startMarker.style.left = `${state.safeArea.left + first - 22}px`;
    startMarker.style.top = `${Math.max(state.safeArea.top, 0)}px`;
    startMarker.style.width = '44px';
    startMarker.style.height = `${band}px`;
    endMarker.style.left = `${state.safeArea.left + second - 22}px`;
    endMarker.style.top = `${Math.max(state.safeArea.top, 0)}px`;
    endMarker.style.width = '44px';
    endMarker.style.height = `${band}px`;
    startMarker.dataset.orientation = 'horizontal';
    endMarker.dataset.orientation = 'horizontal';
    return;
  }

  startMarker.style.left = `${Math.max(state.safeArea.left, 0)}px`;
  startMarker.style.top = `${state.safeArea.top + first - 22}px`;
  startMarker.style.width = `${band}px`;
  startMarker.style.height = '44px';
  endMarker.style.left = `${Math.max(state.safeArea.left, 0)}px`;
  endMarker.style.top = `${state.safeArea.top + second - 22}px`;
  endMarker.style.width = `${band}px`;
  endMarker.style.height = '44px';
  startMarker.dataset.orientation = 'vertical';
  endMarker.dataset.orientation = 'vertical';
}

function measurementText() {
  if (!isCalibrated()) {
    return '';
  }

  const mm = markerSpanPx() / pxPerMm();
  if (state.units === 'in') {
    return `${(mm / 25.4).toFixed(3)} in`;
  }

  return `${(mm / 10).toFixed(2)} cm`;
}

function updateMarkerStyles() {
  const band = rulerBandSize();
  stage.style.setProperty('--ruler-band-size', `${band}px`);
  startMarker.style.setProperty('--marker-band', `${band}px`);
  endMarker.style.setProperty('--marker-band', `${band}px`);
  positionMarkers();
}

function updateLayout() {
  updateSafeArea();
  updateCalibrationGate();
  updateScaleLabel();
  updateMarkerStyles();
  renderCanvas();
  renderMeasurement();
}

function renderMeasurement() {
  if (isCalibrated()) {
    scaleReadout.textContent = `${pxPerMm().toFixed(2)} px/mm`;
  }
}

function snapToDevicePixel(value, dpr) {
  return Math.round(value * dpr) / dpr;
}

function drawTick(ctx, isHorizontal, origin, tickLength, dpr) {
  const snapped = snapToDevicePixel(origin, dpr);
  const lineWidth = 1 / dpr;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  if (isHorizontal) {
    ctx.moveTo(snapped, 0);
    ctx.lineTo(snapped, tickLength);
  } else {
    ctx.moveTo(0, snapped);
    ctx.lineTo(tickLength, snapped);
  }
  ctx.stroke();
}

function renderCanvas() {
  const calibration = currentCalibration();
  if (!calibration || calibration.stale) {
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = '1px';
    canvas.style.height = '1px';
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, 1, 1);
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const { width, height } = viewportSize();
  const band = rulerBandSize();
  const safeTop = Math.round(state.safeArea.top);
  const safeLeft = Math.round(state.safeArea.left);
  const safeRight = Math.round(state.safeArea.right);
  const safeBottom = Math.round(state.safeArea.bottom);

  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#151515';
  ctx.fillRect(0, 0, width, height);

  const pxMm = pxPerMm();
  const isHorizontal = state.orientation === 'horizontal';
  const axisLength = isHorizontal ? width - safeLeft - safeRight : height - safeTop - safeBottom;
  const bandStart = isHorizontal ? safeTop : safeLeft;
  const bandThickness = band;
  const labelMargin = Math.max(10, Math.round(bandThickness * 0.14));
  const majorEvery = state.units === 'cm' ? 10 : 25.4;
  const mediumEvery = state.units === 'cm' ? 5 : 12.7;
  const minorEvery = state.units === 'cm' ? 1 : 1.5875;
  const quarterEvery = state.units === 'in' ? 6.35 : null;
  const eighthEvery = state.units === 'in' ? 3.175 : null;
  const sixteenthEvery = state.units === 'in' ? 1.5875 : null;

  ctx.fillStyle = '#151515';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(228, 177, 94, 0.06)';
  ctx.fillRect(0, bandStart, isHorizontal ? width : bandThickness, isHorizontal ? bandThickness : height);

  for (let mm = 0; mm <= axisLength / pxMm + minorEvery; mm += minorEvery) {
    const logicalPx = mm * pxMm;
    const originPx = (isHorizontal ? safeLeft : safeTop) + logicalPx;
    const isMajor = Math.abs(mm % majorEvery) < minorEvery / 2;
    const isMedium = !isMajor && Math.abs(mm % mediumEvery) < minorEvery / 2;
    const isQuarter = !isMajor && !isMedium && quarterEvery && Math.abs(mm % quarterEvery) < minorEvery / 2;
    const isEighth = !isMajor && !isMedium && !isQuarter && eighthEvery && Math.abs(mm % eighthEvery) < minorEvery / 2;
    const isSixteenth = !isMajor && !isMedium && !isQuarter && !isEighth && sixteenthEvery && Math.abs(mm % sixteenthEvery) < minorEvery / 2;
    const tickLength = isMajor
      ? bandThickness - labelMargin * 0.55
      : isMedium
        ? bandThickness * 0.7
        : isQuarter
          ? bandThickness * 0.5
          : isEighth
            ? bandThickness * 0.38
            : isSixteenth
              ? bandThickness * 0.28
              : bandThickness * 0.2;

    ctx.strokeStyle = 'rgba(228, 177, 94, 0.94)';
    drawTick(ctx, isHorizontal, originPx, tickLength, dpr);

    if (isMajor) {
      ctx.save();
      ctx.fillStyle = '#f3e1bb';
      ctx.font = `${Math.max(12, Math.round(bandThickness * 0.16))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = state.units === 'cm' ? String(Math.round(mm / 10)) : String(Math.round(mm / 25.4));

      if (isHorizontal) {
        const labelX = snapToDevicePixel(originPx, dpr);
        const labelY = Math.max(bandStart + bandThickness - labelMargin, bandStart + tickLength + 10);
        ctx.fillText(label, labelX, labelY);
      } else {
        const labelX = Math.max(safeLeft + bandThickness - labelMargin, safeLeft + tickLength + 10);
        const labelY = snapToDevicePixel(originPx, dpr);
        ctx.translate(labelX, labelY);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label, 0, 0);
      }
      ctx.restore();
    }
  }

  const edgeStroke = 'rgba(242, 201, 129, 0.3)';
  ctx.strokeStyle = edgeStroke;
  ctx.lineWidth = 1 / dpr;
  ctx.beginPath();
  if (isHorizontal) {
    ctx.moveTo(0, bandStart + bandThickness + 0.5);
    ctx.lineTo(width, bandStart + bandThickness + 0.5);
  } else {
    ctx.moveTo(bandStart + bandThickness + 0.5, 0);
    ctx.lineTo(bandStart + bandThickness + 0.5, height);
  }
  ctx.stroke();

  renderMeasurement();
}

function showControls() {
  pill.classList.remove('ruler-pill--hidden');
  state.visible = true;
  window.clearTimeout(state.hideTimer);
  state.hideTimer = window.setTimeout(() => {
    pill.classList.add('ruler-pill--hidden');
    state.visible = false;
  }, 3000);
}

async function requestFullscreen() {
  if (document.fullscreenElement) {
    return;
  }

  if (!stage.requestFullscreen) {
    return;
  }

  try {
    await stage.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Browser can reject fullscreen on mobile or sandboxed views.
  }
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') {
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    }, { once: true });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

function enableMeasurementMode() {
  showControls();
  requestWakeLock();
}

function setDragging(kind, pointerId, value) {
  state.dragging = kind;
  state.pointers.set(pointerId, value);
}

function updateDragPosition(pointerId, value) {
  state.pointers.set(pointerId, value);
  if (state.pointers.size >= 2) {
    if (!state.pinch) {
      state.pinch = {
        distance: Math.max(1, markerDistanceFromPointers()),
        span: Math.max(32, markerSpanPx())
      };
    }

    const pointerValues = Array.from(state.pointers.values());
    const midpoint = (pointerValues[0] + pointerValues[1]) / 2;
    const distance = Math.abs(pointerValues[1] - pointerValues[0]);
    const ratio = distance / Math.max(1, state.pinch.distance);
    const span = Math.max(24, state.pinch.span * ratio);
    state.markers.start = clampMarker(midpoint - span / 2);
    state.markers.end = clampMarker(midpoint + span / 2);
    state.dragging = null;
    positionMarkers();
    renderCanvas();
    return;
  }

  if (!state.dragging) {
    return;
  }

  state.markers[state.dragging] = value;
  positionMarkers();
  renderCanvas();
}

function markerDistanceFromPointers() {
  const pointerValues = Array.from(state.pointers.values());
  if (pointerValues.length < 2) {
    return 0;
  }

  return Math.abs(pointerValues[1] - pointerValues[0]);
}

function handlePointerDown(kind, event) {
  enableMeasurementMode();
  if (state.calibration && state.calibration.stale) {
    updateCalibrationGate();
    return;
  }

  const value = clampMarker(markerAxisValue(event));
  setDragging(kind, event.pointerId, value);
  event.currentTarget.setPointerCapture?.(event.pointerId);
  if (kind === 'start' || kind === 'end') {
    state.markers[kind] = value;
    positionMarkers();
    renderCanvas();
  }
}

function handleTrackPointerDown(event) {
  enableMeasurementMode();
  if (!isCalibrated()) {
    return;
  }

  const value = clampMarker(markerAxisValue(event));
  const nearest = Math.abs(value - state.markers.start) < Math.abs(value - state.markers.end) ? 'start' : 'end';
  setDragging(nearest, event.pointerId, value);
  event.currentTarget.setPointerCapture?.(event.pointerId);
  state.markers[nearest] = value;
  positionMarkers();
  renderCanvas();
}

function handlePointerMove(event) {
  if (!state.pointers.has(event.pointerId)) {
    return;
  }

  const value = clampMarker(markerAxisValue(event));
  updateDragPosition(event.pointerId, value);
}

function handlePointerUp(event) {
  state.pointers.delete(event.pointerId);
  state.dragging = state.pointers.size ? state.dragging : null;
  if (state.pointers.size < 2) {
    state.pinch = null;
  }
}

function updateInteractionVisibility() {
  showControls();
}

function verifyAndRefresh() {
  updateCalibrationGate();
  if (!isCalibrated()) {
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  updateScaleLabel();
  renderCanvas();
  positionMarkers();
}

orientationToggle.addEventListener('click', () => {
  setOrientation(state.orientation === 'horizontal' ? 'vertical' : 'horizontal');
  enableMeasurementMode();
});

unitToggle.addEventListener('click', () => {
  setUnits(state.units === 'cm' ? 'in' : 'cm');
  enableMeasurementMode();
});

fullscreenButton.addEventListener('click', async () => {
  await requestFullscreen();
  await requestWakeLock();
  enableMeasurementMode();
});

startMarker.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  handlePointerDown('start', event);
});

endMarker.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  handlePointerDown('end', event);
});

stage.addEventListener('pointerdown', (event) => {
  if (event.target === stage || event.target === canvas) {
    requestFullscreen();
  }
  updateInteractionVisibility();
});

stage.addEventListener('pointermove', updateInteractionVisibility);
stage.addEventListener('touchstart', updateInteractionVisibility, { passive: true });
stage.addEventListener('mousemove', updateInteractionVisibility);
window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerUp);
window.addEventListener('pointercancel', handlePointerUp);
window.addEventListener('resize', verifyAndRefresh);
window.addEventListener('orientationchange', verifyAndRefresh);
window.visualViewport?.addEventListener('resize', verifyAndRefresh);
window.visualViewport?.addEventListener('scroll', verifyAndRefresh);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    releaseWakeLock();
  } else {
    requestWakeLock();
    verifyAndRefresh();
  }
});

if ('ResizeObserver' in window) {
  resizeObserver = new ResizeObserver(() => {
    verifyAndRefresh();
  });
  resizeObserver.observe(stage);
}

stage.dataset.orientation = state.orientation;
stage.style.overscrollBehavior = 'none';
stage.style.touchAction = 'none';
pill.style.setProperty('visibility', 'visible');
updateSafeArea();
showControls();
verifyAndRefresh();

watchCalibrationEnvironment((calibration) => {
  state.calibration = calibration;
  verifyAndRefresh();
});
