// Test server that stays running
const CrudUI = require('./index');

const config = {
  database: {
    host: 'nonexistent-host',
    user: 'test',
    password: 'test',
    database: 'test'
  },
  rootPath: '/admin',
  features: {
    dbErrorUI: true
  }
};

const crudUI = new CrudUI(config);

crudUI.init().catch(err => {
  console.log('Database error (expected):', err.message);
  console.log('Starting server with database configuration UI...');
});

const PORT = 3000;
crudUI.getApp().listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Database configuration UI should be available');
});