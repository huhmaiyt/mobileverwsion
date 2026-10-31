/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_UAE_VIEW,
  MAP_ZOOM_BOUNDS,
  UAE_MAP_BOUNDS,
  clampToUaeBounds,
  clampZoom,
  getMapViewState,
  resetMapViewState,
  updateMapViewState,
} from './mapViewState.ts';
import { getAerosolDetectionConfig, UAE_RASTER_BOUNDS } from './overlayService.ts';
import { CITIES } from './config.ts';

test('Map View State: initial view state defaults to UAE center and zoom', () => {
  resetMapViewState();
  const current = getMapViewState();

  assert.deepEqual(current.center, [24.3, 54.5], 'Default center must be UAE centroid [24.3, 54.5]');
  assert.equal(current.zoom, 7.2, 'Default zoom must be 7.2 for full country overview');
  assert.deepEqual(current, DEFAULT_UAE_VIEW, 'Current view state must equal DEFAULT_UAE_VIEW on clean start');
});

test('Map View State: updateMapViewState persists user pan and zoom within UAE boundaries', () => {
  resetMapViewState();

  // User zooms into Downtown Dubai (25.1972, 55.2744) - within UAE
  const dubaiCoord: [number, number] = [25.1972, 55.2744];
  const dubaiZoom = 14;

  updateMapViewState(dubaiCoord, dubaiZoom);

  const updated = getMapViewState();
  assert.deepEqual(updated.center, dubaiCoord, 'Stored center must reflect user pan to Dubai');
  assert.equal(updated.zoom, dubaiZoom, 'Stored zoom must reflect user zoom to 14');
});

test('Map View State: clampToUaeBounds strictly restricts coordinates outside UAE borders', () => {
  resetMapViewState();

  // Coordinates far out in Arabian Gulf or neighboring territory must be clamped to UAE bounds
  const farNorthEast: [number, number] = [29.0, 59.0];
  const clampedNE = clampToUaeBounds(farNorthEast);
  assert.equal(clampedNE[0], UAE_MAP_BOUNDS[1][0], 'Latitude must be clamped to north boundary 26.5');
  assert.equal(clampedNE[1], UAE_MAP_BOUNDS[1][1], 'Longitude must be clamped to east boundary 56.8');

  const farSouthWest: [number, number] = [20.0, 48.0];
  const clampedSW = clampToUaeBounds(farSouthWest);
  assert.equal(clampedSW[0], UAE_MAP_BOUNDS[0][0], 'Latitude must be clamped to south boundary 22.4');
  assert.equal(clampedSW[1], UAE_MAP_BOUNDS[0][1], 'Longitude must be clamped to west boundary 51.2');

  // Attempting to update view state with out-of-bounds coordinates must store clamped coordinates
  updateMapViewState(farNorthEast, 8);
  const state = getMapViewState();
  assert.deepEqual(state.center, [26.5, 56.8], 'Saved center must be clamped within UAE bounds');
});

test('Map View Boundaries: UAE_MAP_BOUNDS encompasses all 10 supported UAE monitoring stations', () => {
  const [[minLat, minLon], [maxLat, maxLon]] = UAE_MAP_BOUNDS;

  assert.equal(CITIES.length, 10, 'Must have 10 supported UAE cities');

  CITIES.forEach((city) => {
    assert.ok(
      city.latitude >= minLat && city.latitude <= maxLat,
      `City ${city.name} latitude ${city.latitude} must be within UAE bounds [${minLat}, ${maxLat}]`
    );
    assert.ok(
      city.longitude >= minLon && city.longitude <= maxLon,
      `City ${city.name} longitude ${city.longitude} must be within UAE bounds [${minLon}, ${maxLon}]`
    );
  });
});

test('Map View State: simulating component remount preserves user coordinates across tab switches', () => {
  resetMapViewState();

  // User navigates to Abu Dhabi Corniche
  const abuDhabiCoord: [number, number] = [24.4667, 54.3667];
  const detailZoom = 13;
  updateMapViewState(abuDhabiCoord, detailZoom);

  // Simulate tab navigation away (e.g. to School Mode) and back to MapScreen:
  const restoredState = getMapViewState();

  assert.deepEqual(restoredState.center, abuDhabiCoord, 'Remounted map must restore user center coordinates');
  assert.equal(restoredState.zoom, detailZoom, 'Remounted map must restore user zoom level');
  assert.notDeepEqual(restoredState, DEFAULT_UAE_VIEW, 'Remounted map must NOT discard user view in favor of default');
});

test('Map View State: resetMapViewState explicitly returns to DEFAULT_UAE_VIEW', () => {
  // Move to a location within UAE bounds
  updateMapViewState([25.0, 55.0], 11);
  assert.notDeepEqual(getMapViewState(), DEFAULT_UAE_VIEW);

  // User clicks "Reset to UAE"
  const resetResult = resetMapViewState();
  assert.deepEqual(resetResult, DEFAULT_UAE_VIEW);
  assert.deepEqual(getMapViewState(), DEFAULT_UAE_VIEW);
});

test('Map View Limits: minZoom 6 keeps map focused on UAE and maxZoom 16 allows local detail', () => {
  assert.equal(MAP_ZOOM_BOUNDS.minZoom, 6, 'minZoom must be 6 to keep map framed on UAE');
  assert.equal(MAP_ZOOM_BOUNDS.maxZoom, 16, 'maxZoom must allow high-detail neighborhood inspection');
  assert.ok(MAP_ZOOM_BOUNDS.osmMaxNativeZoom >= MAP_ZOOM_BOUNDS.maxZoom, 'OSM tile server maxNativeZoom must cover map maxZoom');

  // clampZoom respects boundaries
  assert.equal(clampZoom(2), 6, 'Zoom below minZoom must clamp to 6');
  assert.equal(clampZoom(20), 16, 'Zoom above maxZoom must clamp to 16');
  assert.equal(clampZoom(10), 10, 'Zoom within bounds must remain unchanged');
});

test('Satellite Overlay Compatibility: NASA OMPS config specifies Level 6 WMTS with maxNativeZoom 6 fallback', () => {
  const config = getAerosolDetectionConfig('2026-10-28');

  // Verify WMTS tile URL contains Level 6 GoogleMapsCompatible projection
  assert.ok(config.tileUrl.includes('GoogleMapsCompatible_Level6'));

  // NASA GIBS OMPS Level 3 tiles in GoogleMapsCompatible_Level6 only exist natively up to zoom 6
  assert.equal(MAP_ZOOM_BOUNDS.ompsMaxNativeZoom, 6, 'NASA GIBS Level 6 tile matrix max native zoom must be 6');
  const mapMaxZoom = 16;
  assert.ok(MAP_ZOOM_BOUNDS.ompsMaxNativeZoom < mapMaxZoom, 'Leaflet must upscale OMPS tiles beyond zoom 6 without blank 400s');
});

test('Raster Overlays: UAE_RASTER_BOUNDS maintains geographic anchor during map navigation', () => {
  const [[south, west], [north, east]] = UAE_RASTER_BOUNDS;

  assert.equal(south, 22.5);
  assert.equal(west, 51.3);
  assert.equal(north, 26.3);
  assert.equal(east, 56.6);

  // Anchor is defined in geographic WGS84 degrees, so Leaflet ImageOverlay scales and pans with map projection
  assert.ok(north > south, 'Raster north bound must exceed south bound');
  assert.ok(east > west, 'Raster east bound must exceed west bound');
});

