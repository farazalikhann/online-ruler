import '../styles/global.css';
import { getCalibration, getCalibrationStatus, formatCalibrationSummary, currentEnvironment } from '../lib/calibration.js';

const homeStatus = document.getElementById('home-status');
const calibration = getCalibration();
const status = getCalibrationStatus();
const environment = currentEnvironment();

homeStatus.innerHTML = `
  <div class="stack">
    <div class="space-between">
      <div>
        <p class="kicker">Calibration</p>
        <h2>${status.hasCalibration ? 'Ready to measure' : 'Calibration required'}</h2>
      </div>
      <span class="badge">${status.hasCalibration ? 'Saved' : 'Not saved'}</span>
    </div>
    <p>${status.warning || 'Calibrate once and every other page will use the same physical scale.'}</p>
    <div class="divider"></div>
    <div class="stack small">
      <div class="space-between"><span>Scale</span><strong class="mono">${formatCalibrationSummary(calibration)}</strong></div>
      <div class="space-between"><span>Zoom factor</span><strong class="mono">${environment.zoomFactor.toFixed(3)}x</strong></div>
      <div class="space-between"><span>Screen</span><strong class="mono">${environment.screenWidth} × ${environment.screenHeight}</strong></div>
    </div>
    <div class="row">
      <a class="button" href="./calibration.html">${status.hasCalibration ? 'Recalibrate' : 'Calibrate now'}</a>
      <a class="button-ghost" href="./ruler.html">Open ruler</a>
    </div>
  </div>
`;