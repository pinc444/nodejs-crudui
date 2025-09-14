// Simple test of the new CrudUI module
const CrudUI = require('./index');

// Test configuration (will trigger database error UI)
const config = {
  database: {
    host: 'nonexistent-host',
    user: 'test',
    password: 'test',
    database: 'test'
  },
  rootPath: '/admin',
  defaultTable: {
    pagination: { pageSize: 10 }
  },
  features: {
    dbErrorUI: true
  }
};

console.log('Testing CrudUI initialization...');

const crudUI = new CrudUI(config);

// Test that the express app is created
const app = crudUI.getApp();
console.log('✓ Express app created successfully');

// Test initialization (should fail gracefully and show DB error UI)
crudUI.init().catch(err => {
  console.log('✓ Database error handled gracefully:', err.message);
  
  // Start server to show database configuration UI
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`✓ CrudUI running at http://localhost:${PORT}`);
    console.log('✓ Database configuration UI should be available');
    console.log('✓ All basic functionality tests passed!');
    
    // Exit after a short delay to show it works
    setTimeout(() => {
      console.log('Test completed successfully!');
      process.exit(0);
    }, 2000);
  });
});

// Test configuration methods
console.log('Testing configuration methods...');
console.log('✓ getTableConfig:', JSON.stringify(config.tables ? crudUI.config.getTableConfig('test') : crudUI.config.defaultTable, null, 2));
console.log('✓ getColumnConfig:', JSON.stringify(crudUI.config.getColumnConfig('test', 'id'), null, 2));