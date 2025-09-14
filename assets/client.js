/*
 * Enhanced CrudUI Client-side JavaScript
 * Features: pagination, advanced search, date filters, column resizing, modern interactions
 */
let inlineEditMode = false;
let sortOrder = [];
let advancedSearchModal = null;

// Helper to read current visible columns (checkboxes)
function getVisibleColumns() {
  let checked = Array.from(document.querySelectorAll('.col-checkbox'))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
  // Always include the action columns so buttons remain visible
  return checked.concat(['__actions__','__editdelete__']);
}

// Apply visibility: show/hide cells and headers based on list (fields)
function applyColumnVisibility(visibleCols) {
  // Headers
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.style.display = visibleCols.includes(th.getAttribute('data-col')) ? '' : 'none';
  });
  // Body cells
  document.querySelectorAll('td[data-col]').forEach(td => {
    td.style.display = visibleCols.includes(td.getAttribute('data-col')) ? '' : 'none';
  });
}

// Toggle inline edit mode
function toggleInlineEdit(btn) {
  inlineEditMode = !inlineEditMode;
  btn.classList.toggle('active', inlineEditMode);

  const saveBtn = document.querySelector('.save-inline-btn');
  if (saveBtn) {
    saveBtn.style.display = inlineEditMode ? 'inline-block' : 'none';
  }

  document.querySelectorAll('.grid-view').forEach(elem => {
    elem.style.display = inlineEditMode ? 'none' : '';
  });
  document.querySelectorAll('.grid-edit').forEach(elem => {
    elem.style.display = inlineEditMode ? '' : 'none';
  });
}

// Save all inline changes
function saveChanges(btn) {
  const changedElements = [];
  
  document.querySelectorAll('.grid-cell').forEach((cell) => {
    const oldValueElem = cell.querySelector('.old_value');
    const editInputElem = cell.querySelector('.edit-input');
    const columnNameElem = cell.querySelector('.column-name');
    const formElem = cell.querySelector('form');
    
    if (oldValueElem && editInputElem && columnNameElem && formElem) {
      const oldValue = oldValueElem.innerText;
      const newValue = editInputElem.value;
      const columnName = columnNameElem.value;
      const formAction = formElem.getAttribute('action');
      
      if (oldValue !== newValue) {
        changedElements.push({
          formAction,
          data: `field=${encodeURIComponent(columnName)}&value=${encodeURIComponent(newValue)}`
        });
      }
    }
  });

  if (changedElements.length === 0) {
    showMessage('No changes to save', 'info');
    return;
  }

  // Show loading state
  btn.classList.add('loading');
  btn.disabled = true;

  // Save all changes
  Promise.all(changedElements.map(change => {
    return fetch(change.formAction, {
      method: "POST",
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: change.data
    });
  })).then(() => {
    showMessage('Changes saved successfully', 'success');
    setTimeout(() => window.location.reload(), 1000);
  }).catch(error => {
    console.error('Error saving changes:', error);
    showMessage('Error saving changes', 'error');
    btn.classList.remove('loading');
    btn.disabled = false;
  });
}

// Toggle the columns panel
function toggleColumnsDropdown(btn) {
  const dd = btn.closest('.columns-dropdown');
  dd.classList.toggle('open');
}

// Called by column checkbox change
function onColumnCheckboxChange() {
  const visible = getVisibleColumns();
  applyColumnVisibility(visible);
}

// Header sorting logic
function headerSort(table, col, shiftKey) {
  // Ignore action columns for sorting
  if (col === '__actions__' || col === '__editdelete__') return;
  
  // Compute visible columns to preserve
  const visible = getVisibleColumns().filter(x => x !== '__actions__' && x !== '__editdelete__');
  let idx = sortOrder.findIndex(x => x.col === col);
  
  if (idx >= 0) {
    // Toggle direction
    sortOrder[idx].dir = sortOrder[idx].dir === 'asc' ? 'desc' : 'asc';
    if (!shiftKey) sortOrder = [sortOrder[idx]];
  } else {
    if (shiftKey) sortOrder.push({col, dir:'asc'});
    else sortOrder = [{col, dir:'asc'}];
  }
  
  navigateWithParams(table, { sort: sortOrder, visible: visible });
}

// Export CSV includes visible columns and search/sort params
function exportCSV(table) {
  const visibleParam = getVisibleColumns().filter(x => x !== '__actions__' && x !== '__editdelete__').join(',');
  const searchVal = encodeURIComponent(document.getElementById('search-box')?.value || '');
  const sortParam = sortOrder.map(x => x.col + ',' + x.dir).join(',');
  
  let q = '?csv=1';
  if (visibleParam) q += '&visible=' + encodeURIComponent(visibleParam);
  if (sortParam) q += '&sort=' + encodeURIComponent(sortParam);
  if (searchVal) q += '&search=' + searchVal;
  
  window.location = getCurrentPath() + '/' + encodeURIComponent(table) + q;
}

// Navigate with parameters
function navigateWithParams(table, params = {}) {
  const searchBox = document.getElementById('search-box');
  const currentSearch = searchBox ? searchBox.value : '';
  const currentPage = new URLSearchParams(window.location.search).get('page') || '1';
  
  let url = getCurrentPath() + '/' + encodeURIComponent(table) + '?';
  
  if (params.sort && params.sort.length) {
    const sortParam = params.sort.map(x => x.col + ',' + x.dir).join(',');
    url += 'sort=' + encodeURIComponent(sortParam) + '&';
  }
  
  if (params.visible && params.visible.length) {
    url += 'visible=' + encodeURIComponent(params.visible.join(',')) + '&';
  }
  
  if (currentSearch) {
    url += 'search=' + encodeURIComponent(currentSearch) + '&';
  }
  
  if (params.page && params.page !== '1') {
    url += 'page=' + params.page + '&';
  }
  
  window.location = url.replace(/[&?]$/, '');
}

// Get current path (handles root path configuration)
function getCurrentPath() {
  const pathParts = window.location.pathname.split('/');
  // Remove table name from end if present
  pathParts.pop();
  return pathParts.join('/') || '';
}

// View/Edit form toggle
function toggleViewEdit() {
  const form = document.getElementById('view-edit-form');
  const toggleBtn = document.getElementById('view-edit-toggle-btn');
  const saveBtn = document.getElementById('view-edit-save-btn');
  
  const isEditMode = form.classList.toggle('edit-mode');
  
  const inputs = form.querySelectorAll('input:not([type=submit]):not([type=hidden])');
  inputs.forEach(input => {
    if (isEditMode && !input.readOnly) {
      input.removeAttribute('readonly');
      input.classList.remove('view-input');
    } else {
      input.setAttribute('readonly', 'readonly');
      input.classList.add('view-input');
    }
  });
  
  if (isEditMode) {
    saveBtn.style.display = 'inline-block';
    toggleBtn.textContent = 'Cancel Edit';
    toggleBtn.classList.add('active');
  } else {
    saveBtn.style.display = 'none';
    toggleBtn.textContent = 'Edit';
    toggleBtn.classList.remove('active');
  }
}

// Advanced search functionality
function showAdvancedSearch() {
  if (!advancedSearchModal) {
    createAdvancedSearchModal();
  }
  advancedSearchModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function hideAdvancedSearch() {
  if (advancedSearchModal) {
    advancedSearchModal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function createAdvancedSearchModal() {
  const modal = document.createElement('div');
  modal.className = 'advanced-search-modal';
  modal.innerHTML = `
    <div class="advanced-search-content">
      <h3>Advanced Search</h3>
      <div id="search-rows"></div>
      <button type="button" class="add-search-row" onclick="addSearchRow()">+ Add Search Criteria</button>
      <div style="margin-top: 20px;">
        <label>
          <input type="radio" name="search-logic" value="AND" checked> Match ALL criteria
        </label>
        <label style="margin-left: 15px;">
          <input type="radio" name="search-logic" value="OR"> Match ANY criteria
        </label>
      </div>
      <div style="margin-top: 20px; text-align: right;">
        <button type="button" class="btn back-btn" onclick="hideAdvancedSearch()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="applyAdvancedSearch()">Search</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  advancedSearchModal = modal;
  
  // Close on click outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideAdvancedSearch();
  });
  
  // Add initial search row
  addSearchRow();
}

function addSearchRow() {
  const searchRows = document.getElementById('search-rows');
  const table = document.getElementById('search-box')?.getAttribute('data-table') || '';
  
  // Get available columns
  const columns = Array.from(document.querySelectorAll('.col-checkbox')).map(cb => cb.value);
  
  const row = document.createElement('div');
  row.className = 'search-row';
  row.innerHTML = `
    <select class="search-column">
      ${columns.map(col => `<option value="${col}">${col}</option>`).join('')}
    </select>
    <select class="search-operator">
      <option value="LIKE">Contains</option>
      <option value="=">Equals</option>
      <option value="!=">Not Equals</option>
      <option value=">">Greater Than</option>
      <option value="<">Less Than</option>
      <option value="LIKE%">Starts With</option>
      <option value="%LIKE">Ends With</option>
    </select>
    <input type="text" class="search-value" placeholder="Search value">
    <button type="button" class="remove-row" onclick="removeSearchRow(this)">Remove</button>
  `;
  
  searchRows.appendChild(row);
}

function removeSearchRow(btn) {
  const row = btn.closest('.search-row');
  if (document.querySelectorAll('.search-row').length > 1) {
    row.remove();
  }
}

function applyAdvancedSearch() {
  const rows = document.querySelectorAll('.search-row');
  const logic = document.querySelector('input[name="search-logic"]:checked').value;
  
  const criteria = Array.from(rows).map(row => {
    return {
      column: row.querySelector('.search-column').value,
      operator: row.querySelector('.search-operator').value,
      value: row.querySelector('.search-value').value
    };
  }).filter(c => c.value.trim() !== '');
  
  if (criteria.length === 0) {
    showMessage('Please enter at least one search criteria', 'warning');
    return;
  }
  
  // Build search string (simplified - in a real implementation, this would be handled server-side)
  const searchString = criteria.map(c => `${c.column}:${c.operator}:${c.value}`).join(`|${logic}|`);
  
  const searchBox = document.getElementById('search-box');
  if (searchBox) {
    searchBox.value = searchString;
    hideAdvancedSearch();
    // Trigger search
    searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  }
}

// Date filter functionality
function applyDateFilter() {
  const dateColumn = document.getElementById('date-column-select')?.value || 
                    document.querySelector('.date-filters select')?.value;
  const dateFrom = document.getElementById('date-from')?.value;
  const dateTo = document.getElementById('date-to')?.value;
  
  if (!dateFrom && !dateTo) {
    showMessage('Please select at least one date', 'warning');
    return;
  }
  
  const searchBox = document.getElementById('search-box');
  if (searchBox && dateColumn) {
    let dateFilter = `${dateColumn}:date:`;
    if (dateFrom && dateTo) {
      dateFilter += `${dateFrom}to${dateTo}`;
    } else if (dateFrom) {
      dateFilter += `from${dateFrom}`;
    } else {
      dateFilter += `to${dateTo}`;
    }
    
    // Combine with existing search
    const currentSearch = searchBox.value;
    searchBox.value = currentSearch ? `${currentSearch} ${dateFilter}` : dateFilter;
    
    // Trigger search
    searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  }
}

// Show message to user
function showMessage(message, type = 'info') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `${type}-message`;
  messageDiv.textContent = message;
  messageDiv.style.position = 'fixed';
  messageDiv.style.top = '20px';
  messageDiv.style.right = '20px';
  messageDiv.style.zIndex = '10001';
  messageDiv.style.padding = '12px 16px';
  messageDiv.style.borderRadius = '6px';
  messageDiv.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
  
  document.body.appendChild(messageDiv);
  
  setTimeout(() => {
    messageDiv.style.opacity = '0';
    setTimeout(() => messageDiv.remove(), 300);
  }, 3000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  const searchBox = document.getElementById('search-box');
  
  if (searchBox) {
    // Instant client-side filtering
    searchBox.addEventListener('input', function() {
      const val = searchBox.value.toLowerCase();
      const rows = document.querySelectorAll('.table-row');
      
      // Show/hide loading state
      const tableWrapper = document.querySelector('.table-wrapper');
      if (tableWrapper) {
        tableWrapper.classList.toggle('loading', val.length > 0);
      }
      
      rows.forEach(tr => {
        let show = false;
        const cells = tr.querySelectorAll('td[data-col]');
        cells.forEach(td => {
          if (td.innerText.toLowerCase().indexOf(val) !== -1) {
            show = true;
          }
        });
        tr.style.display = show ? '' : 'none';
      });
      
      // Remove loading state after a short delay
      setTimeout(() => {
        if (tableWrapper) tableWrapper.classList.remove('loading');
      }, 200);
    });

    // Enter key triggers server-side search
    searchBox.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const table = searchBox.getAttribute('data-table');
        const visible = getVisibleColumns().filter(x => x !== '__actions__' && x !== '__editdelete__');
        navigateWithParams(table, { visible: visible, page: '1' });
      }
    });
  }

  // Column checkboxes: attach change handlers
  document.querySelectorAll('.col-checkbox').forEach(cb => {
    cb.addEventListener('change', onColumnCheckboxChange);
  });

  // Initialize visibility from preselected checkboxes
  const visibleNow = Array.from(document.querySelectorAll('.col-checkbox'))
    .filter(cb => cb.checked)
    .map(cb => cb.value)
    .concat(['__actions__', '__editdelete__']);
  applyColumnVisibility(visibleNow);

  // Initialize sortOrder from server-sent attributes (if present)
  const sortAttr = document.getElementById('table-root')?.getAttribute('data-sort') || '';
  if (sortAttr) {
    const toks = sortAttr.split(',');
    sortOrder = [];
    for (let i = 0; i < toks.length; i += 2) {
      const col = toks[i];
      const dir = toks[i + 1] || 'asc';
      if (col) sortOrder.push({ col, dir });
    }
  }

  // Close dropdowns when clicking outside
  document.addEventListener('click', function(ev) {
    const dd = document.getElementById('columns-dropdown');
    if (dd && !dd.contains(ev.target)) {
      dd.classList.remove('open');
    }
  });

  // Initialize column resizing (simplified implementation)
  initializeColumnResizing();
  
  // Initialize keyboard shortcuts
  initializeKeyboardShortcuts();
});

// Column resizing functionality
function initializeColumnResizing() {
  const headers = document.querySelectorAll('th');
  
  headers.forEach(header => {
    if (header.getAttribute('data-col') === '__actions__' || 
        header.getAttribute('data-col') === '__editdelete__') return;
    
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    header.appendChild(resizeHandle);
    header.classList.add('resizable-column');
    
    let isResizing = false;
    let startX, startWidth;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = parseInt(document.defaultView.getComputedStyle(header).width, 10);
      resizeHandle.classList.add('active');
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    });
    
    function handleMouseMove(e) {
      if (!isResizing) return;
      const width = startWidth + e.clientX - startX;
      header.style.width = width + 'px';
    }
    
    function handleMouseUp() {
      isResizing = false;
      resizeHandle.classList.remove('active');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
  });
}

// Keyboard shortcuts
function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K for quick search focus
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchBox = document.getElementById('search-box');
      if (searchBox) {
        searchBox.focus();
        searchBox.select();
      }
    }
    
    // Escape to clear search or close modals
    if (e.key === 'Escape') {
      const searchBox = document.getElementById('search-box');
      if (searchBox && document.activeElement === searchBox) {
        searchBox.value = '';
        searchBox.dispatchEvent(new Event('input'));
      } else if (advancedSearchModal && advancedSearchModal.classList.contains('active')) {
        hideAdvancedSearch();
      }
    }
    
    // Ctrl/Cmd + Enter for advanced search
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      showAdvancedSearch();
    }
  });
}
