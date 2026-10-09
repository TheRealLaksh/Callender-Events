import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { mountApp } from './ui/app';
import { toast } from './ui/toast';

const root = document.getElementById('app');
if (root) mountApp(root);

registerSW({
  immediate: true,
  onOfflineReady() {
    toast('Calibridge is ready to work offline.', { kind: 'success' });
  },
});
