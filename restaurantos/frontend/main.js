import { startModularApp } from './bootstrap.js';

/**
 * Standalone Browser Entry Point for RestaurantOS Modular Runtime.
 * Listens for DOMContentLoaded and bootstraps the modular Platform & Application Container graph.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    startModularApp();
  });
}
