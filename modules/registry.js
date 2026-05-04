/**
 * Studio.lab module registry.
 *
 * Each isolated-world feature file registers a descriptor here. content.js only
 * reads descriptors and delegates lifecycle/actions back to the module.
 */
(function () {
  'use strict';

  const modules = [];

  function registerModule(module) {
    if (!module || !module.id) return;
    if (modules.some(item => item.id === module.id)) return;
    modules.push(module);
  }

  function getModules() {
    return modules
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  window.StudioLab = Object.assign(window.StudioLab || {}, {
    registerModule,
    getModules
  });
})();
