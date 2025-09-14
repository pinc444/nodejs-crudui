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
    const col_name =  inp.getElementsByClassName('colunm-name')[0].value;
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

function view_edit_toggle() {
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
