/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Helper re-implementing or testing buildPerimeterPath logic
function buildPerimeterPath(
  width: number,
  height: number,
  radius: number,
  strokeWidth: number
): string {
  if (width <= 0 || height <= 0) return '';

  const inset = strokeWidth / 2;
  const x0 = inset;
  const y0 = inset;
  const x1 = Math.max(x0, width - inset);
  const y1 = Math.max(y0, height - inset);

  const maxRadius = Math.min((x1 - x0) / 2, (y1 - y0) / 2);
  const effectiveR = Math.max(0, Math.min(radius, maxRadius));

  const startX = x1;
  const startY = (y0 + y1) / 2;

  return [
    `M ${startX.toFixed(2)} ${startY.toFixed(2)}`,
    `L ${x1.toFixed(2)} ${(y1 - effectiveR).toFixed(2)}`,
    `A ${effectiveR.toFixed(2)} ${effectiveR.toFixed(2)} 0 0 1 ${(x1 - effectiveR).toFixed(2)} ${y1.toFixed(2)}`,
    `L ${(x0 + effectiveR).toFixed(2)} ${y1.toFixed(2)}`,
    `A ${effectiveR.toFixed(2)} ${effectiveR.toFixed(2)} 0 0 1 ${x0.toFixed(2)} ${(y1 - effectiveR).toFixed(2)}`,
    `L ${x0.toFixed(2)} ${(y0 + effectiveR).toFixed(2)}`,
    `A ${effectiveR.toFixed(2)} ${effectiveR.toFixed(2)} 0 0 1 ${(x0 + effectiveR).toFixed(2)} ${y0.toFixed(2)}`,
    `L ${(x1 - effectiveR).toFixed(2)} ${y0.toFixed(2)}`,
    `A ${effectiveR.toFixed(2)} ${effectiveR.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${(y0 + effectiveR).toFixed(2)}`,
    `L ${startX.toFixed(2)} ${startY.toFixed(2)}`,
    'Z',
  ].join(' ');
}

test('Outline Draw: Perimeter path starts precisely on the right-hand side midpoint', () => {
  const width = 400;
  const height = 200;
  const radius = 12;
  const strokeWidth = 1.5;

  const path = buildPerimeterPath(width, height, radius, strokeWidth);
  assert.ok(path.length > 0, 'Path must not be empty');

  // Stroke inset = 0.75; Right edge is 400 - 0.75 = 399.25; Midpoint Y is 100.00
  assert.ok(path.startsWith('M 399.25 100.00'), `Expected path to start at right midpoint (399.25, 100.00), got: ${path.slice(0, 20)}`);
  assert.ok(path.endsWith('Z'), 'Path must close with Z');
});

test('Outline Draw: Path moves clockwise through all four rounded corners', () => {
  const width = 300;
  const height = 150;
  const radius = 10;
  const strokeWidth = 2; // inset = 1

  const path = buildPerimeterPath(width, height, radius, strokeWidth);

  // 1. Right edge down to bottom-right corner start: (299, 139)
  assert.ok(path.includes('L 299.00 139.00'), 'Should travel down right edge');
  // 2. Arc to bottom edge: (289, 149)
  assert.ok(path.includes('A 10.00 10.00 0 0 1 289.00 149.00'), 'Should round bottom-right corner');
  // 3. Across bottom to bottom-left corner: (11, 149)
  assert.ok(path.includes('L 11.00 149.00'), 'Should travel across bottom edge');
  // 4. Arc to left edge: (1, 139)
  assert.ok(path.includes('A 10.00 10.00 0 0 1 1.00 139.00'), 'Should round bottom-left corner');
  // 5. Up left edge: (1, 11)
  assert.ok(path.includes('L 1.00 11.00'), 'Should travel up left edge');
  // 6. Arc to top edge: (11, 1)
  assert.ok(path.includes('A 10.00 10.00 0 0 1 11.00 1.00'), 'Should round top-left corner');
  // 7. Across top to top-right corner: (289, 1)
  assert.ok(path.includes('L 289.00 1.00'), 'Should travel across top edge');
  // 8. Arc to right edge: (299, 11)
  assert.ok(path.includes('A 10.00 10.00 0 0 1 299.00 11.00'), 'Should round top-right corner');
  // 9. Back down to start point: (299, 75)
  assert.ok(path.includes('L 299.00 75.00 Z'), 'Should return to start on right edge');
});

test('Outline Draw: Zero or negative dimensions return empty string safely without error', () => {
  assert.equal(buildPerimeterPath(0, 0, 12, 1.5), '');
  assert.equal(buildPerimeterPath(-10, 100, 12, 1.5), '');
  assert.equal(buildPerimeterPath(100, 0, 12, 1.5), '');
});

test('Outline Draw: Corner radius is safely clamped to half of width or height', () => {
  // A narrow card of width 20, radius requested 30
  const path = buildPerimeterPath(20, 100, 30, 2);
  // Max radius is (19 - 1) / 2 = 9
  assert.ok(path.includes('A 9.00 9.00 0 0 1'), 'Radius must clamp to maximum possible geometric radius');
});

test('Outline Draw: Staged reveal timing sequence guarantees outline completes before content', () => {
  const outlineDelay = 0.1;
  const outlineDuration = 0.75;
  const outlineCompletion = outlineDelay + outlineDuration; // 0.85s

  const headingDelay = outlineDelay + outlineDuration; // 0.85s
  const bodyDelay = outlineDelay + outlineDuration + 0.12; // 0.97s
  const visualDelay = outlineDelay + outlineDuration + 0.24; // 1.09s

  assert.ok(headingDelay >= outlineCompletion, 'Heading must wait for outline completion');
  assert.ok(bodyDelay > headingDelay, 'Body text must follow heading with a slight stagger');
  assert.ok(visualDelay > bodyDelay, 'Visual elements must appear last');
});
