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

  // Setup routes for custom SQL tables
  async _setupCustomTableRoutes(tableConfig) {
    const basePath = this.config.rootPath + '/' + tableConfig.name;

    // List view for custom SQL table
    this.app.get(basePath, async (req, res) => {
      try {
        // Custom SQL tables are read-only, so we only implement the list view
        let search = req.query.search || '';
        let page = parseInt(req.query.page) || 1;
        let sortOrderRaw = req.query.sort || '';
        let visibleParam = req.query.visible || '';

        // Build wrapped SQL
        let sql = `SELECT * FROM (${tableConfig.customSql}) AS custom_table`;
        let countSql = `SELECT COUNT(*) as total FROM (${tableConfig.customSql}) AS custom_table`;
        
        const params = [];
        const countParams = [];

        // For custom SQL, we need to get columns first
        const [sampleRows] = await this.connection.query(`${sql} LIMIT 1`);
        const columns = sampleRows.length ? Object.keys(sampleRows[0]).map(field => ({ Field: field, Type: 'varchar(255)' })) : [];

        // Add search if provided
        if (search && columns.length) {
          const searchCondition = ' WHERE ' + columns.map(col => `\`${col.Field}\` LIKE ?`).join(' OR ');
          sql += searchCondition;
          countSql += searchCondition;
          const searchParams = columns.map(() => `%${search}%`);
          params.push(...searchParams);
          countParams.push(...searchParams);
        }

        // Parse and add sorting
        let sortOrder = [];
        if (sortOrderRaw) {
          const toks = sortOrderRaw.split(',');
          for (let i = 0; i < toks.length; i += 2) {
            const col = toks[i];
            const dir = toks[i + 1] || 'asc';
            if (columns.find(c => c.Field === col)) sortOrder.push({ col, dir });
          }
        }
        
        if (sortOrder.length) {
          sql += ' ORDER BY ' + sortOrder.map(x => `\`${x.col}\` ${x.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ');
        }

        // Handle CSV export
        if (req.query.csv === '1') {
          const [rows] = await this.connection.query(sql, params);
          return this._handleCsvExport(res, rows, columns, visibleParam, tableConfig.name);
        }

        // Get total count
        const [countResult] = await this.connection.query(countSql, countParams);
        const totalRecords = countResult[0].total;

        // Add pagination
        const pageSize = tableConfig.pagination?.pageSize || 50;
        const offset = (page - 1) * pageSize;
        sql += ` LIMIT ${pageSize} OFFSET ${offset}`;

        // Get rows
        const [rows] = await this.connection.query(sql, params);
        rows.search = search;

        // Calculate pagination info
        const totalPages = Math.ceil(totalRecords / pageSize);
        const paginationInfo = {
          currentPage: page,
          totalPages,
          totalRecords,
          hasNext: page < totalPages,
          hasPrev: page > 1,
          startRecord: offset + 1,
          endRecord: Math.min(offset + pageSize, totalRecords)
        };

        // Generate custom table HTML (read-only)
        const tableHtml = this._generateCustomTable(columns, rows, tableConfig.name, sortOrder, visibleParam, paginationInfo, tableConfig);
        res.send(this._pageWrap(tableHtml, tableConfig.displayName || tableConfig.name, this.config.rootPath + '/'));
        
      } catch (err) {
        res.status(500).send(this._pageWrap(`Error: ${err.message}`, 'Error'));
      }
    });
  }

  // Generate table for custom SQL (read-only)
  _generateCustomTable(columns, rows, tableName, sortOrder = [], visibleParam = '', paginationInfo = null, tableConfig = {}) {
    const visibleSet = visibleParam ? visibleParam.split(',') : columns.map(c => c.Field);

    // Build columns checkbox list
    let colsCheckboxes = columns.map(c => {
      const checked = visibleSet.includes(c.Field) ? 'checked' : '';
      return `<label><input type="checkbox" class="col-checkbox" value="${c.Field}" ${checked}/> ${this._escapeHtml(c.Field)}</label>`;
    }).join('');

    const sortAttr = sortOrder.map(s => `${s.col},${s.dir}`).join(',');
    const searchVal = rows.search || '';

    let html = `
      <div class="controls-row">
        <div class="controls-left">      
          <div class="columns-dropdown" id="columns-dropdown">
            <button type="button" onclick="toggleColumnsDropdown(this)" class="btn edit-btn">Columns</button>
            <div class="panel">
              ${colsCheckboxes}
            </div>
          </div>
          <button type="button" class="btn csv-btn" onclick="exportCSV('${tableName}')">Export CSV</button>
          <span class="info-badge">Custom SQL - Read Only</span>
        </div>
        <div class="controls-right">
          <input id="search-box" class="search-input" data-table="${tableName}" data-cols="${columns.length}" placeholder="Search..." value="${this._escapeHtml(searchVal)}"/>
        </div>
      </div>
    `;

    // Add pagination info
    if (paginationInfo && paginationInfo.totalRecords > 0) {
      html += this._generatePaginationInfo(paginationInfo);
    }

    html += `
      <div class="table-wrapper" id="table-root" data-sort="${sortAttr}">
        <table>
          <thead><tr>
    `;

    // Headers for custom table
    columns.forEach(col => {
      const idxSort = sortOrder.findIndex(s => s.col === col.Field);
      const cls = idxSort >= 0 ? (sortOrder[idxSort].dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
      html += `<th data-col="${col.Field}" class="${cls}" onclick="headerSort('${tableName}','${col.Field}', event.shiftKey)">${this._escapeHtml(col.Field)}</th>`;
    });

    html += `</tr></thead><tbody>`;

    // Table rows (read-only)
    rows.forEach(row => {
      html += `<tr class="table-row">`;

      columns.forEach(col => {
        const value = row[col.Field];
        html += `<td data-col="${col.Field}">
          ${this._renderView(col, value, row, null, tableName, {})}
        </td>`;
      });

      html += `</tr>`;
    });

    html += `</tbody></table></div>`;

    // Add pagination controls
    if (paginationInfo && paginationInfo.totalPages > 1) {
      html += this._generatePagination(paginationInfo, tableName, { search: searchVal, sort: sortOrder, visible: visibleParam });
    }

    return html;
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
      try {
        const columns = await this._getColumns(table);
        const [rows] = await this.connection.query(
          `SELECT * FROM \`${table}\` WHERE \`${columns[0].Field}\` = ?`,
          [req.params.id]
        );
        
        if (!rows.length) {
          return res.status(404).send(this._pageWrap('Record not found', 'Error'));
        }
        
        const viewHtml = this._generateViewEditForm(columns, rows[0], table, req.params.id);
        res.send(this._pageWrap(viewHtml, `View ${table}`, basePath));
      } catch (err) {
        res.status(500).send(this._pageWrap(`Error: ${err.message}`, 'Error'));
      }
    });

    // Edit record
    this.app.get(basePath + '/edit/:id', async (req, res) => {
      try {
        const columns = await this._getColumns(table);
        const [rows] = await this.connection.query(
          `SELECT * FROM \`${table}\` WHERE \`${columns[0].Field}\` = ?`,
          [req.params.id]
        );
        
        if (!rows.length) {
          return res.status(404).send(this._pageWrap('Record not found', 'Error'));
        }
        
        const editHtml = this._generateForm(columns, rows[0], table, 'edit');
        res.send(this._pageWrap(editHtml, `Edit ${table}`, basePath));
      } catch (err) {
        res.status(500).send(this._pageWrap(`Error: ${err.message}`, 'Error'));
      }
    });

    // New record
    this.app.get(basePath + '/new', async (req, res) => {
      try {
        const columns = await this._getColumns(table);
        const newHtml = this._generateForm(columns, {}, table, 'new');
        res.send(this._pageWrap(newHtml, `New ${table}`, basePath));
      } catch (err) {
        res.status(500).send(this._pageWrap(`Error: ${err.message}`, 'Error'));
      }
    });

    // Duplicate record
    this.app.get(basePath + '/duplicate/:id', async (req, res) => {
      try {
        const columns = await this._getColumns(table);
        const [rows] = await this.connection.query(
          `SELECT * FROM \`${table}\` WHERE \`${columns[0].Field}\` = ?`,
          [req.params.id]
        );
        
        if (!rows.length) {
          return res.status(404).send(this._pageWrap('Record not found', 'Error'));
        }
        
        // Remove primary key for duplication
        const duplicateData = { ...rows[0] };
        delete duplicateData[columns[0].Field];
        
        const duplicateHtml = this._generateForm(columns, duplicateData, table, 'new');
        res.send(this._pageWrap(duplicateHtml, `Duplicate ${table}`, basePath));
      } catch (err) {
        res.status(500).send(this._pageWrap(`Error: ${err.message}`, 'Error'));
      }
    });

    // POST routes for save/delete operations
    
    // Create new record
    this.app.post(basePath + '/new', async (req, res) => {
      try {
        const columns = await this._getColumns(table);
        const fields = columns.map(c => c.Field).filter(f => f !== columns[0].Field);
        const values = fields.map(f => req.body[f] || null);
        
        await this.connection.query(
          `INSERT INTO \`${table}\` (${fields.map(f => `\`${f}\``).join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
          values
        );
        
        res.redirect(basePath);
      } catch (err) {
        const columns = await this._getColumns(table);
        const errorHtml = this._generateForm(columns, req.body, table, 'new', err.message);
        res.send(this._pageWrap(errorHtml, `New ${table}`, basePath));
      }
    });

    // Update record (from edit page)
    this.app.post(basePath + '/edit/:id', async (req, res) => {
      try {
        const columns = await this._getColumns(table);
        const fields = columns.map(c => c.Field).filter(f => f !== columns[0].Field);
        const values = fields.map(f => req.body[f] || null);
        
        await this.connection.query(
          `UPDATE \`${table}\` SET ${fields.map(f => `\`${f}\`=?`).join(',')} WHERE \`${columns[0].Field}\`=?`,
          [...values, req.params.id]
        );
        
        // Check if we should return to view or edit page
        const returnTo = req.body._returnTo === 'view' ? `/view/${req.params.id}` : '';
        res.redirect(basePath + returnTo);
      } catch (err) {
        const columns = await this._getColumns(table);
        const [rows] = await this.connection.query(
          `SELECT * FROM \`${table}\` WHERE \`${columns[0].Field}\` = ?`,
          [req.params.id]
        );
        const errorHtml = this._generateForm(columns, { ...rows[0], ...req.body }, table, 'edit', err.message);
        res.send(this._pageWrap(errorHtml, `Edit ${table}`, basePath));
      }
    });

    // Update record (from view page)
    this.app.post(basePath + '/view/:id', async (req, res) => {
      req.body._returnTo = 'view';
      // Redirect to edit POST handler
      return this.app._router.handle({
        ...req,
        method: 'POST',
        url: basePath + '/edit/' + req.params.id
      }, res);
    });

    // Inline update
    this.app.post(basePath + '/inline/:id', async (req, res) => {
      try {
        const columns = await this._getColumns(table);
        const pk = columns[0].Field;
        const field = req.body.field;
        const value = req.body.value;
        
        // Validate field exists
        if (!columns.find(c => c.Field === field)) {
          return res.status(400).send('Invalid field');
        }
        
        await this.connection.query(
          `UPDATE \`${table}\` SET \`${field}\`=? WHERE \`${pk}\`=?`,
          [value, req.params.id]
        );
        
        res.redirect(basePath);
      } catch (err) {
        res.status(500).send(`Error: ${err.message}`);
      }
    });

    // Delete record
    this.app.post(basePath + '/delete/:id', async (req, res) => {
      try {
        const columns = await this._getColumns(table);
        await this.connection.query(`DELETE FROM \`${table}\` WHERE \`${columns[0].Field}\`=?`, [req.params.id]);
        res.redirect(basePath);
      } catch (err) {
        res.status(500).send(this._pageWrap(`Error deleting record: ${err.message}`, 'Error'));
      }
    });
  }

  // Generate edit/new form
  _generateForm(columns, row = {}, table, mode = 'new', error = '') {
    const tableConfig = this.config.getTableConfig(table);
    
    let html = `<div class="form-wrapper">`;
    
    if (error) {
      html += `<div class="error-message">${this._escapeHtml(error)}</div>`;
    }
    
    html += `<form method="POST">`;
    
    columns.forEach(col => {
      const columnConfig = this.config.getColumnConfig(table, col.Field);
      const value = row[col.Field] == null ? '' : String(row[col.Field]);
      const label = columnConfig.displayName || col.Field;
      const isPrimaryKey = col.Key === 'PRI';
      const isReadonly = isPrimaryKey && mode === 'edit';
      
      html += `<label>${this._escapeHtml(label)}</label>`;
      
      if (columnConfig.customRenderEdit && typeof columnConfig.customRenderEdit === 'function') {
        html += columnConfig.customRenderEdit(value, row, col);
      } else {
        const inputType = this._getInputType(col, columnConfig);
        html += `<input type="${inputType}" name="${col.Field}" value="${this._escapeHtml(value)}" ${isReadonly ? 'readonly' : ''}/>`;
      }
    });
    
    html += `<div class="form-actions">
      <input type="submit" value="Save" class="btn btn-primary"/>
      <a href="${this.config.rootPath}/${table}" class="btn back-btn">Cancel</a>
    </div>`;
    
    html += `</form></div>`;
    return html;
  }

  // Generate view/edit form with toggle button
  _generateViewEditForm(columns, row = {}, table, id) {
    const tableConfig = this.config.getTableConfig(table);
    
    let html = `<div class="form-wrapper">
      <form method="POST" id="view-edit-form" action="${this.config.rootPath}/${table}/view/${id}">`;
    
    columns.forEach(col => {
      const columnConfig = this.config.getColumnConfig(table, col.Field);
      const value = row[col.Field] == null ? '' : String(row[col.Field]);
      const label = columnConfig.displayName || col.Field;
      const isPrimaryKey = col.Key === 'PRI';
      
      html += `<label>${this._escapeHtml(label)}</label>`;
      
      if (columnConfig.customRenderView && typeof columnConfig.customRenderView === 'function') {
        html += `<div class="view-field">${columnConfig.customRenderView(value, row, col)}</div>`;
      } else {
        const displayValue = this._formatViewValue(value, col, columnConfig);
        const inputType = this._getInputType(col, columnConfig);
        html += `<input type="${inputType}" name="${col.Field}" value="${this._escapeHtml(value)}" readonly class="view-input"/>`;
      }
    });
    
    html += `<div class="view-form-actions">
      <button type="button" id="view-edit-toggle-btn" onclick="toggleViewEdit()" class="btn edit-btn">Edit</button>
      <input type="submit" id="view-edit-save-btn" value="Save" style="display:none;" class="btn btn-primary"/>`;
    
    if (tableConfig.duplicate) {
      html += `<button type="button" onclick="window.location.href='${this.config.rootPath}/${table}/duplicate/${id}'" class="btn view-btn">Duplicate</button>`;
    }
    
    html += `<a href="${this.config.rootPath}/${table}" class="btn back-btn">Back</a>
    </div></form></div>`;
    
    return html;
  }

  // Get appropriate input type for column
  _getInputType(col, columnConfig) {
    if (columnConfig.dateColumn || this._isDateColumn(col)) {
      if (col.Type.toLowerCase().includes('datetime') || col.Type.toLowerCase().includes('timestamp')) {
        return 'datetime-local';
      }
      if (col.Type.toLowerCase().includes('time')) {
        return 'time';
      }
      return 'date';
    }
    
    if (col.Type.toLowerCase().includes('int') || col.Type.toLowerCase().includes('decimal') || col.Type.toLowerCase().includes('float')) {
      return 'number';
    }
    
    if (col.Type.toLowerCase().includes('email')) {
      return 'email';
    }
    
    if (col.Field.toLowerCase().includes('password')) {
      return 'password';
    }
    
    return 'text';
  }

  // Format value for view display
  _formatViewValue(value, col, columnConfig) {
    if (columnConfig.dateColumn || this._isDateColumn(col)) {
      if (value && value !== '0000-00-00' && value !== '0000-00-00 00:00:00') {
        try {
          const date = new Date(value);
          return date.toLocaleDateString();
        } catch (e) {
          return value;
        }
      }
    }
    
    return value;
  }

  // Handle table list with pagination and filters
  async _handleTableList(req, res, table) {
    const columns = await this._getColumns(table);
    const tableConfig = this.config.getTableConfig(table);
    
    // Parse parameters
    let search = req.query.search || '';
    let page = parseInt(req.query.page) || 1;
    let sortOrderRaw = req.query.sort || '';
    let visibleParam = req.query.visible || '';
    
    // Multi-column sort parsing (pairwise col,dir)
    let sortOrder = [];
    if (sortOrderRaw) {
      const toks = sortOrderRaw.split(',');
      for (let i = 0; i < toks.length; i += 2) {
        const col = toks[i];
        const dir = toks[i + 1] || 'asc';
        if (columns.find(c => c.Field === col)) sortOrder.push({ col, dir });
      }
    }
    
    // Build SQL with pagination
    let sql, countSql;
    const params = [];
    const countParams = [];
    
    if (tableConfig.customSql) {
      // For custom SQL tables
      sql = `SELECT * FROM (${tableConfig.customSql}) AS custom_table`;
      countSql = `SELECT COUNT(*) as total FROM (${tableConfig.customSql}) AS custom_table`;
    } else {
      // For regular database tables
      sql = `SELECT * FROM \`${table}\``;
      countSql = `SELECT COUNT(*) as total FROM \`${table}\``;
    }
    
    // Add search conditions
    if (search) {
      const searchCondition = ' WHERE ' + columns.map(col => `\`${col.Field}\` LIKE ?`).join(' OR ');
      sql += searchCondition;
      countSql += searchCondition;
      const searchParams = columns.map(() => `%${search}%`);
      params.push(...searchParams);
      countParams.push(...searchParams);
    }
    
    // Add sorting
    if (sortOrder.length) {
      sql += ' ORDER BY ' + sortOrder.map(x => `\`${x.col}\` ${x.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ');
    }
    
    // Handle CSV export
    if (req.query.csv === '1') {
      const [rows] = await this.connection.query(sql, params);
      return this._handleCsvExport(res, rows, columns, visibleParam, table);
    }
    
    // Get total count for pagination
    const [countResult] = await this.connection.query(countSql, countParams);
    const totalRecords = countResult[0].total;
    
    // Add pagination
    const pageSize = tableConfig.pagination.pageSize || 50;
    const offset = (page - 1) * pageSize;
    sql += ` LIMIT ${pageSize} OFFSET ${offset}`;
    
    // Get rows for page rendering
    const [rows] = await this.connection.query(sql, params);
    rows.search = search; // keep search value for client
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalRecords / pageSize);
    const paginationInfo = {
      currentPage: page,
      totalPages,
      totalRecords,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      startRecord: offset + 1,
      endRecord: Math.min(offset + pageSize, totalRecords)
    };
    
    const tableHtml = this._generateTable(columns, rows, table, sortOrder, visibleParam, paginationInfo, tableConfig);
    res.send(this._pageWrap(tableHtml, table, this.config.rootPath + '/'));
  }

  // Handle CSV export
  _handleCsvExport(res, rows, columns, visibleParam, table) {
    const visibleList = visibleParam ? visibleParam.split(',').filter(v => columns.find(c => c.Field === v)) : null;
    const outCols = visibleList && visibleList.length ? columns.filter(c => visibleList.includes(c.Field)) : columns;
    
    let csv = outCols.map(c => c.Field).join(',') + '\n';
    rows.forEach(row => {
      csv += outCols.map(c => this._escapeCSV(row[c.Field])).join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
    return res.send(csv);
  }

  // Escape CSV values safely
  _escapeCSV(val) {
    if (val == null) return '';
    val = String(val);
    if (val.includes('"') || val.includes(',') || val.includes('\n')) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }

  // Generate enhanced table with modern features
  _generateTable(columns, rows, table, sortOrder = [], visibleParam = '', paginationInfo = null, tableConfig = {}) {
    // Always keep action columns visible by default
    const visibleSet = visibleParam ? visibleParam.split(',') : columns.map(c => c.Field);
    if (!visibleSet.includes('__actions__')) visibleSet.push('__actions__');
    if (!visibleSet.includes('__editdelete__')) visibleSet.push('__editdelete__');

    // Build columns checkbox list (for dropdown) - only real data columns
    let colsCheckboxes = columns.map(c => {
      const checked = visibleSet.includes(c.Field) ? 'checked' : '';
      const columnConfig = this.config.getColumnConfig(table, c.Field);
      const label = columnConfig.displayName || c.Field;
      return `<label><input type="checkbox" class="col-checkbox" value="${c.Field}" ${checked}/> ${this._escapeHtml(label)}</label>`;
    }).join('');

    // Mark current sort order as data-sort attribute (pairwise col,dir)
    const sortAttr = sortOrder.map(s => `${s.col},${s.dir}`).join(',');
    
    // Search value is attached to rows.search by server
    const searchVal = rows.search || '';

    // Advanced features HTML
    let advancedFeaturesHtml = '';
    if (tableConfig.advancedSearch) {
      advancedFeaturesHtml += `<button type="button" class="btn edit-btn" onclick="showAdvancedSearch()">Advanced Search</button>`;
    }
    if (tableConfig.dateFilters) {
      advancedFeaturesHtml += this._generateDateFilters(columns);
    }

    // Controls row HTML
    let html = `
      <div class="controls-row">
        <div class="controls-left">      
          <div class="columns-dropdown" id="columns-dropdown">
            <button type="button" onclick="toggleColumnsDropdown(this)" class="btn edit-btn">Columns</button>
            <div class="panel">
              ${colsCheckboxes}
            </div>
          </div>
          <button type="button" class="btn csv-btn" onclick="exportCSV('${table}')">Export CSV</button>
          <button type="button" class="btn toggle-inline-btn edit-btn" onclick="toggleInlineEdit(this)">Inline Edit</button>
          <button type="button" class="btn save-inline-btn edit-btn" onclick="saveChanges(this)" style="display:none;">Save Changes</button>
          ${advancedFeaturesHtml}
        </div>
        <div class="controls-right">
          <input id="search-box" class="search-input" data-table="${table}" data-cols="${columns.length}" placeholder="Search..." value="${this._escapeHtml(searchVal)}"/>
          <button type="button" class="btn edit-btn" onclick="window.location.href='${this.config.rootPath}/${table}/new'">New</button>      
        </div>
      </div>
    `;

    // Add pagination info
    if (paginationInfo && paginationInfo.totalRecords > 0) {
      html += this._generatePaginationInfo(paginationInfo);
    }

    // Table wrapper
    html += `
      <div class="table-wrapper" id="table-root" data-sort="${sortAttr}">
        <table>
          <thead><tr>
    `;

    // Table headers
    html += `<th data-col="__actions__" style="width:84px;">View</th>`;

    columns.forEach(col => {
      const columnConfig = this.config.getColumnConfig(table, col.Field);
      const idxSort = sortOrder.findIndex(s => s.col === col.Field);
      const cls = idxSort >= 0 ? (sortOrder[idxSort].dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
      const label = columnConfig.displayName || col.Field;
      const clickable = columnConfig.sortable ? `onclick="headerSort('${table}','${col.Field}', event.shiftKey)"` : '';
      html += `<th data-col="${col.Field}" class="${cls}" ${clickable}>${this._escapeHtml(label)}</th>`;
    });

    html += `<th data-col="__editdelete__" style="width:200px;">Actions</th></tr></thead><tbody>`;

    // Table rows
    rows.forEach(row => {
      html += `<tr class="table-row">`;
      const pk = columns[0].Field;
      const id = row[pk];

      // View button cell
      html += `<td data-col="__actions__">
        <form method="GET" action="${this.config.rootPath}/${table}/view/${encodeURIComponent(id)}" style="display:inline;">
          <button type="submit" class="btn view-btn">View</button>
        </form>
      </td>`;

      // Data columns
      columns.forEach(col => {
        const columnConfig = this.config.getColumnConfig(table, col.Field);
        const value = row[col.Field];
        
        html += `<td class="grid-cell" data-col="${col.Field}">
          <div class="old_value" style="display:none;">${value || ''}</div>
          <div class="grid-view">
            ${this._renderView(col, value, row, id, table, columnConfig)}
          </div>
          <div class="grid-edit" style="display:none;">
            ${this._renderEdit(col, value, row, id, table, columnConfig)}
          </div>
        </td>`;
      });

      // Actions cell
      html += `<td data-col="__editdelete__" class="actions">
        <form method="GET" action="${this.config.rootPath}/${table}/edit/${encodeURIComponent(id)}" style="display:inline;">
          <button type="submit" class="btn edit-btn">Edit</button>
        </form>`;
      
      if (tableConfig.duplicate) {
        html += `<form method="GET" action="${this.config.rootPath}/${table}/duplicate/${encodeURIComponent(id)}" style="display:inline;">
          <button type="submit" class="btn view-btn">Duplicate</button>
        </form>`;
      }
      
      html += `<form method="POST" action="${this.config.rootPath}/${table}/delete/${encodeURIComponent(id)}" style="display:inline;" onsubmit="return confirm('Are you sure?')">
        <button type="submit" class="btn delete-btn">Delete</button>
      </form></td>`;

      html += `</tr>`;
    });

    html += `</tbody></table></div>`;

    // Add pagination controls
    if (paginationInfo && paginationInfo.totalPages > 1) {
      html += this._generatePagination(paginationInfo, table, { search: searchVal, sort: sortOrder, visible: visibleParam });
    }

    return html;
  }

  // Generate pagination info
  _generatePaginationInfo(paginationInfo) {
    return `
      <div class="pagination-info">
        Showing ${paginationInfo.startRecord}-${paginationInfo.endRecord} of ${paginationInfo.totalRecords} records
      </div>
    `;
  }

  // Generate pagination controls
  _generatePagination(paginationInfo, table, params) {
    const { currentPage, totalPages, hasPrev, hasNext } = paginationInfo;
    
    let html = '<div class="pagination">';
    
    // Previous button
    if (hasPrev) {
      const prevUrl = this._buildPaginationUrl(table, currentPage - 1, params);
      html += `<a href="${prevUrl}" class="btn pagination-btn">Previous</a>`;
    }
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
      const firstUrl = this._buildPaginationUrl(table, 1, params);
      html += `<a href="${firstUrl}" class="btn pagination-btn">1</a>`;
      if (startPage > 2) html += '<span class="pagination-dots">...</span>';
    }
    
    for (let i = startPage; i <= endPage; i++) {
      if (i === currentPage) {
        html += `<span class="btn pagination-btn active">${i}</span>`;
      } else {
        const pageUrl = this._buildPaginationUrl(table, i, params);
        html += `<a href="${pageUrl}" class="btn pagination-btn">${i}</a>`;
      }
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += '<span class="pagination-dots">...</span>';
      const lastUrl = this._buildPaginationUrl(table, totalPages, params);
      html += `<a href="${lastUrl}" class="btn pagination-btn">${totalPages}</a>`;
    }
    
    // Next button
    if (hasNext) {
      const nextUrl = this._buildPaginationUrl(table, currentPage + 1, params);
      html += `<a href="${nextUrl}" class="btn pagination-btn">Next</a>`;
    }
    
    html += '</div>';
    return html;
  }

  // Build pagination URL with parameters
  _buildPaginationUrl(table, page, params) {
    let url = `${this.config.rootPath}/${table}?page=${page}`;
    if (params.search) url += `&search=${encodeURIComponent(params.search)}`;
    if (params.sort && params.sort.length) {
      const sortParam = params.sort.map(x => x.col + ',' + x.dir).join(',');
      url += `&sort=${encodeURIComponent(sortParam)}`;
    }
    if (params.visible) url += `&visible=${encodeURIComponent(params.visible)}`;
    return url;
  }

  // Generate date filters
  _generateDateFilters(columns) {
    const dateColumns = columns.filter(col => this._isDateColumn(col));
    if (!dateColumns.length) return '';
    
    let html = '<div class="date-filters" style="display:none;">';
    html += '<label>Date Filter:</label>';
    
    if (dateColumns.length > 1) {
      html += '<select id="date-column-select">';
      dateColumns.forEach(col => {
        html += `<option value="${col.Field}">${col.Field}</option>`;
      });
      html += '</select>';
    }
    
    html += '<input type="date" id="date-from" placeholder="From">';
    html += '<input type="date" id="date-to" placeholder="To">';
    html += '<button type="button" onclick="applyDateFilter()">Apply</button>';
    html += '</div>';
    
    return html;
  }

  // Check if column is a date column
  _isDateColumn(col) {
    return col.Type.toLowerCase().includes('date') || 
           col.Type.toLowerCase().includes('time') ||
           col.Type.toLowerCase().includes('timestamp');
  }

  // Render view with custom renderer support
  _renderView(col, value, row, rowId, table, columnConfig) {
    if (columnConfig.customRenderView && typeof columnConfig.customRenderView === 'function') {
      return columnConfig.customRenderView(value, row, col);
    }
    
    let v = value == null ? '' : String(value);
    
    // Date formatting
    if (columnConfig.dateColumn || this._isDateColumn(col)) {
      if (v && v !== '0000-00-00' && v !== '0000-00-00 00:00:00') {
        try {
          const date = new Date(v);
          v = date.toLocaleDateString();
        } catch (e) {
          // Keep original value if parsing fails
        }
      }
    }
    
    return `<span class="grid-view">${v.length > 350 ? v.substring(0, 350) + '…' : v}</span>`;
  }

  // Render edit with custom renderer support
  _renderEdit(col, value, row, rowId, table, columnConfig) {
    if (columnConfig.customRenderEdit && typeof columnConfig.customRenderEdit === 'function') {
      return columnConfig.customRenderEdit(value, row, col);
    }
    
    let v = value == null ? '' : String(value);
    return `<form method="POST" action="${this.config.rootPath}/${table}/inline/${rowId}" style="margin:0;display:inline;">
      <input class="column-name" type="hidden" name="field" value="${col.Field}"/>
      <input type="text" name="value" value="${this._escapeHtml(v)}" class="edit-input" />          
    </form>`;
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