/**
 * Change Detection Tests
 *
 * Tests for the table comparison and diff engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  compareTableData,
  formatChangeReport,
  createNotificationMessage,
} from './comparator.js';

describe('Comparator', () => {
  describe('compareTableData', () => {
    it('should detect no changes when data is identical', () => {
      const oldData = {
        rows: [
          ['A', 'B'],
          ['C', 'D'],
        ],
      };
      const newData = {
        rows: [
          ['A', 'B'],
          ['C', 'D'],
        ],
      };

      const report = compareTableData(oldData, newData);

      assert.strictEqual(report.hasChanges, false);
      assert.strictEqual(report.totalChanges, 0);
    });

    it('should detect modified cells', () => {
      const oldData = {
        rows: [
          ['A', 'B'],
          ['C', 'D'],
        ],
      };
      const newData = {
        rows: [
          ['A', 'X'],
          ['C', 'D'],
        ],
      };

      const report = compareTableData(oldData, newData);

      assert.strictEqual(report.hasChanges, true);
      assert.strictEqual(report.stats.cellsModified, 1);
      assert.strictEqual(report.cellsModified[0].row, 0);
      assert.strictEqual(report.cellsModified[0].column, 1);
      assert.strictEqual(report.cellsModified[0].oldValue, 'B');
      assert.strictEqual(report.cellsModified[0].newValue, 'X');
    });

    it('should detect added rows', () => {
      const oldData = {
        rows: [['A', 'B']],
      };
      const newData = {
        rows: [
          ['A', 'B'],
          ['C', 'D'],
        ],
      };

      const report = compareTableData(oldData, newData);

      assert.strictEqual(report.hasChanges, true);
      assert.strictEqual(report.stats.rowsAdded, 1);
      assert.deepStrictEqual(report.rowsAdded[0].values, ['C', 'D']);
    });

    it('should detect removed rows', () => {
      const oldData = {
        rows: [
          ['A', 'B'],
          ['C', 'D'],
        ],
      };
      const newData = {
        rows: [['A', 'B']],
      };

      const report = compareTableData(oldData, newData);

      assert.strictEqual(report.hasChanges, true);
      assert.strictEqual(report.stats.rowsRemoved, 1);
      assert.deepStrictEqual(report.rowsRemoved[0].values, ['C', 'D']);
    });

    it('should detect multiple types of changes', () => {
      const oldData = {
        rows: [
          ['A', 'B'],
          ['C', 'D'],
          ['E', 'F'],
        ],
      };
      const newData = {
        rows: [
          ['A', 'X'],
          ['C', 'D'],
          ['G', 'H'],
          ['I', 'J'],
        ],
      };

      const report = compareTableData(oldData, newData);

      assert.strictEqual(report.hasChanges, true);
      assert.strictEqual(report.stats.cellsModified, 3); // B->X, E->G, F->H
      assert.strictEqual(report.stats.rowsAdded, 1); // ['I', 'J']
      assert.strictEqual(report.stats.rowsRemoved, 0);
    });

    it('should handle initial data (no old data)', () => {
      const newData = {
        rows: [
          ['A', 'B'],
          ['C', 'D'],
        ],
      };

      const report = compareTableData(null, newData);

      assert.strictEqual(report.hasChanges, true);
      assert.strictEqual(report.stats.rowsAdded, 2);
      assert.ok(report.summary.includes('Initial'));
    });

    it('should handle empty new data', () => {
      const oldData = {
        rows: [['A', 'B']],
      };

      const report = compareTableData(oldData, null);

      assert.strictEqual(report.hasChanges, false);
      assert.ok(report.summary.includes('empty'));
    });

    it('should include headers in cell change info', () => {
      const oldData = { rows: [['old']] };
      const newData = { rows: [['new']] };
      const options = { headers: ['Status'] };

      const report = compareTableData(oldData, newData, options);

      assert.strictEqual(report.cellsModified[0].columnHeader, 'Status');
    });
  });

  describe('formatChangeReport', () => {
    it('should format empty report', () => {
      const report = {
        hasChanges: false,
        summary: 'No changes detected',
      };

      const formatted = formatChangeReport(report);
      assert.ok(formatted.includes('No changes detected'));
    });

    it('should format report with changes', () => {
      const report = {
        hasChanges: true,
        summary: '1 cell(s) modified',
        totalChanges: 1,
        stats: { rowsAdded: 0, rowsRemoved: 0, cellsModified: 1 },
        rowsAdded: [],
        rowsRemoved: [],
        cellsModified: [
          {
            row: 0,
            column: 1,
            columnHeader: 'Status',
            oldValue: 'Pending',
            newValue: 'Complete',
          },
        ],
      };

      const formatted = formatChangeReport(report);

      assert.ok(formatted.includes('CHANGES DETECTED'));
      assert.ok(formatted.includes('Pending'));
      assert.ok(formatted.includes('Complete'));
      assert.ok(formatted.includes('Status'));
    });
  });

  describe('createNotificationMessage', () => {
    it('should return null for no changes', () => {
      const report = { hasChanges: false };
      const message = createNotificationMessage(report);
      assert.strictEqual(message, null);
    });

    it('should include page title when provided', () => {
      const report = {
        hasChanges: true,
        summary: '1 change',
        stats: { rowsAdded: 0, rowsRemoved: 0, cellsModified: 0 },
        cellsModified: [],
        rowsAdded: [],
        rowsRemoved: [],
      };

      const message = createNotificationMessage(report, {
        pageTitle: 'Test Page',
        version: 42,
      });

      assert.ok(message.includes('Test Page'));
      assert.ok(message.includes('v42'));
    });
  });
});
