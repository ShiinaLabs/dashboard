export function getRouteMeasurement(path) {
  if (path === "/overview") {
    return {
      expectedApplicationRequests: 0,
      usefulContentSelector: '[data-overview-ready="true"]',
    };
  }
  return {
    expectedApplicationRequests: 1,
    usefulContentSelector: null,
  };
}
