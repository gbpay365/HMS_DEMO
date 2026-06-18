'use strict';

const catalog = require('../data/hub-catalog.json');

function color(token) {
  return catalog.tileColors[token] || catalog.tileColors.brand;
}

function withColors(items) {
  return items.map((item) => ({
    ...item,
    color: color(item.colorToken),
  }));
}

function getHubStats() {
  return withColors(catalog.hubStats);
}

function getHubModuleCards() {
  return withColors(catalog.hubModuleCards);
}

function getDashboardSections() {
  return catalog.dashboardSections.map((section) => ({
    ...section,
    tiles: withColors(section.tiles),
  }));
}

function getOdooAppTiles() {
  return withColors(catalog.odooAppTiles);
}

function getTileColors() {
  return { ...catalog.tileColors };
}

module.exports = {
  catalog,
  color,
  getHubStats,
  getHubModuleCards,
  getDashboardSections,
  getOdooAppTiles,
  getTileColors,
};
