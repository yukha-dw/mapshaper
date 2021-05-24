import { getPreciseGeodeticSegmentFunction, getFastGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
import { getBufferDistanceFunction } from '../buffer/mapshaper-buffer-common';
import { importGeoJSON } from '../geojson/geojson-import';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { removePolylineCrosses, removePolygonCrosses, countCrosses }
  from '../geom/mapshaper-antimeridian';
import { getCRS } from '../crs/mapshaper-projections';
import { getSphericalPathArea2 } from '../geom/mapshaper-polygon-geom';
import { PointIter } from '../paths/mapshaper-shape-iter';

function ringArea(ring) {
  var iter = new PointIter(ring);
  return getSphericalPathArea2(iter);
}

export function makePointBuffer(lyr, dataset, opts) {
  var geojson = makePointBufferGeoJSON(lyr, dataset, opts);
  return importGeoJSON(geojson, {});
}

// Make a single geodetic circle
export function getCircleGeoJSON(center, radius, vertices, opts) {
  var n = vertices || 360;
  var geod = getPreciseGeodeticSegmentFunction(getCRS('wgs84')); // ?
  if (opts.inset) {
    radius -= opts.inset;
  }
  return opts.geometry_type == 'polyline' ?
    getPointBufferLineString([center], radius, n, geod) :
    getPointBufferPolygon([center], radius, n, geod);
}

// Convert a point layer to circles
function makePointBufferGeoJSON(lyr, dataset, opts) {
  var vertices = opts.vertices || 72;
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var geod = getPreciseGeodeticSegmentFunction(getDatasetCRS(dataset));
  var geometries = lyr.shapes.map(function(shape, i) {
    var dist = distanceFn(i);
    if (!dist || !shape) return null;
    return getPointBufferPolygon(shape, dist, vertices, geod);
  });
  // TODO: make sure that importer supports null geometries (nonstandard GeoJSON);
  return {
    type: 'GeometryCollection',
    geometries: geometries
  };
}

export function getPointBufferPolygon(points, distance, vertices, geod) {
  var rings = [], coords, coords2;
  if (!points || !points.length) return null;
  for (var i=0; i<points.length; i++) {
    coords = getPointBufferCoordinates(points[i], distance, vertices, geod);
    if (countCrosses(coords) > 0) {
      coords2 = removePolygonCrosses([coords]);
      while (coords2.length > 0) rings.push([coords2.pop()]); // geojson polygon coords, no hole
    } else if (ringArea(coords) < 0) {
      // negative spherical area: CCW ring, indicating a circle of >180 degrees
      // that fully encloses both poles and the antimeridian.
      // need to add an enclosure around the entire sphere
      // TODO: compare to distance param as a sanity check
      rings.push([
        [[180, 90], [180, -90], [0, -90], [-180, -90], [-180, 90], [0, 90], [180, 90]],
        coords
        ]);
    } else {
      rings.push([coords]);
    }
  }
  return {
    type: 'MultiPolygon',
    coordinates: rings
  };
}

export function getPointBufferLineString(points, distance, vertices, geod) {
  var rings = [], coords;
  if (!points || !points.length) return null;
  for (var i=0; i<points.length; i++) {
    coords = getPointBufferCoordinates(points[i], distance, vertices, geod);
    coords = removePolylineCrosses(coords);
    while (coords.length > 0) rings.push(coords.pop());
  }
  return rings.length == 1 ? {
    type: 'LineString',
    coordinates: rings[0]
  } : {
    type: 'MultiLineString',
    coordinates: rings
  };
}

// Returns GeoJSON MultiPolygon coordinates
function getPointBufferCoordinates(center, meterDist, vertices, geod) {
  var coords = [],
      angle = 360 / vertices;
  for (var i=0; i<vertices; i++) {
    coords.push(geod(center[0], center[1], i * angle, meterDist));
  }
  coords.push(coords[0].concat());
  return coords;
}
