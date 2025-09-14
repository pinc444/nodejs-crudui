# CrudUI - Advanced Configurable CRUD Interface for MySQL

A modern, configurable CRUD (Create, Read, Update, Delete) interface for MySQL databases with advanced features and beautiful UI.

## Features

- 🎨 **Modern UI** - Beautiful, responsive design with gradient themes
- ⚙️ **Highly Configurable** - Customizable tables, columns, and behaviors
- 📱 **Responsive** - Mobile-friendly interface
- 🔍 **Advanced Search** - Date filters, column-specific search, and instant search
- 📊 **Data Management** - Pagination, sorting, column resizing, and CSV export
- 🎯 **Express Integration** - Export Express app for custom route integration
- 🗃️ **Custom SQL Support** - Virtual tables with custom SQL queries
- 🚫 **Table Visibility** - Hide sensitive tables from the UI
- 📋 **Duplicate Records** - Easy record duplication
- 🔧 **Database Error UI** - User-friendly database configuration interface

## Installation

```bash
npm install crudui
```

## Quick Start

```javascript
const CrudUI = require('crudui');

// Basic configuration
const config = {
  database: {
    host: 'localhost',
    user: 'your_username', 
    password: 'your_password',
    database: 'your_database'
  }
};

// Create and initialize CrudUI
const crudUI = new CrudUI(config);

async function startApp() {
  try {
    await crudUI.init();
    
    // Start server
    crudUI.listen(3000, () => {
      console.log('CrudUI running at http://localhost:3000');
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

startApp();
```

## Advanced Configuration

```javascript
const config = {
  // Database connection
  database: {
    host: 'localhost',
    port: 3306,
    user: 'username',
    password: 'password', 
    database: 'database_name'
  },
  
  // Root path for all CRUD routes (optional)
  rootPath: '/admin',
  
  // Default table configuration
  defaultTable: {
    pagination: {
      enabled: true,
      pageSize: 50
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
    resizable: true,
    customRenderView: null,
    customRenderEdit: null,
    dateColumn: false
  },
  
  // Table-specific configurations
  tables: [
    {
      name: 'users',
      displayName: 'System Users',
      description: 'Manage user accounts',
      hidden: false,
      pagination: { pageSize: 25 },
      columns: [
        {
          name: 'password',
          visible: false  // Hide sensitive columns
        },
        {
          name: 'created_at', 
          dateColumn: true,
          customRenderView: (value) => new Date(value).toLocaleDateString()
        }
      ]
    },
    {
      name: 'logs',
      hidden: true  // Hide from UI completely
    },
    {
      // Custom SQL table (virtual table)
      name: 'user_summary',
      displayName: 'User Summary',
      customSql: `
        SELECT u.id, u.name, u.email, 
               COUNT(o.id) as order_count
        FROM users u 
        LEFT JOIN orders o ON u.id = o.user_id 
        GROUP BY u.id
      `
    }
  ]
};
```

## Express Integration

```javascript
const express = require('express');
const CrudUI = require('crudui');

const app = express();
const crudUI = new CrudUI(config);

// Initialize CrudUI
await crudUI.init();

// Add CrudUI routes to your Express app
app.use('/admin', crudUI.getApp());

// Add your own custom routes
app.get('/api/custom', (req, res) => {
  res.json({ message: 'Custom API endpoint' });
});

app.listen(3000);
```

## Configuration Options

### Database Configuration
- `host` - Database host
- `port` - Database port (default: 3306)  
- `user` - Database username
- `password` - Database password
- `database` - Database name

### UI Configuration
- `rootPath` - Base path for all routes (default: '')
- `modernTheme` - Enable modern UI theme (default: true)
- `showTableLinks` - Show table navigation (default: true)

### Table Configuration
- `name` - Table name (required)
- `displayName` - Display name in UI
- `description` - Table description
- `hidden` - Hide table from UI (default: false)
- `customSql` - Custom SQL query for virtual tables
- `pagination.enabled` - Enable pagination (default: true)
- `pagination.pageSize` - Records per page (default: 50)
- `instantSearch` - Enable instant search (default: true)
- `advancedSearch` - Enable advanced search (default: true)
- `dateFilters` - Enable date filters (default: true)
- `resizableColumns` - Enable column resizing (default: true)
- `sortableColumns` - Enable column sorting (default: true)
- `duplicate` - Enable record duplication (default: true)

### Column Configuration
- `name` - Column name (required)
- `visible` - Show/hide column (default: true)
- `sortable` - Enable sorting (default: true)
- `searchable` - Include in search (default: true)
- `resizable` - Enable resizing (default: true)
- `dateColumn` - Treat as date column (default: false)
- `customRenderView` - Custom view renderer function
- `customRenderEdit` - Custom edit renderer function

## API Methods

### CrudUI Class
- `new CrudUI(config)` - Create new instance
- `init(dbConfig?)` - Initialize with database connection
- `getApp()` - Get Express app instance
- `listen(port, callback?)` - Start server (convenience method)

## Requirements

- Node.js >= 14.0.0
- MySQL database
- Express.js (included)

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.

## Support

For issues and questions, please use the GitHub issue tracker.
