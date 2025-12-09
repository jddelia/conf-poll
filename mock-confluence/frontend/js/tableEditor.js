/**
 * Table Editor Component
 *
 * Interactive table builder that generates Confluence-compatible HTML.
 */

/**
 * Initialize table editor with default structure
 */
export function initializeTable() {
  const table = document.getElementById('editableTable');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  // Clear existing content
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // Create default header row
  const headerRow = document.createElement('tr');
  for (let i = 0; i < 3; i++) {
    const th = document.createElement('th');
    th.contentEditable = true;
    th.textContent = `Column ${i + 1}`;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  // Create default data row
  const dataRow = document.createElement('tr');
  for (let i = 0; i < 3; i++) {
    const td = document.createElement('td');
    td.contentEditable = true;
    dataRow.appendChild(td);
  }
  tbody.appendChild(dataRow);
}

/**
 * Add a new row to the table
 */
export function addRow() {
  const table = document.getElementById('editableTable');
  const tbody = table.querySelector('tbody');
  const columnCount = getColumnCount();

  const row = document.createElement('tr');
  for (let i = 0; i < columnCount; i++) {
    const td = document.createElement('td');
    td.contentEditable = true;
    row.appendChild(td);
  }
  tbody.appendChild(row);
}

/**
 * Remove the last row from the table
 */
export function removeRow() {
  const table = document.getElementById('editableTable');
  const tbody = table.querySelector('tbody');
  const rows = tbody.querySelectorAll('tr');

  if (rows.length > 1) {
    rows[rows.length - 1].remove();
  }
}

/**
 * Add a new column to the table
 */
export function addColumn() {
  const table = document.getElementById('editableTable');
  const hasHeader = document.getElementById('headerRowToggle').checked;

  // Add to header if exists
  if (hasHeader) {
    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
      const th = document.createElement('th');
      th.contentEditable = true;
      th.textContent = `Column ${getColumnCount() + 1}`;
      headerRow.appendChild(th);
    }
  }

  // Add to all body rows
  const bodyRows = table.querySelectorAll('tbody tr');
  bodyRows.forEach((row) => {
    const td = document.createElement('td');
    td.contentEditable = true;
    row.appendChild(td);
  });
}

/**
 * Remove the last column from the table
 */
export function removeColumn() {
  const table = document.getElementById('editableTable');
  const columnCount = getColumnCount();

  if (columnCount <= 1) return;

  // Remove from header
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    const cells = headerRow.querySelectorAll('th');
    if (cells.length > 0) {
      cells[cells.length - 1].remove();
    }
  }

  // Remove from all body rows
  const bodyRows = table.querySelectorAll('tbody tr');
  bodyRows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length > 0) {
      cells[cells.length - 1].remove();
    }
  });
}

/**
 * Get current column count
 */
export function getColumnCount() {
  const table = document.getElementById('editableTable');
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    return headerRow.querySelectorAll('th').length;
  }
  const firstRow = table.querySelector('tbody tr');
  return firstRow ? firstRow.querySelectorAll('td').length : 0;
}

/**
 * Toggle header row visibility
 */
export function toggleHeaderRow(show) {
  const table = document.getElementById('editableTable');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  if (show) {
    // Create header row if doesn't exist
    if (!thead.querySelector('tr')) {
      const columnCount = tbody.querySelector('tr')?.querySelectorAll('td').length || 3;
      const headerRow = document.createElement('tr');
      for (let i = 0; i < columnCount; i++) {
        const th = document.createElement('th');
        th.contentEditable = true;
        th.textContent = `Header ${i + 1}`;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
    }
    thead.style.display = '';
  } else {
    thead.style.display = 'none';
  }
}

/**
 * Get cell content, converting user mention spans back to Confluence markup
 */
function getCellContent(cell) {
  // Check if cell has user mentions that need conversion
  const mentions = cell.querySelectorAll('.user-mention');
  if (mentions.length === 0) {
    return cell.innerHTML;
  }

  // Clone and convert mentions to raw markup
  const clone = cell.cloneNode(true);
  clone.querySelectorAll('.user-mention').forEach((mention) => {
    const rawHtml = mention.dataset.mention;
    if (rawHtml) {
      const textNode = document.createTextNode(rawHtml);
      mention.parentNode.replaceChild(textNode, mention);
    }
  });

  return clone.innerHTML;
}

/**
 * Generate Confluence-compatible HTML from the table
 */
export function generateTableHtml() {
  const table = document.getElementById('editableTable');
  const hasHeader = document.getElementById('headerRowToggle').checked;

  let html = '<table>\n';

  // Add header row
  if (hasHeader) {
    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
      html += '  <tr>\n';
      headerRow.querySelectorAll('th').forEach((th) => {
        html += `    <th>${getCellContent(th)}</th>\n`;
      });
      html += '  </tr>\n';
    }
  }

  // Add body rows
  const bodyRows = table.querySelectorAll('tbody tr');
  bodyRows.forEach((row) => {
    html += '  <tr>\n';
    row.querySelectorAll('td').forEach((td) => {
      html += `    <td>${getCellContent(td)}</td>\n`;
    });
    html += '  </tr>\n';
  });

  html += '</table>';

  return html;
}

/**
 * Convert raw Confluence user mention markup to display spans
 * Handles: <ac:link><ri:user .../>...<![CDATA[Name]]>...</ac:link>
 */
function convertMentionsToDisplaySpans(cellHtml) {
  // Match ac:link elements containing ri:user
  const acLinkPattern = /<ac:link>[\s\S]*?<ri:user[^>]*\/>[\s\S]*?<!\[CDATA\[(.*?)\]\]>[\s\S]*?<\/ac:link>/gi;

  return cellHtml.replace(acLinkPattern, (match, displayName) => {
    // Store the original markup in data-mention attribute
    const escapedMention = match.replace(/"/g, '&quot;');
    return `<span class="user-mention" data-mention="${escapedMention}">@${displayName}</span>`;
  });
}

/**
 * Parse HTML and populate the table editor
 */
export function parseHtmlToTable(html) {
  const table = document.getElementById('editableTable');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const headerToggle = document.getElementById('headerRowToggle');

  // Clear existing content
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // Create a temporary element to parse the HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const sourceTable = temp.querySelector('table');
  if (!sourceTable) {
    // No table found, initialize default
    initializeTable();
    return;
  }

  const rows = sourceTable.querySelectorAll('tr');
  let hasHeader = false;

  rows.forEach((row, index) => {
    const cells = row.querySelectorAll('th, td');
    const isHeaderRow = cells.length > 0 && cells[0].tagName === 'TH';

    if (isHeaderRow && index === 0) {
      hasHeader = true;
      const headerRow = document.createElement('tr');
      cells.forEach((cell) => {
        const th = document.createElement('th');
        th.contentEditable = true;
        // Convert raw Confluence mentions to display spans
        th.innerHTML = convertMentionsToDisplaySpans(cell.innerHTML);
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
    } else {
      const dataRow = document.createElement('tr');
      cells.forEach((cell) => {
        const td = document.createElement('td');
        td.contentEditable = true;
        // Convert raw Confluence mentions to display spans
        td.innerHTML = convertMentionsToDisplaySpans(cell.innerHTML);
        dataRow.appendChild(td);
      });
      tbody.appendChild(dataRow);
    }
  });

  // Update header toggle
  headerToggle.checked = hasHeader;
  thead.style.display = hasHeader ? '' : 'none';

  // If no rows were added, initialize with defaults
  if (tbody.querySelectorAll('tr').length === 0) {
    addRow();
  }
}

/**
 * Insert user mention markup at the currently focused cell
 */
export function insertUserMention(mentionHtml) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return false;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;

  // Check if we're inside a table cell
  const cell = container.nodeType === 3
    ? container.parentElement.closest('td, th')
    : container.closest('td, th');

  if (!cell) return false;

  // Create a display-friendly version for the editor
  const displaySpan = document.createElement('span');
  displaySpan.className = 'user-mention';
  displaySpan.dataset.mention = mentionHtml;

  // Extract display name from mention HTML
  const match = mentionHtml.match(/CDATA\[(.*?)\]/);
  const displayName = match ? `@${match[1]}` : '@User';
  displaySpan.textContent = displayName;

  // Insert at cursor position
  range.deleteContents();
  range.insertNode(displaySpan);

  // Move cursor after the mention
  range.setStartAfter(displaySpan);
  range.setEndAfter(displaySpan);
  selection.removeAllRanges();
  selection.addRange(range);

  return true;
}

/**
 * Convert display mentions back to raw HTML for storage
 */
export function convertMentionsToHtml(element) {
  const clone = element.cloneNode(true);
  const mentions = clone.querySelectorAll('.user-mention');

  mentions.forEach((mention) => {
    const rawHtml = mention.dataset.mention;
    if (rawHtml) {
      const textNode = document.createTextNode(rawHtml);
      mention.parentNode.replaceChild(textNode, mention);
    }
  });

  return clone.innerHTML;
}

export default {
  initializeTable,
  addRow,
  removeRow,
  addColumn,
  removeColumn,
  getColumnCount,
  toggleHeaderRow,
  generateTableHtml,
  parseHtmlToTable,
  insertUserMention,
  convertMentionsToHtml,
};
