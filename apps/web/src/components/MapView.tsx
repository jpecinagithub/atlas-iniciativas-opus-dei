import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAtlas, filterInitiatives } from '../store';
import { categoryColor } from '../categories';
import { SelectedMarkerLayer } from '../map/threeMarker';
import type { Initiative } from '../types';

// Encuadres especiales: países cuyo bbox Natural Earth cruza el
// antimeridiano o incluye territorios muy dispersos. Se usa una vista
// principal documentada, no un promedio de puntos.
const VIEW_OVERRIDES: Record<string, { bounds: [number, number, number, number] }> = {
  RU: { bounds: [30, 41, 180, 78] },
  US: { bounds: [-125, 24, -66, 50] },
  NZ: { bounds: [166, -47.5, 179, -34] },
  FR: { bounds: [-5, 41, 10, 51.5] },
  ES: { bounds: [-18.5, 27.5, 4.5, 44] }, // incluye Canarias
  PT: { bounds: [-31.5, 32, -6, 42.5] }, // incluye Azores y Madeira
  CL: { bounds: [-76, -39, -66, -17] }, // sin Isla de Pascua en la vista principal
  EC: { bounds: [-81, -5.2, -75, 1.6] }, // sin Galápagos en la vista principal
};

function toFeatureCollection(items: Initiative[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items
      .filter((i) => i.lat !== null && i.lng !== null)
      .map((i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [i.lng as number, i.lat as number] },
        properties: { id: i.id, category: i.category, name: i.name, color: categoryColor(i.category) },
      })),
  };
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<SelectedMarkerLayer | null>(null);
  const readyRef = useRef(false);
  const catalog = useAtlas((s) => s.catalog);
  const countryCode = useAtlas((s) => s.countryCode);
  const categories = useAtlas((s) => s.categories);
  const query = useAtlas((s) => s.query);
  const selectedId = useAtlas((s) => s.selectedId);
  const camera = useAtlas((s) => s.camera);

  // ---- Creación del mapa (una sola vez)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const base = import.meta.env.BASE_URL || '/';
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#0a1120' } }],
      },
      center: [5, 22],
      zoom: 1.6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.GlobeControl(), 'top-right');

    map.on('load', async () => {
      try {
        map.setProjection({ type: 'globe' });
      } catch { /* proyección por defecto si no está disponible */ }
      try {
        (map as unknown as { setSky?: (s: Record<string, string | number>) => void }).setSky?.({
          'sky-color': '#0a1120', 'horizon-color': '#1c2f52', 'fog-color': '#0a1120',
          'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4,
        });
      } catch { /* atmósfera opcional */ }

      // Reticulado discreto: orienta en el globo sin inventar geografía.
      const graticule: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
      for (let lng = -180; lng < 180; lng += 20) {
        graticule.features.push({
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, k) => [lng, -90 + k * 2.5]) },
        });
      }
      for (let lat = -60; lat <= 60; lat += 20) {
        graticule.features.push({
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: Array.from({ length: 145 }, (_, k) => [-180 + k * 2.5, lat]) },
        });
      }
      map.addSource('reticulado', { type: 'geojson', data: graticule });
      map.addLayer({
        id: 'reticulado', type: 'line', source: 'reticulado',
        paint: { 'line-color': '#22345a', 'line-width': 0.7, 'line-opacity': 0.55 },
      });

      const res = await fetch(`${base}data/countries.geojson`);
      const countries = (await res.json()) as GeoJSON.FeatureCollection;
      map.addSource('countries', { type: 'geojson', data: countries });
      map.addLayer({
        id: 'paises-relleno', type: 'fill', source: 'countries',
        paint: {
          'fill-color': ['case', ['boolean', ['get', 'inDirectory'], false], '#1b2c4d', '#131e33'],
          'fill-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'paises-borde', type: 'line', source: 'countries',
        paint: { 'line-color': '#43598a', 'line-width': 0.6 },
      });
      map.addLayer({
        id: 'pais-seleccionado', type: 'line', source: 'countries',
        filter: ['==', ['get', 'code'], ''],
        paint: { 'line-color': '#f5c542', 'line-width': 1.8 },
      });

      map.addSource('iniciativas', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true, clusterRadius: 55, clusterMaxZoom: 13,
      });
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'iniciativas',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#2c4a7c',
          'circle-stroke-color': '#9db8e8', 'circle-stroke-width': 1,
          'circle-radius': ['step', ['get', 'point_count'], 15, 25, 21, 80, 27, 200, 34],
          'circle-opacity': 0.92,
        },
      });
      map.addLayer({
        id: 'puntos', type: 'circle', source: 'iniciativas',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3.2, 6, 5, 12, 7.5],
          'circle-stroke-color': '#0a1120', 'circle-stroke-width': 1.1,
          'circle-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'punto-seleccionado', type: 'circle', source: 'iniciativas',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': ['get', 'color'], 'circle-radius': 11,
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5,
        },
      });

      const marker = new SelectedMarkerLayer();
      markerRef.current = marker;
      try {
        map.addLayer(marker);
        (window as unknown as { __atlasMarker?: SelectedMarkerLayer }).__atlasMarker = marker;
      } catch (e) {
        // Si la capa 3D falla, el marcador nativo (punto-seleccionado) sigue.
        console.warn('Capa Three.js no disponible:', e);
      }
      readyRef.current = true;
      (window as unknown as { __atlasMap?: maplibregl.Map }).__atlasMap = map;

      // --- Interacciones
      map.on('click', 'clusters', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = (feature.properties as { cluster_id: number }).cluster_id;
        const source = map.getSource('iniciativas') as maplibregl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geom = feature.geometry as GeoJSON.Point;
          map.easeTo({ center: geom.coordinates as [number, number], zoom: Math.min(zoom + 0.5, 13) });
        }).catch(() => undefined);
      });
      map.on('click', 'puntos', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) useAtlas.getState().select(id);
      });
      map.on('click', 'paises-relleno', (e) => {
        const props = e.features?.[0]?.properties as { code?: string; inDirectory?: boolean } | undefined;
        if (props?.code && props.inDirectory) useAtlas.getState().setCountry(props.code);
      });
      for (const layer of ['puntos', 'clusters', 'paises-relleno']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
    });

    return () => {
      markerRef.current?.onRemove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Sincronizar puntos con los filtros
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !catalog) return;
    const apply = () => {
      if (!readyRef.current) return;
      const filtered = filterInitiatives(catalog.initiatives, countryCode, categories, query);
      const source = map.getSource('iniciativas') as maplibregl.GeoJSONSource | undefined;
      source?.setData(toFeatureCollection(filtered));
      const selLayer = map.getLayer('pais-seleccionado');
      if (selLayer) map.setFilter('pais-seleccionado', ['==', ['get', 'code'], countryCode ?? '']);
    };
    if (readyRef.current) apply();
    else {
      const t = setInterval(() => { if (readyRef.current) { apply(); clearInterval(t); } }, 250);
      return () => clearInterval(t);
    }
  }, [catalog, countryCode, categories, query]);

  // ---- Marcador 3D + halo del seleccionado
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !catalog) return;
    const apply = () => {
      if (!readyRef.current) return;
      const rec = selectedId ? catalog.initiatives.find((i) => i.id === selectedId) : undefined;
      if (map.getLayer('punto-seleccionado')) {
        map.setFilter('punto-seleccionado', ['==', ['get', 'id'], selectedId ?? '']);
      }
      if (rec && rec.lat !== null && rec.lng !== null) {
        markerRef.current?.setTarget(rec.lng, rec.lat, categoryColor(rec.category));
      } else {
        markerRef.current?.clearTarget();
      }
    };
    if (readyRef.current) apply();
    else {
      const t = setInterval(() => { if (readyRef.current) { apply(); clearInterval(t); } }, 250);
      return () => clearInterval(t);
    }
  }, [catalog, selectedId]);

  // ---- Cámara
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !camera || !catalog) return;
    const run = () => {
      if (!readyRef.current) return;
      if (camera.kind === 'world') {
        map.flyTo({ center: [5, 22], zoom: 1.6, pitch: 0, bearing: 0, duration: 1400, essential: true });
      } else if (camera.kind === 'country' && camera.countryCode) {
        const country = catalog.countries.find((c) => c.code === camera.countryCode);
        const override = VIEW_OVERRIDES[camera.countryCode];
        const bounds = override?.bounds ?? country?.bbox;
        if (bounds) {
          map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 36, duration: 1400 });
        }
      } else if (camera.kind === 'point' && camera.lng !== undefined && camera.lat !== undefined) {
        map.flyTo({ center: [camera.lng, camera.lat], zoom: Math.max(map.getZoom(), 7), duration: 1200, essential: true });
      }
    };
    if (readyRef.current) run();
    else {
      const t = setInterval(() => { if (readyRef.current) { run(); clearInterval(t); } }, 250);
      return () => clearInterval(t);
    }
  }, [camera, catalog]);

  return <div ref={containerRef} className="h-full w-full" role="application" aria-label="Mapa mundial de iniciativas" />;
}
