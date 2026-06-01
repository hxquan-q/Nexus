import { createApp } from 'vue';
import App from '../sidepanel/App.vue';
import 'katex/dist/katex.min.css';
import '../sidepanel/style.css';

createApp(App, {
  surfaceMode: 'window',
}).mount('#app');
