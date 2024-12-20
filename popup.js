// ...existing code...

import connection from './utils/connectionManager.js'; // Ensure correct import
import stateManager from './utils/stateManager.js'; // Import singleton
import { logger } from './utils/logger.js'; // Import logger

async function initializePopup() {
  try {
    await stateManager.initialize(); // Initialize StateManager if not already
    await connection.initialize(); // Initialize ConnectionManager with singleton
    logger.info('Popup initialized successfully');
  } catch (error) {
    logger.error('Connection failed:', error);
    console.error('Connection failed:', error);
    // ...additional error handling...
  }
}

initializePopup();

// ...existing code...