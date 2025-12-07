/**
 * Confluence Table Parser
 *
 * Parses HTML tables from Confluence page content.
 * Handles various Confluence-specific markup and edge cases.
 */

import * as cheerio from 'cheerio';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger({ component: 'table-parser' });

/**
 * @typedef {object} TableCell
 * @property {string} text - Cell text content (trimmed)
 * @property {string} html - Original HTML content
 * @property {boolean} isHeader - Whether this is a header cell (th)
 * @property {number} rowSpan - Row span value
 * @property {number} colSpan - Column span value
 */

/**
 * @typedef {object} TableRow
 * @property {number} index - Row index (0-based)
 * @property {TableCell[]} cells - Array of cells
 * @property {boolean} isHeaderRow - Whether all cells are headers
 */

/**
 * @typedef {object} ParsedTable
 * @property {number} index - Table index on the page (0-based)
 * @property {TableRow[]} rows - Array of rows
 * @property {number} rowCount - Total number of rows
 * @property {number} columnCount - Maximum number of columns
 * @property {string[]} headers - Header row values (if detected)
 */

/**
 * Cleans text content from a cell
 * @param {string} text - Raw text content
 * @returns {string} Cleaned text
 */
function cleanCellText(text) {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\u00a0/g, ' ') // Replace non-breaking spaces
    .trim();
}

/**
 * Extracts structured text from cell HTML
 * Handles special Confluence elements like user mentions, links, etc.
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {cheerio.Element} cell - Cell element
 * @returns {string} Extracted text
 */
function extractCellText($, cell) {
  const $cell = $(cell);

  // Handle user mentions
  $cell.find('ri\\:user, ac\\:link').each((_, el) => {
    const $el = $(el);
    const userName = $el.attr('ri:userkey') || $el.text() || '[user]';
    $el.replaceWith(` @${userName} `);
  });

  // Handle status macros
  $cell.find('ac\\:structured-macro[ac\\:name="status"]').each((_, el) => {
    const $el = $(el);
    const title = $el.find('ac\\:parameter[ac\\:name="title"]').text() || 'status';
    $el.replaceWith(` [${title}] `);
  });

  // Handle emoticons
  $cell.find('ac\\:emoticon').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('ac:name') || 'emoji';
    $el.replaceWith(` :${name}: `);
  });

  // Get final text
  return cleanCellText($cell.text());
}

/**
 * Parses a single table element
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {cheerio.Element} table - Table element
 * @param {number} tableIndex - Index of this table
 * @returns {ParsedTable}
 */
function parseTableElement($, table, tableIndex) {
  const $table = $(table);
  const rows = [];
  let maxColumns = 0;

  $table.find('tr').each((rowIndex, tr) => {
    const $tr = $(tr);
    const cells = [];

    $tr.find('th, td').each((cellIndex, cell) => {
      const $cell = $(cell);
      const isHeader = cell.tagName === 'th';
      const rowSpan = parseInt($cell.attr('rowspan') || '1', 10);
      const colSpan = parseInt($cell.attr('colspan') || '1', 10);

      cells.push({
        text: extractCellText($, cell),
        html: $cell.html() || '',
        isHeader,
        rowSpan,
        colSpan,
      });
    });

    // Calculate actual column count considering colspan
    const effectiveColumns = cells.reduce((sum, cell) => sum + cell.colSpan, 0);
    maxColumns = Math.max(maxColumns, effectiveColumns);

    const isHeaderRow = cells.length > 0 && cells.every((cell) => cell.isHeader);

    rows.push({
      index: rowIndex,
      cells,
      isHeaderRow,
    });
  });

  // Extract headers from first header row
  const headerRow = rows.find((row) => row.isHeaderRow);
  const headers = headerRow
    ? headerRow.cells.map((cell) => cell.text)
    : [];

  return {
    index: tableIndex,
    rows,
    rowCount: rows.length,
    columnCount: maxColumns,
    headers,
  };
}

/**
 * Parses all tables from Confluence page HTML content
 * @param {string} htmlContent - Page body HTML
 * @returns {ParsedTable[]} Array of parsed tables
 */
export function parseTablesFromHtml(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    logger.warn('Empty or invalid HTML content provided');
    return [];
  }

  const $ = cheerio.load(htmlContent, {
    xml: {
      // Confluence uses XHTML-like content
      xmlMode: false,
    },
  });

  const tables = [];

  $('table').each((index, table) => {
    try {
      const parsedTable = parseTableElement($, table, index);
      tables.push(parsedTable);
      logger.debug(
        {
          tableIndex: index,
          rows: parsedTable.rowCount,
          columns: parsedTable.columnCount,
        },
        'Parsed table'
      );
    } catch (error) {
      logger.error(
        { tableIndex: index, error: error.message },
        'Failed to parse table'
      );
    }
  });

  logger.info({ tableCount: tables.length }, 'Finished parsing tables');
  return tables;
}

/**
 * Extracts a specific table by index
 * @param {string} htmlContent - Page body HTML
 * @param {number} tableIndex - Target table index (0-based)
 * @returns {ParsedTable|null} Parsed table or null if not found
 */
export function extractTable(htmlContent, tableIndex) {
  const tables = parseTablesFromHtml(htmlContent);

  if (tableIndex >= tables.length) {
    logger.warn(
      {
        requested: tableIndex,
        available: tables.length,
      },
      'Table index out of range'
    );
    return null;
  }

  return tables[tableIndex];
}

/**
 * Converts a parsed table to a simple 2D array of strings
 * @param {ParsedTable} table - Parsed table
 * @returns {string[][]} 2D array of cell values
 */
export function tableToArray(table) {
  return table.rows.map((row) => row.cells.map((cell) => cell.text));
}

/**
 * Converts a parsed table to an array of objects (using headers as keys)
 * @param {ParsedTable} table - Parsed table
 * @returns {object[]} Array of row objects
 */
export function tableToObjects(table) {
  if (table.headers.length === 0) {
    logger.warn('No header row found, using column indices as keys');
  }

  const dataRows = table.rows.filter((row) => !row.isHeaderRow);
  const headers =
    table.headers.length > 0
      ? table.headers
      : Array.from({ length: table.columnCount }, (_, i) => `col_${i}`);

  return dataRows.map((row) => {
    const obj = {};
    row.cells.forEach((cell, cellIndex) => {
      const key = headers[cellIndex] || `col_${cellIndex}`;
      obj[key] = cell.text;
    });
    return obj;
  });
}

/**
 * Creates a normalized representation for comparison
 * @param {ParsedTable} table - Parsed table
 * @param {object} options - Normalization options
 * @param {number[]} [options.monitorColumns] - Specific columns to include
 * @param {boolean} [options.ignoreHeaders] - Exclude header row
 * @returns {object} Normalized table data
 */
export function normalizeTableForComparison(table, options = {}) {
  const { monitorColumns = [], ignoreHeaders = false } = options;

  let rows = table.rows;

  // Optionally exclude header rows
  if (ignoreHeaders) {
    rows = rows.filter((row) => !row.isHeaderRow);
  }

  // Map rows to normalized format
  const normalizedRows = rows.map((row) => {
    let cells = row.cells;

    // Filter to specific columns if specified
    if (monitorColumns.length > 0) {
      cells = cells.filter((_, index) => monitorColumns.includes(index));
    }

    return cells.map((cell) => cell.text);
  });

  return {
    tableIndex: table.index,
    headers: ignoreHeaders ? [] : table.headers,
    rows: normalizedRows,
    rowCount: normalizedRows.length,
    columnCount: normalizedRows.length > 0 ? normalizedRows[0].length : 0,
  };
}

export default {
  parseTablesFromHtml,
  extractTable,
  tableToArray,
  tableToObjects,
  normalizeTableForComparison,
};
