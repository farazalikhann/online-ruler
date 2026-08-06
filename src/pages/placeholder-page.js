import '../styles/global.css';

const placeholderApp = document.getElementById('placeholder-app');
const tool = placeholderApp?.dataset.tool || 'tool';
const title = tool
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

placeholderApp.innerHTML = `
  <section class="surface placeholder-card stack">
    <div class="kicker">MeasureKit</div>
    <h1>${title}</h1>
    <p>
      This page is reserved for the ${title.toLowerCase()} tool. It will read the shared calibration module
      once the tool itself is implemented.
    </p>
    <div class="link-grid">
      <a class="link-card" href="./index.html">Home</a>
      <a class="link-card" href="./calibration.html">Calibration</a>
      <a class="link-card" href="./ruler.html">Ruler</a>
    </div>
  </section>
`;