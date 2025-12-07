/**
 * Change Detection Engine
 *
 * Compares table data and generates detailed change reports.
 * Identifies rows added, removed, and cells modified.
 */

import deepDiff from 'deep-diff';
const { diff } = deepDiff;
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger({ component: 'comparator' });

/**
 * @typedef {object} CellChange
 * @property {string} type - 'modified'
 * @property {number} row - Row index
 * @property {number} column - Column index
 * @property {string} [columnHeader] - Column header if available
 * @property {string} oldValue - Previous value
 * @property {string} newValue - New value
 */

/**
 * @typedef {object} RowChange
 * @property {string} type - 'added' or 'removed'
 * @property {number} row - Row index
 * @property {string[]} values - Row cell values
 */

/**
 * @typedef {object} ChangeReport
 * @property {boolean} hasChanges - Whether any changes were detected
 * @property {string} summary - Human-readable summary
 * @property {number} totalChanges - Total number of changes
 * @property {object} stats - Change statistics
 * @property {RowChange[]} rowsAdded - Added rows
 * @property {RowChange[]} rowsRemoved - Removed rows
 * @property {CellChange[]} cellsModified - Modified cells
 * @property {object} metadata - Additional metadata
 */

/**
 * Compares two normalized table data objects
 * @param {object} oldData - Previous table data
 * @param {object} newData - Current table data
 * @param {object} [options] - Comparison options
 * @param {string[]} [options.headers] - Column headers for context
 * @returns {ChangeReport}
 */
export function compareTableData(oldData, newData, options = {}) {
  const { headers = [] } = options;

  const report = {
    hasChanges: false,
    summary: '',
    totalChanges: 0,
    stats: {
      rowsAdded: 0,
      rowsRemoved: 0,
      cellsModified: 0,
    },
    rowsAdded: [],
    rowsRemoved: [],
    cellsModified: [],
    metadata: {
      oldRowCount: oldData?.rows?.length || 0,
      newRowCount: newData?.rows?.length || 0,
      comparedAt: new Date().toISOString(),
    },
  };

  // Handle null/undefined cases
  if (!oldData || !oldData.rows) {
    if (newData && newData.rows && newData.rows.length > 0) {
      // All rows are new (initial load)
      report.hasChanges = true;
      report.stats.rowsAdded = newData.rows.length;
      report.rowsAdded = newData.rows.map((row, index) => ({
        type: 'added',
        row: index,
        values: row,
      }));
      report.totalChanges = newData.rows.length;
      report.summary = `Initial table data captured: ${newData.rows.length} rows`;
      logger.info(report.summary);
    } else {
      report.summary = 'No data to compare';
    }
    return report;
  }

  if (!newData || !newData.rows) {
    report.summary = 'New data is empty or invalid';
    logger.warn(report.summary);
    return report;
  }

  const oldRows = oldData.rows;
  const newRows = newData.rows;

  // Detect row count changes
  const rowDiff = newRows.length - oldRows.length;

  // Compare rows
  const minRows = Math.min(oldRows.length, newRows.length);

  // Check for modified cells in overlapping rows
  for (let rowIdx = 0; rowIdx < minRows; rowIdx++) {
    const oldRow = oldRows[rowIdx] || [];
    const newRow = newRows[rowIdx] || [];
    const maxCols = Math.max(oldRow.length, newRow.length);

    for (let colIdx = 0; colIdx < maxCols; colIdx++) {
      const oldVal = oldRow[colIdx] ?? '';
      const newVal = newRow[colIdx] ?? '';

      if (oldVal !== newVal) {
        report.cellsModified.push({
          type: 'modified',
          row: rowIdx,
          column: colIdx,
          columnHeader: headers[colIdx] || `Column ${colIdx + 1}`,
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    }
  }

  // Detect added rows (if new table has more rows)
  if (newRows.length > oldRows.length) {
    for (let rowIdx = oldRows.length; rowIdx < newRows.length; rowIdx++) {
      report.rowsAdded.push({
        type: 'added',
        row: rowIdx,
        values: newRows[rowIdx] || [],
      });
    }
  }

  // Detect removed rows (if old table had more rows)
  if (oldRows.length > newRows.length) {
    for (let rowIdx = newRows.length; rowIdx < oldRows.length; rowIdx++) {
      report.rowsRemoved.push({
        type: 'removed',
        row: rowIdx,
        values: oldRows[rowIdx] || [],
      });
    }
  }

  // Calculate totals
  report.stats.rowsAdded = report.rowsAdded.length;
  report.stats.rowsRemoved = report.rowsRemoved.length;
  report.stats.cellsModified = report.cellsModified.length;
  report.totalChanges =
    report.stats.rowsAdded + report.stats.rowsRemoved + report.stats.cellsModified;
  report.hasChanges = report.totalChanges > 0;

  // Generate summary
  report.summary = generateSummary(report);

  if (report.hasChanges) {
    logger.info({ stats: report.stats }, report.summary);
  }

  return report;
}

/**
 * Generates a human-readable summary of changes
 * @param {ChangeReport} report - Change report
 * @returns {string} Summary text
 */
function generateSummary(report) {
  if (!report.hasChanges) {
    return 'No changes detected';
  }

  const parts = [];

  if (report.stats.rowsAdded > 0) {
    parts.push(`${report.stats.rowsAdded} row(s) added`);
  }

  if (report.stats.rowsRemoved > 0) {
    parts.push(`${report.stats.rowsRemoved} row(s) removed`);
  }

  if (report.stats.cellsModified > 0) {
    parts.push(`${report.stats.cellsModified} cell(s) modified`);
  }

  return parts.join(', ');
}

/**
 * Formats a change report for console output
 * @param {ChangeReport} report - Change report
 * @returns {string} Formatted output
 */
export function formatChangeReport(report) {
  if (!report.hasChanges) {
    return 'No changes detected.';
  }

  const lines = [
    '═══════════════════════════════════════',
    '          CHANGES DETECTED',
    '═══════════════════════════════════════',
    '',
    `Summary: ${report.summary}`,
    `Total changes: ${report.totalChanges}`,
    '',
  ];

  // Added rows
  if (report.rowsAdded.length > 0) {
    lines.push('── Rows Added ──');
    for (const row of report.rowsAdded) {
      lines.push(`  [Row ${row.row + 1}] ${row.values.join(' | ')}`);
    }
    lines.push('');
  }

  // Removed rows
  if (report.rowsRemoved.length > 0) {
    lines.push('── Rows Removed ──');
    for (const row of report.rowsRemoved) {
      lines.push(`  [Row ${row.row + 1}] ${row.values.join(' | ')}`);
    }
    lines.push('');
  }

  // Modified cells
  if (report.cellsModified.length > 0) {
    lines.push('── Cells Modified ──');
    for (const cell of report.cellsModified) {
      lines.push(
        `  [Row ${cell.row + 1}, ${cell.columnHeader}]`,
        `    "${cell.oldValue}" → "${cell.newValue}"`
      );
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Creates a compact change summary for notifications
 * @param {ChangeReport} report - Change report
 * @param {object} context - Additional context
 * @param {string} [context.pageTitle] - Page title
 * @param {number} [context.version] - Page version
 * @returns {string}
 */
export function createNotificationMessage(report, context = {}) {
  if (!report.hasChanges) {
    return null;
  }

  const { pageTitle, version } = context;

  let message = '';

  if (pageTitle) {
    message += `📄 **${pageTitle}**`;
    if (version) {
      message += ` (v${version})`;
    }
    message += '\n\n';
  }

  message += `🔔 ${report.summary}\n`;

  // Include first few changes as preview
  const maxPreview = 3;

  if (report.cellsModified.length > 0) {
    const preview = report.cellsModified.slice(0, maxPreview);
    for (const cell of preview) {
      message += `• ${cell.columnHeader}: "${truncate(cell.oldValue, 20)}" → "${truncate(cell.newValue, 20)}"\n`;
    }
    if (report.cellsModified.length > maxPreview) {
      message += `  ... and ${report.cellsModified.length - maxPreview} more changes\n`;
    }
  }

  if (report.rowsAdded.length > 0) {
    message += `• ${report.rowsAdded.length} new row(s)\n`;
  }

  if (report.rowsRemoved.length > 0) {
    message += `• ${report.rowsRemoved.length} row(s) removed\n`;
  }

  return message.trim();
}

/**
 * Truncates a string to specified length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Deep comparison using diff library (for debugging)
 * @param {object} oldData - Old data
 * @param {object} newData - New data
 * @returns {object[]} Array of differences
 */
export function deepCompare(oldData, newData) {
  return diff(oldData, newData) || [];
}

export default {
  compareTableData,
  formatChangeReport,
  createNotificationMessage,
  deepCompare,
};
