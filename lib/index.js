const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// Configuration class with defaults
class CrudUIConfig {
  constructor(options = {}) {
    // Database configuration
    this.database = options.database || {};
    
    // Root path for all routes
    this.rootPath = options.rootPath || '';
    
    // Default table configuration
    this.defaultTable = {
      hidden: false,
      customSql: null,
      pagination: {
        enabled: true,
        pageSize: 50
      },
      instantSearch: true,
      advancedSearch: true,
      dateFilters: true,
      resizableColumns: true,
      sortableColumns: true,
      duplicate: true,
      ...options.defaultTable
    };
    
    // Default column configuration
    this.defaultColumn = {
      visible: true,
      sortable: true,
      searchable: true,
      resizable: true,
      customRenderView: null,
      customRenderEdit: null,
      dateColumn: false,
      ...options.defaultColumn
    };
    
    // Tables configuration - array of table objects
    this.tables = options.tables || [];
    
    // UI Configuration
    this.ui = {
      modernTheme: true,
      showTableLinks: true,
      ...options.ui
    };
    
    // Feature flags
    this.features = {
      dbErrorUI: true,
      ...options.features
    };
  }

  // Get table configuration
  getTableConfig(tableName) {
    const tableConfig = this.tables.find(t => t.name === tableName);
    return tableConfig ? { ...this.defaultTable, ...tableConfig } : this.defaultTable;
  }

  // Get column configuration
  getColumnConfig(tableName, columnName) {
    const tableConfig = this.getTableConfig(tableName);
    if (tableConfig.columns) {
      const columnConfig = tableConfig.columns.find(c => c.name === columnName);
      return columnConfig ? { ...this.defaultColumn, ...columnConfig } : this.defaultColumn;
    }
    return this.defaultColumn;
  }
}

// Main CrudUI class
class CrudUI {
  constructor(config = {}) {
    this.config = new CrudUIConfig(config);
    this.app = express();
    this.connection = null;
    
    // Setup middleware
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(bodyParser.json());
    
    // Load static assets
    this._loadAssets();
  }

  // Load CSS and JS assets
  _loadAssets() {
    try {
      this.CSS = fs.readFileSync(path.join(__dirname, '..', 'assets', 'style.css'), 'utf8');
      this.clientJS = fs.readFileSync(path.join(__dirname, '..', 'assets', 'client.js'), 'utf8');
    } catch (err) {
      console.error('Error loading assets:', err);
      // Fallback to original files if assets directory doesn't exist
      try {
        this.CSS = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
        this.clientJS = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
      } catch (fallbackErr) {
        console.error('Error loading fallback assets:', fallbackErr);
        this.CSS = '';
        this.clientJS = '';
      }
    }
  }

  // Initialize database connection
  async init(dbConfig = null) {
    try {
      const config = dbConfig || this.config.database;
      if (!config.host || !config.user || !config.database) {
        throw new Error('Database configuration required');
      }
      
      this.connection = await mysql.createConnection(config);
      await this._setupRoutes();
      return this;
    } catch (err) {
      console.error('Database connection error:', err);
      if (this.config.features.dbErrorUI) {
        this._setupDbErrorUI();
      }
      throw err;
    }
  }

  // Setup database error UI
  _setupDbErrorUI() {
    this.app.get('*', (req, res) => {
      res.send(this._pageWrap(this._generateDbErrorForm(), 'Database Configuration Error'));
    });
    
    this.app.post('/db-config', async (req, res) => {
      try {
        const dbConfig = {
          host: req.body.host,
          port: parseInt(req.body.port) || 3306,
          user: req.body.user,
          password: req.body.password,
          database: req.body.database
        };
        
        // Test connection
        const testConnection = await mysql.createConnection(dbConfig);
        await testConnection.end();
        
        // Save config and reinitialize
        this.config.database = dbConfig;
        await this.init(dbConfig);
        
        res.redirect('/');
      } catch (err) {
        res.send(this._pageWrap(
          this._generateDbErrorForm(err.message), 
          'Database Configuration Error'
        ));
      }
    });
  }

  // Generate database error form
  _generateDbErrorForm(error = '') {
    return `
      <div class="db-error-form">
        ${error ? `<div class="error-message">${error}</div>` : ''}
        <h2>Database Connection Required</h2>
        <form method="POST" action="/db-config">
          <div class="form-group">
            <label>Host:</label>
            <input type="text" name="host" required placeholder="localhost">
          </div>
          <div class="form-group">
            <label>Port:</label>
            <input type="number" name="port" placeholder="3306" value="3306">
          </div>
          <div class="form-group">
            <label>Username:</label>
            <input type="text" name="user" required>
          </div>
          <div class="form-group">
            <label>Password:</label>
            <input type="password" name="password">
          </div>
          <div class="form-group">
            <label>Database:</label>
            <input type="text" name="database" required>
          </div>
          <button type="submit" class="btn btn-primary">Connect</button>
        </form>
      </div>
    `;
  }

  // Setup all routes
  async _setupRoutes() {
    const tables = await this._getTables();
    
    // Filter hidden tables
    const visibleTables = tables.filter(tableName => {
      const tableConfig = this.config.getTableConfig(tableName);
      return !tableConfig.hidden;
    });

    // Setup routes for each table
    for (const table of visibleTables) {
      await this._setupTableRoutes(table);
    }

    // Setup custom SQL tables
    for (const tableConfig of this.config.tables) {
      if (tableConfig.customSql) {
        await this._setupCustomTableRoutes(tableConfig);
      }
    }

    // Root route - list tables with modern UI
    this.app.get(this.config.rootPath + '/', (req, res) => {
      const tableLinks = visibleTables.map(table => {
        const tableConfig = this.config.getTableConfig(table);
        return {
          name: table,
          displayName: tableConfig.displayName || table,
          description: tableConfig.description || `Manage ${table} records`
        };
      });

      // Add custom SQL tables
      for (const tableConfig of this.config.tables) {
        if (tableConfig.customSql && !tableConfig.hidden) {
          tableLinks.push({
            name: tableConfig.name,
            displayName: tableConfig.displayName || tableConfig.name,
            description: tableConfig.description || `Custom table: ${tableConfig.name}`
          });
        }
      }

      res.send(this._pageWrap(this._generateModernTableList(tableLinks), 'Tables'));
    });
  }

  // Generate modern table list UI
  _generateModernTableList(tables) {
    if (!tables.length) {
      return '<div class="no-tables">No tables available</div>';
    }

    let html = '<div class="table-grid">';
    tables.forEach(table => {
      html += `
        <div class="table-card" onclick="window.location.href='${this.config.rootPath}/${encodeURIComponent(table.name)}'">
          <div class="table-card-header">
            <h3>${this._escapeHtml(table.displayName)}</h3>
          </div>
          <div class="table-card-body">
            <p>${this._escapeHtml(table.description)}</p>
          </div>
          <div class="table-card-footer">
            <span class="table-name">${this._escapeHtml(table.name)}</span>
          </div>
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  // Setup routes for a regular database table
  async _setupTableRoutes(table) {
    const basePath = this.config.rootPath + '/' + table;

    // List/grid view with pagination and advanced features
    this.app.get(basePath, async (req, res) => {
      try {
        await this._handleTableList(req, res, table);
      } catch (err) {
        res.status(500).send(this._pageWrap(`Error: ${err.message}`, 'Error'));
      }
    });

    // Other CRUD routes...
    this._setupCrudRoutes(table, basePath);
  }

  // Setup CRUD routes for a table
  _setupCrudRoutes(table, basePath) {
    // View record
    this.app.get(basePath + '/view/:id', async (req, res) => {
      // Implementation will be added
      res.send('View record implementation');
    });

    // Edit record
    this.app.get(basePath + '/edit/:id', async (req, res) => {
      // Implementation will be added  
      res.send('Edit record implementation');
    });

    // New record
    this.app.get(basePath + '/new', async (req, res) => {
      // Implementation will be added
      res.send('New record implementation'); 
    });

    // Duplicate record
    this.app.get(basePath + '/duplicate/:id', async (req, res) => {
      // Implementation will be added
      res.send('Duplicate record implementation');
    });

    // POST routes for save/delete operations
    // Will be implemented in next iteration
  }

  // Handle table list with pagination and filters
  async _handleTableList(req, res, table) {
    const columns = await this._getColumns(table);
    const tableConfig = this.config.getTableConfig(table);
    
    // Basic implementation - will be enhanced
    const sql = `SELECT * FROM \`${table}\` LIMIT 50`;
    const [rows] = await this.connection.query(sql);
    
    res.send(this._pageWrap(`Table: ${table} with ${rows.length} records`, table));
  }

  // Helper methods
  async _getTables() {
    const [tables] = await this.connection.query('SHOW TABLES');
    return tables.map(row => Object.values(row)[0]);
  }

  async _getColumns(table) {
    const [columns] = await this.connection.query(`SHOW COLUMNS FROM \`${table}\``);
    return columns;
  }

  _pageWrap(content, title = '', backUrl = '') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title ? title + ' - CrudUI' : 'CrudUI'}</title>
        <style>${this.CSS}</style>
      </head>
      <body>
        <div class="container">
          ${backUrl ? `<a href="${backUrl}" class="back-btn">&#8592; Back</a>` : ''}
          ${title ? `<h1>${this._escapeHtml(title)}</h1>` : ''}
          ${content}
        </div>
        <script>${this.clientJS}</script>
      </body>
      </html>
    `;
  }

  _escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Get the Express app
  getApp() {
    return this.app;
  }

  // Start the server (optional convenience method)
  listen(port = 3000, callback) {
    return this.app.listen(port, callback);
  }
}

// Export the main class and create function
module.exports = CrudUI;
module.exports.create = (config) => new CrudUI(config);