// Updated index.js — fixes for invisible Columns dropdown (panel clipped/hidden)
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { table } = require('console');
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));

// Load DB_CONFIG from dbconfig.json
const configPath = path.join(__dirname, 'dbconfig.json');
let DB_CONFIG;
try {
  DB_CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error('Error loading dbconfig.json:', err);
  process.exit(1);
}

const cssPath = path.join(__dirname, 'style.css');
let CSS;
try {
  CSS = fs.readFileSync(cssPath, 'utf8');
} catch (err) {
  console.error('Error loading style.css:', err);
  process.exit(1);
}

const jsPath = path.join(__dirname, 'client.js');
let clientJS
try {
  clientJS = fs.readFileSync(jsPath, 'utf8');
} catch (err) {
  console.error('Error loading client.js:', err);
  process.exit(1);
}

// CSS + JS: flexible layout, fixed header alignment, wider columns dropdown, action columns always visible
// -- FIXES ADDED:
// 1) Make container overflow visible so absolutely-positioned dropdown isn't clipped.
// 2) Stronger panel styling (background, color, box-shadow, z-index, min-width).
// 3) Ensure checkbox inputs don't stretch and labels use normal wrapping.
// 4) Table min-width reduced to 600px so horizontal scrollbar appears sooner (before columns get too narrow).
// 5) Action columns (__actions__, __editdelete__) always included in visible columns to prevent disappearing buttons.

// helper DB functions
async function getTables(connection) {
  const [tables] = await connection.query('SHOW TABLES');
  return tables.map(row => Object.values(row)[0]);
}
async function getColumns(connection, table) {
  const [columns] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
  return columns;
}

// helper: escape CSV values safely
function escapeCSV(val) {
  if (val == null) return '';
  val = String(val);
  if (val.includes('"') || val.includes(',') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

// page wrapper
function pageWrap(content, title = '', backUrl = '') {
  return `
  <style>${CSS}</style>
  <script>${clientJS}</script>
  <div class="container">
  ${backUrl ? `<a href="${backUrl}" class="back-btn">&#8592; Back</a>` : ''}
    ${title ? `<h1>${title}</h1>` : ''}
    ${content}
  </div>`;
}

// generate edit/new form (keeps layout flexible)
function generateForm(columns, row = {}) {
  let html = `<div class="form-wrapper"><form method="POST">`;
  columns.forEach(col => {
    html += `<label>${col.Field}</label>
      <input type="text" name="${col.Field}" value="${row[col.Field] == null ? '' : String(row[col.Field])}" ${col.Key === 'PRI' ? 'readonly' : ''}/>`;
  });
  html += `<div style="margin-top:8px;"><input type="submit" value="Save" class="edit-btn"/> <a href="/" class="back-btn">Back</a></div>`;
  html += `</form></div>`;
  return html;
}

// generate view/edit form with toggle button (initially readonly)
function generateViewEditForm(columns, row = {}, table, id) {
  let html = `<div class="form-wrapper"><form method="POST" id="view-edit-form" action="/${table}/edit/${id}">`;
  columns.forEach(col => {
    const v = row[col.Field] == null ? '' : String(row[col.Field]);
    html += `<label>${col.Field}</label>
      <input type="text" name="${col.Field}" value="${v}" ${col.Key === 'PRI' ? 'readonly' : 'readonly'}/>`;
  });
  html += `<div class="view-form-actions">
    <button type="button" id="view-edit-toggle-btn" onClick="view_edit_toggle()" >Edit</button>
    <input type="submit" id="view-edit-save-btn" value="Save" style="display:none;" class="edit-btn"/>
    <button type="button" id="duplicate-btn" onClick="duplicate()" >Duplicate</button>
    <a href="/${table}" class="back-btn">Back</a>
  </div>`;
  html += `</form></div>`;
  return html;
}



// helper to escape HTML content in strings
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeHtmlAttr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// generate table: includes columns dropdown, checkboxes, visible handling and data-col attributes
function generateTable(columns, rows, table, sortOrder = [], visibleParam = '') {
  // visibleParam is a comma-separated string indicating which columns should be visible by default
  // Always keep action columns visible by default
  const visibleSet = visibleParam ? visibleParam.split(',') : columns.map(c => c.Field);
  // ensure action columns present so buttons don't disappear
  if (!visibleSet.includes('__actions__')) visibleSet.push('__actions__');
  if (!visibleSet.includes('__editdelete__')) visibleSet.push('__editdelete__');

  // Build columns checkbox list (for dropdown) - only real data columns
  let colsCheckboxes = columns.map(c => {
    const checked = visibleSet.includes(c.Field) ? 'checked' : '';
    return `<label><input type="checkbox" class="col-checkbox" value="${c.Field}" ${checked}/> ${escapeHtml(c.Field)}</label>`;
  }).join('');

  // mark current sort order as data-sort attribute (pairwise col,dir)
  const sortAttr = sortOrder.map(s => `${s.col},${s.dir}`).join(',');

  // search value is attached to rows.search by server
  const searchVal = rows.search || '';

  // table header row: left View actions, then data columns, then right Edit/Delete actions
  let html = `
  <div class="controls-row">
    <div class="controls-left">      
      <div class="columns-dropdown" id="columns-dropdown">
        <button type="button" onclick="toggleColumnsDropdown(this)" class="edit-btn">Columns</button>
        <div class="panel">
          ${colsCheckboxes}
        </div>
      </div>
      <button type="button" class="csv-btn" onclick="exportCSV('${table}')">Export CSV</button>
    <button type="button" class="toggle-inline-btn edit-btn" onclick="toggleInlineEdit(this)">Inline Edit</button>
    <button type="button" class="save-inline-btn edit-btn" onclick="saveChanges(this)">Save Changes</button>
    </div>
    <div class="controls-right">
      <input id="search-box" class="search-input" data-table="${table}" data-cols="${columns.length}" placeholder="Search..." value="${escapeHtml(searchVal)}"/>
      <button type="button" class="edit-btn" onclick="window.location.href='/${table}/new'">New</button>      
    </div>
  </div>

  <div class="table-wrapper" id="table-root" data-sort="${sortAttr}">
    <table>
      <thead><tr>`;

  // leftmost header for View button
  html += `<th data-col="__actions__" style="width:84px;">View</th>`;

  columns.forEach(col => {
    const idxSort = sortOrder.findIndex(s => s.col === col.Field);
    const cls = idxSort >= 0 ? (sortOrder[idxSort].dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    html += `<th data-col="${col.Field}" class="${cls}" onclick="headerSort('${table}','${col.Field}', event.shiftKey)">${escapeHtml(col.Field)}</th>`;
  });

  // rightmost header for edit/delete buttons
  html += `<th data-col="__editdelete__" style="width:160px;">Actions</th>`;

  html += `</tr></thead><tbody>`;

  // table rows: each td has data-col attribute and data-full tooltip if content gets truncated
  rows.forEach(row => {
    html += `<tr class="table-row">`;
    let rowId = row[columns[0].Field];

    // View button cell (leftmost)
    const pk = columns[0].Field;
    const id = row[pk];

    html += `<td data-col="__actions__">
      <form method="GET" action="/${table}/view/${encodeURIComponent(id)}" style="display:inline;">
        <button type="submit" class="view-btn">View</button>
      </form>
    </td>`;



    columns.forEach(col => {
      html += `<td class="grid-cell" data-col="${col.Field}"}">
      <div class="old_value" style="display:none;">${row[col.Field]}</div>
      <div class="grid-view" >`;
      html += view_render(col,row[col.Field],row,rowId,table);
      html += '</div>';

      html += `<div class="grid-edit" style="display:none;">`;
      html += edit_render(col,row[col.Field],row,rowId,table);
      html += '</div></td>';
    });


    // trailing (edit/delete) actions cell
    html += `<td data-col="__editdelete__" class="actions">
      <form method="GET" action="/${table}/edit/${encodeURIComponent(id)}" style="display:inline;">
        <button type="submit" class="edit-btn">Edit</button>
      </form>
      <form method="POST" action="/${table}/delete/${encodeURIComponent(id)}" style="display:inline;">
        <button type="submit" class="delete-btn">Delete</button>
      </form>
    </td>`;

    html += `</tr>`;
  });

  html += `</tbody></table></div>`;


  return html;
}

function view_render(col, val) { 
  let v = val == null ? '' : val;
  return `<span  class=grid-view >${v.length > 350 ? v.substring(0, 350) + '…' : v}</span>`;
}
function edit_render(col, val, row,rowId,table) {
  let v = row[col.Field] == null ? '' : row[col.Field];
  return ` <form method="POST" action="/${table}/inline/${rowId}" style="margin:0;display:inline;">
          <input  class="colunm-name" type="hidden" name="field" value="${col.Field}"/>
          <input type="text" name="value" value="${v}" class="edit-input" />          
        </form>`;
}

(async () => {
  const connection = await mysql.createConnection(DB_CONFIG);
  const tables = await getTables(connection);

  tables.forEach(table => {
    app.get(`/${table}`, async (req, res) => {
      const columns = await getColumns(connection, table);

      // Search/filter (server-side) - used when pressing Enter / export / sorting
      let search = req.query.search || '';

      // Multi-column sort parsing (pairwise col,dir)
      let sortOrderRaw = req.query.sort || '';
      let sortOrder = [];
      if (sortOrderRaw) {
        const toks = sortOrderRaw.split(',');
        for (let i = 0; i < toks.length; i += 2) {
          const col = toks[i];
          const dir = toks[i + 1] || 'asc';
          if (columns.find(c => c.Field === col)) sortOrder.push({ col, dir });
        }
      }

      // visible columns (from URL) - used for CSV export and client initial state
      let visibleParam = req.query.visible || ''; // comma-separated list of Field names

      // build SQL
      let sql = `SELECT * FROM \`${table}\``;
      const params = [];
      if (search) {
        sql += ' WHERE ' + columns.map(col => `\`${col.Field}\` LIKE ?`).join(' OR ');
        params.push(...columns.map(() => `%${search}%`));
      }
      if (sortOrder.length) {
        sql += ' ORDER BY ' + sortOrder.map(x => `\`${x.col}\` ${x.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ');
      }

      // CSV export: if csv=1, return CSV using visibleParam (if provided) or all columns
      if (req.query.csv === '1') {
        const [rows] = await connection.query(sql, params);
        const visibleList = visibleParam ? visibleParam.split(',').filter(v => columns.find(c => c.Field === v)) : null;
        const outCols = visibleList && visibleList.length ? columns.filter(c => visibleList.includes(c.Field)) : columns;
        let csv = outCols.map(c => c.Field).join(',') + '\n';
        rows.forEach(row => {
          csv += outCols.map(c => escapeCSV(row[c.Field])).join(',') + '\n';
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
        return res.send(csv);
      }

      // Get rows for page rendering
      const [rows] = await connection.query(sql, params);
      rows.search = search; // keep search value for client
      // Render page; pass visibleParam so client checks checkboxes accordingly
      res.send(pageWrap(generateTable(columns, rows, table, sortOrder, visibleParam), table, '/'));
    });

    // New record form
    app.get(`/${table}/new`, async (req, res) => {
      const columns = await getColumns(connection, table);
      res.send(pageWrap(generateForm(columns), `New ${table}`, `/${table}`));
    });

    // Create
    app.post(`/${table}/new`, async (req, res) => {
      const columns = await getColumns(connection, table);
      const fields = columns.map(c => c.Field).filter(f => f !== columns[0].Field);
      const values = fields.map(f => req.body[f]);
      await connection.query(
        `INSERT INTO \`${table}\` (${fields.map(f => `\`${f}\``).join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
        values
      );
      res.redirect(`/${table}`);
    });

    // Edit form
    app.get(`/${table}/edit/:id`, async (req, res) => {
      const columns = await getColumns(connection, table);
      const [rows] = await connection.query(
        `SELECT * FROM \`${table}\` WHERE \`${columns[0].Field}\` = ?`,
        [req.params.id]
      );
      res.send(pageWrap(generateForm(columns, rows[0]), `Edit ${table}`, `/${table}`));
    });

    // View form with toggle edit
    app.get(`/${table}/view/:id`, async (req, res) => {
      const columns = await getColumns(connection, table);
      const [rows] = await connection.query(
        `SELECT * FROM \`${table}\` WHERE \`${columns[0].Field}\` = ?`,
        [req.params.id]
      );
      res.send(pageWrap(generateViewEditForm(columns, rows[0], table, req.params.id), `View ${table}`, `/${table}`));
    });

    // Save edit (from view or edit page)
    app.post(`/${table}/edit/:id`, async (req, res) => {
      const columns = await getColumns(connection, table);
      const fields = columns.map(c => c.Field).filter(f => f !== columns[0].Field);
      const values = fields.map(f => req.body[f]);
      await connection.query(
        `UPDATE \`${table}\` SET ${fields.map(f => `\`${f}\`=?`).join(',')} WHERE \`${columns[0].Field}\`=?`,
        [...values, req.params.id]
      );
      // Stay on view page after save
      res.redirect(`/${table}/view/${req.params.id}`);
    });

    // Inline update (from inline edit)
    app.post(`/${table}/inline/:id`, async (req, res) => {
      //console.log(req.body);
      if (req.body == {}) return;
      const columns = await getColumns(connection, table);
      const pk = columns[0].Field;
      const field = req.body.field;
      const value = req.body.value;
      await connection.query(
        `UPDATE \`${table}\` SET \`${field}\`=? WHERE \`${pk}\`=?`,
        [value, req.params.id]
      );
      res.redirect(`/${table}`);
    });

    // Delete
    app.post(`/${table}/delete/:id`, async (req, res) => {
      const columns = await getColumns(connection, table);
      await connection.query(`DELETE FROM \`${table}\` WHERE \`${columns[0].Field}\`=?`, [req.params.id]);
      res.redirect(`/${table}`);
    });
  });

  // Root: list tables
  app.get('/', (req, res) => {
    res.send(pageWrap(tables.map(t => `<a href="/${encodeURIComponent(t)}">${escapeHtml(t)}</a><br/>`).join(''), 'Tables'));
  });

  const PORT = process.env.PORT || 3025;
  app.listen(PORT, () => console.log(`Lazymofo Node running at http://localhost:${PORT}`));
})();