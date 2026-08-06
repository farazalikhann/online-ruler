import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        calibration: 'calibration.html',
        ruler: 'ruler.html',
        bubbleLevel: 'bubble-level.html',
        protractor: 'protractor.html',
        ringSize: 'ring-size.html',
        shoeSize: 'shoe-size.html',
        paperRuler: 'paper-ruler.html'
      }
    }
  }
});