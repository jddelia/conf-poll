/**
 * Table Parser Tests
 *
 * Tests for the Confluence HTML table parser.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  parseTablesFromHtml,
  extractTable,
  tableToArray,
  tableToObjects,
  normalizeTableForComparison,
} from './parser.js';

describe('Table Parser', () => {
  describe('parseTablesFromHtml', () => {
    it('should parse a simple table', () => {
      const html = `
        <table>
          <tr>
            <th>Name</th>
            <th>Status</th>
          </tr>
          <tr>
            <td>Task 1</td>
            <td>Complete</td>
          </tr>
          <tr>
            <td>Task 2</td>
            <td>Pending</td>
          </tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);

      assert.strictEqual(tables.length, 1);
      assert.strictEqual(tables[0].rowCount, 3);
      assert.strictEqual(tables[0].columnCount, 2);
      assert.deepStrictEqual(tables[0].headers, ['Name', 'Status']);
    });

    it('should handle multiple tables', () => {
      const html = `
        <table><tr><td>Table 1</td></tr></table>
        <table><tr><td>Table 2</td></tr></table>
        <table><tr><td>Table 3</td></tr></table>
      `;

      const tables = parseTablesFromHtml(html);

      assert.strictEqual(tables.length, 3);
      assert.strictEqual(tables[0].index, 0);
      assert.strictEqual(tables[1].index, 1);
      assert.strictEqual(tables[2].index, 2);
    });

    it('should handle empty HTML', () => {
      const tables = parseTablesFromHtml('');
      assert.strictEqual(tables.length, 0);
    });

    it('should handle null/undefined', () => {
      assert.strictEqual(parseTablesFromHtml(null).length, 0);
      assert.strictEqual(parseTablesFromHtml(undefined).length, 0);
    });

    it('should handle HTML with no tables', () => {
      const html = '<div><p>No tables here</p></div>';
      const tables = parseTablesFromHtml(html);
      assert.strictEqual(tables.length, 0);
    });

    it('should handle colspan and rowspan attributes', () => {
      const html = `
        <table>
          <tr>
            <td colspan="2">Merged cell</td>
          </tr>
          <tr>
            <td rowspan="2">Tall cell</td>
            <td>Cell 1</td>
          </tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);

      assert.strictEqual(tables[0].rows[0].cells[0].colSpan, 2);
      assert.strictEqual(tables[0].rows[1].cells[0].rowSpan, 2);
    });

    it('should clean and normalize cell text', () => {
      const html = `
        <table>
          <tr>
            <td>  Multiple   spaces  </td>
            <td>
              Newlines
              and
              whitespace
            </td>
          </tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);

      assert.strictEqual(tables[0].rows[0].cells[0].text, 'Multiple spaces');
      assert.strictEqual(tables[0].rows[0].cells[1].text, 'Newlines and whitespace');
    });

    it('should identify header rows', () => {
      const html = `
        <table>
          <tr>
            <th>Header 1</th>
            <th>Header 2</th>
          </tr>
          <tr>
            <td>Data 1</td>
            <td>Data 2</td>
          </tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);

      assert.strictEqual(tables[0].rows[0].isHeaderRow, true);
      assert.strictEqual(tables[0].rows[1].isHeaderRow, false);
    });
  });

  describe('extractTable', () => {
    const html = `
      <table><tr><td>First</td></tr></table>
      <table><tr><td>Second</td></tr></table>
    `;

    it('should extract table by index', () => {
      const table = extractTable(html, 0);
      assert.strictEqual(table.rows[0].cells[0].text, 'First');

      const table2 = extractTable(html, 1);
      assert.strictEqual(table2.rows[0].cells[0].text, 'Second');
    });

    it('should return null for out of range index', () => {
      const table = extractTable(html, 99);
      assert.strictEqual(table, null);
    });
  });

  describe('tableToArray', () => {
    it('should convert table to 2D array', () => {
      const html = `
        <table>
          <tr><td>A</td><td>B</td></tr>
          <tr><td>C</td><td>D</td></tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);
      const array = tableToArray(tables[0]);

      assert.deepStrictEqual(array, [
        ['A', 'B'],
        ['C', 'D'],
      ]);
    });
  });

  describe('tableToObjects', () => {
    it('should convert table to array of objects with headers', () => {
      const html = `
        <table>
          <tr><th>Name</th><th>Age</th></tr>
          <tr><td>Alice</td><td>30</td></tr>
          <tr><td>Bob</td><td>25</td></tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);
      const objects = tableToObjects(tables[0]);

      assert.deepStrictEqual(objects, [
        { Name: 'Alice', Age: '30' },
        { Name: 'Bob', Age: '25' },
      ]);
    });

    it('should use column indices when no headers', () => {
      const html = `
        <table>
          <tr><td>A</td><td>B</td></tr>
          <tr><td>C</td><td>D</td></tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);
      const objects = tableToObjects(tables[0]);

      assert.strictEqual(objects[0].col_0, 'A');
      assert.strictEqual(objects[0].col_1, 'B');
    });
  });

  describe('normalizeTableForComparison', () => {
    it('should normalize table with all columns', () => {
      const html = `
        <table>
          <tr><th>A</th><th>B</th></tr>
          <tr><td>1</td><td>2</td></tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);
      const normalized = normalizeTableForComparison(tables[0]);

      assert.deepStrictEqual(normalized.rows, [
        ['A', 'B'],
        ['1', '2'],
      ]);
    });

    it('should filter to specific columns', () => {
      const html = `
        <table>
          <tr><td>A</td><td>B</td><td>C</td></tr>
          <tr><td>1</td><td>2</td><td>3</td></tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);
      const normalized = normalizeTableForComparison(tables[0], {
        monitorColumns: [0, 2],
      });

      assert.deepStrictEqual(normalized.rows, [
        ['A', 'C'],
        ['1', '3'],
      ]);
    });

    it('should optionally ignore header rows', () => {
      const html = `
        <table>
          <tr><th>Header</th></tr>
          <tr><td>Data</td></tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html);
      const normalized = normalizeTableForComparison(tables[0], {
        ignoreHeaders: true,
      });

      assert.strictEqual(normalized.rows.length, 1);
      assert.deepStrictEqual(normalized.rows[0], ['Data']);
    });
  });

  describe('user mention handling', () => {
    it('should extract user display name from ac:plain-text-link-body', () => {
      const html = `
        <table>
          <tr>
            <td>
              <ac:link>
                <ri:user ri:userkey="402880824c1234" ri:account-id="5a1234"/>
                <ac:plain-text-link-body><![CDATA[John Doe]]></ac:plain-text-link-body>
              </ac:link>
            </td>
          </tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html, { showUserNames: true });
      assert.ok(tables[0].rows[0].cells[0].text.includes('@John Doe'));
    });

    it('should extract user display name from ac:link-body', () => {
      const html = `
        <table>
          <tr>
            <td>
              <ac:link>
                <ri:user ri:userkey="402880824c1234"/>
                <ac:link-body>Jane Smith</ac:link-body>
              </ac:link>
            </td>
          </tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html, { showUserNames: true });
      assert.ok(tables[0].rows[0].cells[0].text.includes('@Jane Smith'));
    });

    it('should redact user names when showUserNames is false', () => {
      const html = `
        <table>
          <tr>
            <td>
              <ac:link>
                <ri:user ri:userkey="402880824c1234"/>
                <ac:plain-text-link-body><![CDATA[John Doe]]></ac:plain-text-link-body>
              </ac:link>
            </td>
          </tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html, { showUserNames: false });
      assert.ok(tables[0].rows[0].cells[0].text.includes('@[redacted]'));
      assert.ok(!tables[0].rows[0].cells[0].text.includes('John Doe'));
    });

    it('should show user names by default', () => {
      const html = `
        <table>
          <tr>
            <td>
              <ac:link>
                <ri:user ri:userkey="402880824c1234"/>
                <ac:plain-text-link-body><![CDATA[Default User]]></ac:plain-text-link-body>
              </ac:link>
            </td>
          </tr>
        </table>
      `;

      // No options passed - should default to showing names
      const tables = parseTablesFromHtml(html);
      assert.ok(tables[0].rows[0].cells[0].text.includes('@Default User'));
    });

    it('should pass showUserNames option through extractTable', () => {
      const html = `
        <table>
          <tr>
            <td>
              <ac:link>
                <ri:user ri:userkey="402880824c1234"/>
                <ac:plain-text-link-body><![CDATA[Extract User]]></ac:plain-text-link-body>
              </ac:link>
            </td>
          </tr>
        </table>
      `;

      const table = extractTable(html, 0, { showUserNames: false });
      assert.ok(table.rows[0].cells[0].text.includes('@[redacted]'));
    });

    it('should use placeholder when no display name found', () => {
      const html = `
        <table>
          <tr>
            <td>
              <ac:link>
                <ri:user ri:userkey="402880824c1234"/>
              </ac:link>
            </td>
          </tr>
        </table>
      `;

      const tables = parseTablesFromHtml(html, { showUserNames: true });
      assert.ok(tables[0].rows[0].cells[0].text.includes('@[user]'));
    });
  });
});
