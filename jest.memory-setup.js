const util = require('util');

global.memoryUsage = {
  start: process.memoryUsage(),
  lastCheck: Date.now(),
  threshold: 15 * 1024 * 1024, // Lower threshold to 15MB
  checkPoint: function() {
    const now = Date.now();
    const used = process.memoryUsage();
    
    // Check more frequently
    if (now - this.lastCheck < 15) { // More frequent checks
      return null;
    }
    
    this.lastCheck = now;
    const diff = {
      rss: used.rss - this.start.rss,
      heapTotal: used.heapTotal - this.start.heapTotal,
      heapUsed: used.heapUsed - this.start.heapUsed
    };
    
    // More aggressive GC
    if (diff.heapUsed > this.threshold || diff.rss > this.threshold) {
      if (global.gc) {
        // Quadruple GC pass with delay
        const runGc = () => {
          global.gc();
          return new Promise(resolve => setTimeout(resolve, 10));
        };
        return Promise.all([runGc(), runGc(), runGc(), runGc()]).then(() => {
          this.start = process.memoryUsage();
          return diff;
        });
      }
    }
    return diff;
  },
  reset: function() {
    this.start = process.memoryUsage();
    this.lastCheck = Date.now();
    if (global.gc) global.gc();
  }
};

// Optionally adjust threshold if needed
global.memoryUsage.threshold = 20 * 1024 * 1024; 

// More aggressive cleanup
beforeEach(async () => {
  if (global.gc) {
    await Promise.all([
      global.gc(),
      new Promise(resolve => setTimeout(resolve, 10)),
      global.gc()
    ]);
  }
  await global.memoryUsage.reset();
});

// Double cleanup after each test
afterEach(async () => {
  if (global.gc) {
    await Promise.all([
      global.gc(),
      new Promise(resolve => setImmediate(resolve)),
      global.gc()
    ]);
  }
});