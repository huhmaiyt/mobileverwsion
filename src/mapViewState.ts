/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MapViewState {
  center: [number, number];
  zoom: number;
}

// Strict geographic bounding box covering all 10 UAE municipalities with modest boundary margin
// South: 22.4°N (south of Liwa 23.13°N), North: 26.5°N (north of Ras Al Khaimah 25.79°N)
// West: 51.2°E (west of Ruwais 52.73°E), East: 56.8°E (east of Fujairah 56.33°E)
export const UAE_MAP_BOUNDS: [[number, number], [number, number]] = [
  [22.4, 51.2],
  [26.5, 56.8],
];

export const DEFAULT_UAE_VIEW: MapViewState = {
  center: [24.3, 54.5],
  zoom: 7.2,
};

// Map navigation boundaries: restricted to UAE exploration with solid bounds and calibrated zoom
export const MAP_ZOOM_BOUNDS = {
  minZoom: 6,
  maxZoom: 16,
  osmMaxNativeZoom: 19,
  ompsMaxNativeZoom: 6,
};

/**
 * Clamps coordinates strictly inside the permitted UAE geographic boundaries
 */
export function clampToUaeBounds(center: [number, number]): [number, number] {
  const [[minLat, minLon], [maxLat, maxLon]] = UAE_MAP_BOUNDS;
  const clampedLat = Math.min(Math.max(center[0], minLat), maxLat);
  const clampedLon = Math.min(Math.max(center[1], minLon), maxLon);
  return [
    Math.round(clampedLat * 10000) / 10000,
    Math.round(clampedLon * 10000) / 10000,
  ];
}

/**
 * Clamps zoom level within safe bounds preventing excessive zoom-out
 */
export function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MAP_ZOOM_BOUNDS.minZoom), MAP_ZOOM_BOUNDS.maxZoom);
}

let currentMapViewState: MapViewState = { ...DEFAULT_UAE_VIEW };

export function getMapViewState(): MapViewState {
  return {
    center: clampToUaeBounds(currentMapViewState.center),
    zoom: clampZoom(currentMapViewState.zoom),
  };
}

export function updateMapViewState(center: [number, number], zoom: number): void {
  currentMapViewState = {
    center: clampToUaeBounds(center),
    zoom: clampZoom(zoom),
  };
}

export function resetMapViewState(): MapViewState {
  currentMapViewState = { ...DEFAULT_UAE_VIEW };
  return { ...currentMapViewState };
}

