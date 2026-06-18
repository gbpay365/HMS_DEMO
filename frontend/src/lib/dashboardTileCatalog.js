import catalog from '../../../data/hub-catalog.json';

function color(token) {
  return catalog.tileColors[token] || catalog.tileColors.brand;
}

export const DASHBOARD_TILE_COLORS = { ...catalog.tileColors };

export const DASHBOARD_TILE_SECTIONS = catalog.dashboardSections.map((section) => ({
  ...section,
  tiles: section.tiles.map((tile) => ({
    ...tile,
    color: color(tile.colorToken),
  })),
}));
