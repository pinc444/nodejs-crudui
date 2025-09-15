/*
 Client-side behaviors:
 - instant client-side filtering (as you type)
 - Enter key triggers full page search (URL param) so server-side search/sort/export work
 - clickable headers: pointer cursor; clicking toggles asc/desc; shift+click for multi-column
 - Columns dropdown allows show/hide columns; visible columns are encoded into links (visible=col1,col2)
 - Export CSV and headerSort include visible and search params
*/
let inlineEditMode = false;

// helper to read current visible columns (checkboxes)
function getVisibleColumns() {
  let checked = Array.from(document.querySelectorAll('.col-checkbox'))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
  // always include the action columns so buttons remain visible
  return checked.concat(['__actions__','__editdelete__']);
}

// apply visibility: show/hide cells and headers based on list (fields)
function applyColumnVisibility(visibleCols) {
  // headers
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.style.display = visibleCols.includes(th.getAttribute('data-col')) ? '' : 'none';
  });
  // body cells
  document.querySelectorAll('td[data-col]').forEach(td => {
    td.style.display = visibleCols.includes(td.getAttribute('data-col')) ? '' : 'none';
  });
}

function toggleInlineEdit(btn) {
  inlineEditMode = !inlineEditMode;
  btn.classList.toggle('active', inlineEditMode);

  document.querySelectorAll('.grid-view').forEach(inp => inp.style.display = (!inlineEditMode ? '' : 'none'));
  document.querySelectorAll('.grid-edit').forEach(inp => inp.style.display = (inlineEditMode ? '' : 'none'));
  //document.querySelectorAll('.inline-actions').forEach(span => span.style.display = (inlineEditMode ? '' : 'none'));
}

function saveChanges(btn){  
 
  document.querySelectorAll('.grid-cell').forEach((inp) => {
    const col_name =  inp.getElementsByClassName('column-name')[0].value;
    const old_value =  inp.getElementsByClassName('old_value')[0].innerText;
    const new_value =  inp.getElementsByClassName('edit-input')[0].value;
    const data = `field=${col_name}&value=${new_value}`;
    const form_action  = inp.getElementsByTagName("form")[0].getAttribute('action');
    if(old_value !== new_value){    
      fetch(form_action, {
      method: "POST",
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: data
    }).then(res => {
      console.log("Request complete! response:", res);
    }).catch(e=> console.log(e));
    }
  });
  window.location.reload();
}

// toggle the columns panel
function toggleColumnsDropdown(btn) {
  const dd = btn.closest('.columns-dropdown');
  dd.classList.toggle('open');
}

// called by column checkbox change
function onColumnCheckboxChange() {
  const visible = getVisibleColumns();
  applyColumnVisibility(visible);
  // update any URL-building functions will read checkboxes directly
}

// Header sorting logic: toggles asc/desc for column; shiftKey for multi-column builds list
let sortOrder = [];
function headerSort(table, col, shiftKey) {
  // ignore action columns for sorting
  if (col === '__actions__' || col === '__editdelete__') return;
  // compute visible columns to preserve
  const visible = getVisibleColumns().filter(x => x !== '__actions__' && x !== '__editdelete__');
  let idx = sortOrder.findIndex(x => x.col === col);
  if (idx >= 0) {
    // toggle direction
    sortOrder[idx].dir = sortOrder[idx].dir === 'asc' ? 'desc' : 'asc';
    if (!shiftKey) sortOrder = [sortOrder[idx]];
  } else {
    if (shiftKey) sortOrder.push({col, dir:'asc'});
    else sortOrder = [{col, dir:'asc'}];
  }
  const sortParam = sortOrder.map(x => x.col + ',' + x.dir).join(',');
  const visibleParam = visible.join(',');
  const searchVal = encodeURIComponent(document.getElementById('search-box').value || '');
  let q = '?';
  if (sortParam) q += 'sort=' + encodeURIComponent(sortParam) + '&';
  if (visibleParam) q += 'visible=' + encodeURIComponent(visibleParam) + '&';
  q += 'search=' + searchVal;
  window.location = '/' + encodeURIComponent(table) + q;
}

// Export CSV includes visible columns and search/sort params
function exportCSV(table) {
  const visibleParam = getVisibleColumns().filter(x => x !== '__actions__' && x !== '__editdelete__').join(',');
  const searchVal = encodeURIComponent(document.getElementById('search-box').value || '');
  const sortParam = sortOrder.map(x => x.col + ',' + x.dir).join(',');
  let q = '?csv=1';
  if (visibleParam) q += '&visible=' + encodeURIComponent(visibleParam);
  if (sortParam) q += '&sort=' + encodeURIComponent(sortParam);
  if (searchVal) q += '&search=' + searchVal;
  window.location = '/' + encodeURIComponent(table) + q;
}

// instant client-side filter + Enter triggers server URL search
window.addEventListener('DOMContentLoaded', function() {
  const searchBox = document.getElementById('search-box');
  if (!searchBox) return;

  // instant client-side filtering
  searchBox.addEventListener('input', function() {
    const val = searchBox.value.toLowerCase();
    document.querySelectorAll('.table-row').forEach(tr => {
      let show = false;
      tr.querySelectorAll('td[data-col]').forEach(td => {
        if (td.innerText.toLowerCase().indexOf(val) !== -1) show = true;
      });
      tr.style.display = show ? '' : 'none';
    });
  });

  // Enter -> reload with search URL param (server-side)
  searchBox.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();      
      const table = searchBox.getAttribute('data-table');
      const visibleParam = getVisibleColumns().filter(x => x !== '__actions__' && x !== '__editdelete__').join(',');
      const sortParam = sortOrder.map(x => x.col + ',' + x.dir).join(',');
      let q = '?search=' + encodeURIComponent(searchBox.value || '');
      if (visibleParam) q += '&visible=' + encodeURIComponent(visibleParam);
      if (sortParam) q += '&sort=' + encodeURIComponent(sortParam);
      window.location = '/' + encodeURIComponent(table) + q;
    }
  });

  // Column checkboxes: attach change handlers
  document.querySelectorAll('.col-checkbox').forEach(cb => cb.addEventListener('change', onColumnCheckboxChange));

  // initialize visibility from any preselected checkboxes
  const visibleNow = Array.from(document.querySelectorAll('.col-checkbox')).filter(cb=>cb.checked).map(cb=>cb.value).concat(['__actions__','__editdelete__']);
  applyColumnVisibility(visibleNow);

  // initialize sortOrder from server-sent attributes (if present)
  const sortAttr = document.getElementById('table-root')?.getAttribute('data-sort') || '';
  if (sortAttr) {
    const toks = sortAttr.split(',');
    for (let i=0; i<toks.length; i+=2) {
      const col = toks[i];
      const dir = toks[i+1] || 'asc';
      sortOrder.push({ col, dir });
    }
  }
});

// Advanced Search functionality
function showAdvancedSearch() {
  const advancedModal = document.getElementById('advanced-search-modal');
  if (advancedModal) {
    advancedModal.style.display = 'block';
  } else {
    // Create advanced search modal if it doesn't exist
    createAdvancedSearchModal();
  }
}

function hideAdvancedSearch() {
  const advancedModal = document.getElementById('advanced-search-modal');
  if (advancedModal) {
    advancedModal.style.display = 'none';
  }
}

function createAdvancedSearchModal() {
  const searchBox = document.getElementById('search-box');
  if (!searchBox) return;
  
  const table = searchBox.getAttribute('data-table');
  const modal = document.createElement('div');
  modal.id = 'advanced-search-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Advanced Search</h3>
        <span class="close-btn" onclick="hideAdvancedSearch()">&times;</span>
      </div>
      <div class="modal-body">
        <div class="search-filters">
          <div class="filter-group">
            <label>Search in columns:</label>
            <div id="column-search-options"></div>
          </div>
          <div class="filter-group">
            <label>Search term:</label>
            <input type="text" id="advanced-search-term" placeholder="Enter search term...">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="applyAdvancedSearch()" class="btn btn-primary">Search</button>
        <button onclick="clearAdvancedSearch()" class="btn">Clear</button>
        <button onclick="hideAdvancedSearch()" class="btn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Populate column options
  const columnOptions = document.getElementById('column-search-options');
  const checkboxes = document.querySelectorAll('.col-checkbox');
  checkboxes.forEach(cb => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${cb.value}" checked> ${cb.value}`;
    columnOptions.appendChild(label);
  });
  
  modal.style.display = 'block';
}

function applyAdvancedSearch() {
  const searchTerm = document.getElementById('advanced-search-term').value;
  const searchBox = document.getElementById('search-box');
  if (searchBox && searchTerm) {
    searchBox.value = searchTerm;
    searchBox.dispatchEvent(new Event('keydown', { key: 'Enter' }));
  }
  hideAdvancedSearch();
}

function clearAdvancedSearch() {
  const searchTerm = document.getElementById('advanced-search-term');
  const searchBox = document.getElementById('search-box');
  if (searchTerm) searchTerm.value = '';
  if (searchBox) {
    searchBox.value = '';
    searchBox.dispatchEvent(new Event('input'));
  }
}

// Date Filter functionality
function applyDateFilter() {
  const dateFrom = document.getElementById('date-from').value;
  const dateTo = document.getElementById('date-to').value;
  const dateColumn = document.getElementById('date-column-select')?.value || 
                    document.querySelectorAll('[data-col]')[0]?.getAttribute('data-col');
  
  if (!dateFrom && !dateTo) {
    alert('Please select at least one date');
    return;
  }
  
  // Apply client-side date filtering
  document.querySelectorAll('.table-row').forEach(tr => {
    const dateCell = tr.querySelector(`td[data-col="${dateColumn}"]`);
    if (!dateCell) return;
    
    const cellValue = dateCell.textContent.trim();
    const cellDate = new Date(cellValue);
    
    let show = true;
    if (dateFrom && cellDate < new Date(dateFrom)) show = false;
    if (dateTo && cellDate > new Date(dateTo)) show = false;
    
    tr.style.display = show ? '' : 'none';
  });
}

function toggleDateFilters() {
  const dateFilters = document.getElementById('date-filters');
  if (dateFilters) {
    dateFilters.style.display = dateFilters.style.display === 'none' ? 'block' : 'none';
  }
}

function clearDateFilter() {
  const dateFrom = document.getElementById('date-from');
  const dateTo = document.getElementById('date-to');
  if (dateFrom) dateFrom.value = '';
  if (dateTo) dateTo.value = '';
  
  // Show all rows again
  document.querySelectorAll('.table-row').forEach(tr => {
    tr.style.display = '';
  });
}

function toggleViewEdit() {
  var form = document.getElementById('view-edit-form');
  var edit = form.classList.toggle('edit-mode');
  var inputs = form.querySelectorAll('input:not([type=submit])');
  inputs.forEach(i => {
    if(edit)i.removeAttribute('readonly');
    else i.setAttribute('readonly', 'readonly');
  });
  var save = document.getElementById('view-edit-save-btn');
  if (edit) {
    save.style.display = 'inline-block';
    document.getElementById('view-edit-toggle-btn').textContent = 'Cancel Edit';
  } else {
    save.style.display = 'none';
    document.getElementById('view-edit-toggle-btn').textContent = 'Edit';
  }
}

function duplicate(){
  alert("Duplicate not ready!");
}

(function(){
      document.addEventListener('click', function(ev){
        const dd = document.getElementById('columns-dropdown');
        if (!dd) return;
        if (!dd.contains(ev.target)) dd.classList.remove('open');
      });

      // apply initial visibility based on checkboxes (checkboxes were rendered checked server-side)
      const cboxes = document.querySelectorAll('.col-checkbox');
      if (cboxes.length) {
        const visibleNow = Array.from(cboxes).filter(cb=>cb.checked).map(cb=>cb.value).concat(['__actions__','__editdelete__']);
        applyColumnVisibility(visibleNow);
      } else {
        // if no checkboxes (shouldn't happen), ensure action columns visible
        applyColumnVisibility(['__actions__','__editdelete__']);
      }

      // attach change handlers (in case client didn't pick up earlier)
      document.querySelectorAll('.col-checkbox').forEach(cb => cb.addEventListener('change', onColumnCheckboxChange));
    })();
