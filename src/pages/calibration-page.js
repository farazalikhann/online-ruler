import '../styles/global.css';
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  clearCalibration,
  createCardCalibration,
  createDiagonalCalibration,
  defaultCalibrationDiagonal,
  formatCalibrationSummary,
  getCalibration,
  getCalibrationStatus,
  saveCalibration,
  watchCalibrationEnvironment
} from '../lib/calibration.js';

const header = document.getElementById('calibration-header');
const visual = document.getElementById('calibration-visual');
const controls = document.getElementById('calibration-controls');

const cardState = {
  widthPx: 280,
  mode: 'card',
  diagonalInches: defaultCalibrationDiagonal(),
  zoomWarning: ''
};

function renderHeader() {
  const calibration = getCalibration();
  const status = getCalibrationStatus();

  header.innerHTML = `
    <div class="space-between">
      <div>
        <p class="kicker">Screen calibration</p>
        <h1>Measure against a real bank card.</h1>
      </div>
      <span class="badge">${status.hasCalibration ? 'Saved' : 'Fresh setup'}</span>
    </div>
    <p>${status.warning || 'Resize the card until it exactly matches a physical card on your screen.'}</p>
    <div class="row">
      <span class="chip">${formatCalibrationSummary(calibration)}</span>
      <span class="chip">ISO/IEC 7810 ID-1</span>
      <span class="chip">85.60 mm × 53.98 mm</span>
    </div>
    ${cardState.zoomWarning ? `<div class="callout callout--warn">${cardState.zoomWarning}</div>` : ''}
  `;
}

function renderVisual() {
  const isCardMode = cardState.mode === 'card';
  const widthPx = cardState.widthPx;
  const heightPx = widthPx / (CARD_WIDTH_MM / CARD_HEIGHT_MM);

  visual.innerHTML = `
    <div class="calibration-stage-graphic">
      <div class="calibration-frame">
        <div class="calibration-card" style="width:${widthPx}px;height:${heightPx}px;max-width:100%;touch-action:none;" aria-label="Calibration card" role="img">
          <div class="calibration-card__stripe"></div>
          <div class="calibration-card__chip"></div>
          <div class="calibration-card__contactless"></div>
          <div class="calibration-card__brand">MeasureKit</div>
          <div class="calibration-card__pan mono">0000 0000 0000 0000</div>
          <div class="calibration-card__label mono">${CARD_WIDTH_MM.toFixed(2)} mm × ${CARD_HEIGHT_MM.toFixed(2)} mm</div>
        </div>
      </div>
      <div class="calibration-frame__caption mono">Place a physical bank card here and match this outline exactly</div>
    </div>
  `;

  visual.dataset.mode = cardState.mode;
  visual.dataset.active = String(isCardMode);
}

function renderControls() {
  const calibration = getCalibration();
  controls.innerHTML = `
    <section class="panel stack">
      <div class="space-between">
        <h2>Card match</h2>
        <span class="badge">Primary method</span>
      </div>
      <p>Drag the slider until the rectangle matches a bank card placed against your screen.</p>
      <input id="card-width-slider" type="range" min="180" max="620" step="1" value="${cardState.widthPx}" />
      <div class="space-between small">
        <span>Rectangle width</span>
        <strong class="mono" id="card-width-label">${cardState.widthPx}px</strong>
      </div>
      <div class="row">
        <button class="button" id="save-card-calibration" type="button">Save card calibration</button>
        <button class="button-ghost" id="reset-card-calibration" type="button">Reset card size</button>
      </div>
    </section>

    <section class="panel stack">
      <div class="space-between">
        <h2>Diagonal fallback</h2>
        <span class="badge">Secondary method</span>
      </div>
      <p>Enter your screen diagonal in inches if you want a second estimate from the reported resolution.</p>
      <div class="row">
        <label class="stack" style="flex:1;">
          <span class="micro">Diagonal in inches</span>
          <input id="diagonal-input" type="number" min="1" step="0.1" inputmode="decimal" value="${cardState.diagonalInches.toFixed(1)}" />
        </label>
        <button class="button" id="save-diagonal-calibration" type="button">Save diagonal calibration</button>
      </div>
      <div class="small stack">
        <div class="space-between"><span>Saved scale</span><strong class="mono">${formatCalibrationSummary(calibration)}</strong></div>
        <div class="space-between"><span>Action</span><strong class="mono">${calibration ? 'Recalibrate anytime' : 'Not calibrated yet'}</strong></div>
      </div>
      <div class="row">
        <button class="button-ghost" id="clear-calibration" type="button">Clear saved calibration</button>
      </div>
    </section>
  `;

  const slider = document.getElementById('card-width-slider');
  const label = document.getElementById('card-width-label');
  const diagonalInput = document.getElementById('diagonal-input');

  slider.addEventListener('input', () => {
    cardState.widthPx = Number(slider.value);
    label.textContent = `${cardState.widthPx}px`;
    renderVisual();
  });

  document.getElementById('reset-card-calibration').addEventListener('click', () => {
    cardState.widthPx = 280;
    slider.value = String(cardState.widthPx);
    label.textContent = `${cardState.widthPx}px`;
    renderVisual();
  });

  document.getElementById('save-card-calibration').addEventListener('click', () => {
    const saved = saveCalibration(createCardCalibration({ measuredWidthPx: cardState.widthPx }));
    cardState.zoomWarning = saved.stale ? 'Saved calibration may be off because the browser zoom or display settings differ from the moment it was captured.' : '';
    renderHeader();
    renderControls();
  });

  document.getElementById('save-diagonal-calibration').addEventListener('click', () => {
    const saved = saveCalibration(createDiagonalCalibration({ diagonalInches: diagonalInput.value }));
    cardState.zoomWarning = saved.stale ? 'Saved calibration may be off because the browser zoom or display settings differ from the moment it was captured.' : '';
    renderHeader();
    renderControls();
  });

  document.getElementById('clear-calibration').addEventListener('click', () => {
    clearCalibration();
    cardState.zoomWarning = '';
    renderHeader();
    renderControls();
  });
}

function onEnvironmentChange(calibration) {
  cardState.zoomWarning = calibration?.stale ? 'Browser zoom or display settings changed. Recalibrate for accuracy.' : '';
  renderHeader();
}

renderHeader();
renderVisual();
renderControls();
watchCalibrationEnvironment(onEnvironmentChange);