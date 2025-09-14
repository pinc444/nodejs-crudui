// Example usage of the new CrudUI module
const CrudUI = require('./index');

// Configuration object
const config = {
  // Database connection
  database: {
    host: 'localhost',
    port: 3306,
    user: 'your_username',
    password: 'your_password',
    database: 'your_database'
  },
  
  // Root path for all CRUD routes
  rootPath: '/admin',
  
  // Default table configuration  
  defaultTable: {
    pagination: {
      enabled: true,
      pageSize: 25
    },
    instantSearch: true,
    advancedSearch: true,
    dateFilters: true,
    resizableColumns: true,
    sortableColumns: true,
    duplicate: true
  },
  
  // Default column configuration
  defaultColumn: {
    visible: true,
    sortable: true,
    searchable: true,
    resizable: true
  },
  
  // Specific table configurations
  tables: [
    {
      name: 'users',
      displayName: 'Users',
      description: 'Manage system users',
      hidden: false,
      columns: [
        {
          name: 'id',
          visible: true,
          sortable: true,
          searchable: false
        },
        {
          name: 'email',
          visible: true,
          sortable: true,
          searchable: true
        },
        {
          name: 'created_at',
          dateColumn: true,
          customRenderView: (value) => {
            return new Date(value).toLocaleDateString();
          }
        }
      ]
    },
    {
      name: 'orders',
      displayName: 'Orders',
      description: 'Customer orders',
      pagination: {
        enabled: true,
        pageSize: 50
      }
    },
    {
      name: 'admin_logs',
      hidden: true  // Hide this table from the UI
    },
    {
      // Custom SQL table (not a real database table)
      name: 'user_stats',
      displayName: 'User Statistics',
      description: 'Custom user statistics view',
      customSql: `
        SELECT 
          u.id,
          u.name,
          u.email,
          COUNT(o.id) as order_count,
          SUM(o.total) as total_spent
        FROM users u 
        LEFT JOIN orders o ON u.id = o.user_id 
        GROUP BY u.id
      `
    }
  ],
  
  // UI Configuration
  ui: {
    modernTheme: true,
    showTableLinks: true
  },
  
  // Feature flags
  features: {
    dbErrorUI: true
  }
};

// Create CrudUI instance
const crudUI = new CrudUI(config);

// Initialize with database connection
async function startApp() {
  try {
    // Initialize the CRUD UI
    await crudUI.init();
    
    // Get the Express app to add custom routes
    const app = crudUI.getApp();
    
    // Add custom routes if needed
    app.get('/custom-endpoint', (req, res) => {
      res.json({ message: 'Custom endpoint' });
    });
    
    // Start the server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`CrudUI running at http://localhost:${PORT}`);
      console.log(`Admin interface: http://localhost:${PORT}${config.rootPath || ''}/`);
    });
    
  } catch (error) {
    console.error('Failed to start CrudUI:', error.message);
    
    // If database connection fails, the dbErrorUI will be shown automatically
    // Start server anyway to show the database configuration form
    const PORT = process.env.PORT || 3000;
    crudUI.getApp().listen(PORT, () => {
      console.log(`CrudUI running at http://localhost:${PORT} (Database configuration required)`);
    });
  }
}

startApp();