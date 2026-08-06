import '../styles/global.css';
import { getCalibration } from '../lib/calibration.js';

const app = document.getElementById('ruler-app');
const calibration = getCalibration();
const fallbackPxPerMm = 96 / 25.4;

app.innerHTML = `
  <section class="ruler-surface"></section>
  <section class="ruler-overlay" data-orientation="horizontal" id="ruler-overlay">
    <div class="ruler-hud ruler-hud--top">
      <div class="panel space-between">
        <div>
          <p class="kicker">Ruler</p>
          <h1>Full-screen measurement surface</h1>
        </div>
        <div class="row">
          <button class="button" id="toggle-orientation" type="button">Horizontal</button>
          <button class="button-ghost" id="toggle-units" type="button">Centimetres</button>
        </div>
      </div>
      <div class="panel space-between">
        <div class="stack small">
          <span>Calibration</span>
          <strong class="mono">${calibration ? `${calibration.physicalPpi.toFixed(2)} PPI` : 'Not calibrated'}</strong>
        </div>
        <div class="stack small" id="measurement-readout">
          <span>Start / end</span>
          <strong class="mono">0.0 cm</strong>
        </div>
      </div>
      ${calibration ? '' : '<div class="callout callout--warn">This ruler is using an approximate CSS-pixel scale until you calibrate the screen.</div>'}
    </div>
    <div class="ruler-track" id="ruler-track"></div>
    <div class="marker-line" id="start-marker" data-axis="horizontal"><div class="marker-handle" id="start-handle"></div></div>
    <div class="marker-line" id="end-marker" data-axis="horizontal"><div class="marker-handle" id="end-handle"></div></div>
  </section>
`;

const overlay = document.getElementById('ruler-overlay');
const track = document.getElementById('ruler-track');
const startMarker = document.getElementById('start-marker');
const endMarker = document.getElementById('end-marker');
const readout = document.getElementById('measurement-readout');
const toggleOrientation = document.getElementById('toggle-orientation');
const toggleUnits = document.getElementById('toggle-units');

const state = {
  orientation: 'horizontal',
  units: 'cm',
  start: 120,
  end: 340,
  dragging: null,
  pointers: new Map(),
  pinch: null
};

function currentPxPerMm() {
  return calibration?.effectivePxPerMm ?? fallbackPxPerMm;
}

function trackLength() {
  return state.orientation === 'horizontal' ? track.clientWidth : track.clientHeight;
}

function clamp(value) {
  return Math.max(0, Math.min(value, trackLength()));
}

function axisValue(event) {
  const rect = track.getBoundingClientRect();
  return state.orientation === 'horizontal'
    ? event.clientX - rect.left
    : event.clientY - rect.top;
}

function pointerDistance() {
  const [first, second] = Array.from(state.pointers.values());
  if (typeof first !== 'number' || typeof second !== 'number') {
    return 0;
  }

  return Math.abs(second - first);
}

function pointerMidpoint() {
  const [first, second] = Array.from(state.pointers.values());
  if (typeof first !== 'number' || typeof second !== 'number') {
    return 0;
  }

  return (first + second) / 2;
}

function setMarkerPositions() {
  const start = clamp(state.start);
  const end = clamp(state.end);
  const [first, second] = start <= end ? [start, end] : [end, start];
  state.start = first;
  state.end = second;

  if (state.orientation === 'horizontal') {
    startMarker.style.left = `${first}px`;
    startMarker.style.top = '0';
    startMarker.style.height = '100%';
    startMarker.style.width = '2px';
    endMarker.style.left = `${second}px`;
    endMarker.style.top = '0';
    endMarker.style.height = '100%';
    endMarker.style.width = '2px';
    startMarker.dataset.axis = 'horizontal';
    endMarker.dataset.axis = 'horizontal';
    startMarker.querySelector('.marker-handle').style.left = '1px';
    startMarker.querySelector('.marker-handle').style.top = '12px';
    endMarker.querySelector('.marker-handle').style.left = '1px';
    endMarker.querySelector('.marker-handle').style.top = '12px';
    return;
  }

  startMarker.style.top = `${first}px`;
  startMarker.style.left = '0';
  startMarker.style.width = '100%';
  startMarker.style.height = '2px';
  endMarker.style.top = `${second}px`;
  endMarker.style.left = '0';
  endMarker.style.width = '100%';
  endMarker.style.height = '2px';
  startMarker.dataset.axis = 'vertical';
  endMarker.dataset.axis = 'vertical';
  startMarker.querySelector('.marker-handle').style.left = '12px';
  startMarker.querySelector('.marker-handle').style.top = '1px';
  endMarker.querySelector('.marker-handle').style.left = '12px';
  endMarker.querySelector('.marker-handle').style.top = '1px';
}

function formatMeasurement() {
  const deltaPx = Math.abs(state.end - state.start);
  const mm = deltaPx / currentPxPerMm();

  if (state.units === 'in') {
    const inches = mm / 25.4;
    readout.innerHTML = `<span>Start / end</span><strong class="mono">${inches.toFixed(3)} in</strong>`;
    return;
  }

  readout.innerHTML = `<span>Start / end</span><strong class="mono">${(mm / 10).toFixed(2)} cm</strong>`;
}

function renderRuler() {
  const canvas = document.createElement('canvas');
  const isHorizontal = state.orientation === 'horizontal';
  const width = isHorizontal ? track.clientWidth : track.clientHeight;
  const height = isHorizontal ? track.clientHeight : track.clientWidth;
  const devicePixelRatio = window.devicePixelRatio || 1;
  const cssPxPerMm = currentPxPerMm();

  canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
  canvas.height = Math.max(1, Math.round(height * devicePixelRatio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#151515';
  ctx.fillRect(0, 0, width, height);

  const limit = isHorizontal ? width : height;
  const majorEvery = state.units === 'cm' ? 10 : 25.4;
  const halfEvery = state.units === 'cm' ? 5 : 12.7;
  const quarterEvery = state.units === 'in' ? 6.35 : null;
  const eighthEvery = state.units === 'in' ? 3.175 : null;
  const minorStep = state.units === 'cm' ? 1 : 1.5875;

  for (let mm = 0; mm <= limit / cssPxPerMm + minorStep; mm += minorStep) {
    const pos = mm * cssPxPerMm;
    const isMajor = Math.abs(mm % majorEvery) < minorStep / 2;
    const isHalf = !isMajor && Math.abs(mm % halfEvery) < minorStep / 2;
    const isQuarter = !isMajor && !isHalf && quarterEvery && Math.abs(mm % quarterEvery) < minorStep / 2;
    const isEighth = !isMajor && !isHalf && !isQuarter && eighthEvery && Math.abs(mm % eighthEvery) < minorStep / 2;
    const tickLength = isMajor ? 52 : isHalf ? 40 : isQuarter ? 32 : isEighth ? 24 : 18;

    ctx.strokeStyle = 'rgba(228, 177, 94, 0.92)';
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    if (isHorizontal) {
      ctx.moveTo(pos + 0.5, 0);
      ctx.lineTo(pos + 0.5, tickLength);
    } else {
      ctx.moveTo(0, pos + 0.5);
      ctx.lineTo(tickLength, pos + 0.5);
    }
    ctx.stroke();

    if (isMajor) {
      ctx.fillStyle = '#f3e1bb';
      ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.textBaseline = 'top';
      const label = state.units === 'cm' ? String(Math.round(mm / 10)) : String(Math.round(mm / 25.4));
      if (isHorizontal) {
        ctx.fillText(label, pos + 4, tickLength + 4);
      } else {
        ctx.fillText(label, tickLength + 6, pos + 2);
      }
    }
  }

  if (isHorizontal) {
    ctx.strokeStyle = 'rgba(242, 201, 129, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 52.5);
    ctx.lineTo(width, 52.5);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(242, 201, 129, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(52.5, 0);
    ctx.lineTo(52.5, height);
    ctx.stroke();
  }

  track.replaceChildren(canvas);
}

function updateUI() {
  overlay.dataset.orientation = state.orientation;
  toggleOrientation.textContent = state.orientation === 'horizontal' ? 'Horizontal' : 'Vertical';
  toggleUnits.textContent = state.units === 'cm' ? 'Centimetres' : 'Inches';
  startMarker.style.display = 'block';
  endMarker.style.display = 'block';
  renderRuler();
  setMarkerPositions();
  formatMeasurement();
}

function beginPointer(kind, event) {
  const value = clamp(axisValue(event));
  state.pointers.set(event.pointerId, value);
  state.dragging = kind;
  event.currentTarget.setPointerCapture?.(event.pointerId);

  if (kind === 'start' || kind === 'end') {
    state[kind] = value;
    setMarkerPositions();
    formatMeasurement();
  }
}

function beginTrackPointer(event) {
  const value = clamp(axisValue(event));
  const nearest = Math.abs(value - state.start) < Math.abs(value - state.end) ? 'start' : 'end';
  state.pointers.set(event.pointerId, value);
  state.dragging = nearest;
  state[nearest] = value;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  setMarkerPositions();
  formatMeasurement();
}

function applyPinch() {
  if (!state.pinch || state.pointers.size < 2) {
    return;
  }

  const midpoint = clamp(pointerMidpoint());
  const distance = pointerDistance();
  const ratio = distance / Math.max(1, state.pinch.distance);
  const nextSpan = Math.max(24, state.pinch.span * ratio);

  state.start = clamp(midpoint - nextSpan / 2);
  state.end = clamp(midpoint + nextSpan / 2);
  state.dragging = null;
  setMarkerPositions();
  formatMeasurement();
}

function handlePointerMove(event) {
  if (!state.pointers.has(event.pointerId)) {
    return;
  }

  state.pointers.set(event.pointerId, clamp(axisValue(event)));

  if (state.pointers.size >= 2) {
    if (!state.pinch) {
      state.pinch = {
        distance: Math.max(1, pointerDistance()),
        span: Math.max(24, Math.abs(state.end - state.start))
      };
    }

    applyPinch();
    return;
  }

  if (!state.dragging) {
    return;
  }

  const nextValue = clamp(axisValue(event));
  state[state.dragging] = nextValue;
  setMarkerPositions();
  formatMeasurement();
}

function handlePointerUp(event) {
  state.pointers.delete(event.pointerId);
  if (state.pointers.size < 2) {
    state.pinch = null;
  }
  if (state.pointers.size === 0) {
    state.dragging = null;
  }
}

startMarker.addEventListener('pointerdown', (event) => {
  event.stopPropagation();
  beginPointer('start', event);
});

endMarker.addEventListener('pointerdown', (event) => {
  event.stopPropagation();
  beginPointer('end', event);
});

track.addEventListener('pointerdown', beginTrackPointer);
window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerUp);
window.addEventListener('pointercancel', handlePointerUp);

toggleOrientation.addEventListener('click', () => {
  state.orientation = state.orientation === 'horizontal' ? 'vertical' : 'horizontal';
  state.start = 120;
  state.end = 340;
  updateUI();
});

toggleUnits.addEventListener('click', () => {
  state.units = state.units === 'cm' ? 'in' : 'cm';
  updateUI();
});

track.style.touchAction = 'none';

if ('ResizeObserver' in window) {
  const resizeObserver = new ResizeObserver(() => {
    updateUI();
  });

  resizeObserver.observe(track);
} else {
  window.addEventListener('resize', updateUI);
}

updateUI();