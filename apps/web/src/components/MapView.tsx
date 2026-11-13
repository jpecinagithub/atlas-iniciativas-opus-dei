import { useCallback, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre GL JS 6 carga su worker desde un módulo aparte que el empaquetado
// no copia junto al chunk: hay que darle la URL del asset emitido por Vite.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);
import { useAtlas, filterInitiatives } from '../store';
import { categoryColor } from '../categories';
// Solo el tipo: la implementación (Three.js) se carga bajo demanda en
// su propio chunk la primera vez que hay una selección con ubicación,
// en vez de engordar el chunk del mapa para todos los visitantes.
import type { SelectedMarkerLayer } from '../map/threeMarker';
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
        properties: {
          id: i.id, category: i.category, name: i.name,
          locality: i.locality ?? '',
          color: categoryColor(i.category),
        },
      })),
  };
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<SelectedMarkerLayer | null>(null);
  const markerLoadRef = useRef<Promise<SelectedMarkerLayer | null> | null>(null);

  // Carga perezosa de la capa Three.js (chunk aparte): el halo nativo
  // cubre la selección mientras el chunk llega.
  const ensureMarker = (): Promise<SelectedMarkerLayer | null> => {
    if (markerRef.current) return Promise.resolve(markerRef.current);
    if (!markerLoadRef.current) {
      markerLoadRef.current = import('../map/threeMarker')
        .then(({ SelectedMarkerLayer: Layer }) => {
          const map = mapRef.current;
          if (!map || markerRef.current) return markerRef.current;
          const marker = new Layer();
          try {
            map.addLayer(marker);
            markerRef.current = marker;
            (window as unknown as { __atlasMarker?: SelectedMarkerLayer }).__atlasMarker = marker;
            return marker;
          } catch (e) {
            // Si la capa 3D falla, el marcador nativo (punto-seleccionado) sigue.
            console.warn('Capa Three.js no disponible:', e);
            return null;
          }
        })
        .catch(() => null);
    }
    return markerLoadRef.current;
  };
  const readyRef = useRef(false);
  const catalog = useAtlas((s) => s.catalog);
  const countryCode = useAtlas((s) => s.countryCode);
  const categories = useAtlas((s) => s.categories);
  const query = useAtlas((s) => s.query);
  const selectedId = useAtlas((s) => s.selectedId);
  const camera = useAtlas((s) => s.camera);
  const coincident = useAtlas((s) => s.coincident);
  // Referencia del spiderfy abierto: zoom y píxel del ancla EN EL
  // MOMENTO DE ABRIRLO. En 'moveend' se compara contra ella para
  // decidir si el movimiento cierra el despliegue (umbral) o solo
  // hay que recolocar el círculo; no se rearma con movimientos
  // menores, para que la deriva acumulada también cuente.
  const spiderRef = useRef<{ zoom0: number; pixel0: { x: number; y: number }; anchor: [number, number] } | null>(null);

  /**
   * Pinta (o limpia) el spiderfy del grupo coincidente: puntos
   * desplazados en un círculo EN PÍXELES alrededor del ancla
   * (project/unproject) y una línea fina de cada punto al ancla.
   * Radio adaptado al número de iniciativas: r = 34 + 3·N px con
   * tope de 96 px (con 24 iniciativas, la separación entre vecinos
   * sigue siendo ≈25 px). Los desplazamientos son exclusivamente
   * visuales y temporales: nunca se escriben en los datos.
   */
  const layoutSpiderfy = useCallback((keepReference = false) => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const pts = map.getSource('desplegados') as maplibregl.GeoJSONSource | undefined;
    const lines = map.getSource('desplegados-lineas') as maplibregl.GeoJSONSource | undefined;
    if (!pts || !lines) return;
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    const st = useAtlas.getState();
    const group = st.coincident;
    if (!group || !st.catalog) {
      pts.setData(empty);
      lines.setData(empty);
      spiderRef.current = null;
      return;
    }
    const [lng, lat] = group.anchor;
    const center = map.project([lng, lat]);
    const n = group.ids.length;
    const radius = Math.min(34 + 3 * n, 96);
    const features: GeoJSON.Feature[] = [];
    const lineFeatures: GeoJSON.Feature[] = [];
    group.ids.forEach((id, idx) => {
      const rec = st.catalog?.initiatives.find((i) => i.id === id);
      if (!rec) return;
      // Con 2 iniciativas el despliegue es horizontal (una a cada
      // lado); con más, círculo repartido desde arriba.
      const angle = n === 2
        ? (idx === 0 ? Math.PI : 0)
        : -Math.PI / 2 + (idx * 2 * Math.PI) / n;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const ll = map.unproject([center.x + radius * dx, center.y + radius * dy]);
      // Lado dominante del despliegue: la etiqueta del punto se
      // ancla hacia FUERA (lejos del ancla) según ese lado, para que
      // los nombres no se amontonen sobre el centro del spiderfy
      // (corrección pedida por Jon, 2026-11-13).
      const side = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 't' : 'b') : (dx < 0 ? 'l' : 'r');
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
        properties: {
          id: rec.id, category: rec.category, name: rec.name,
          locality: rec.locality ?? '', color: categoryColor(rec.category), side,
        },
      });
      lineFeatures.push({
        type: 'Feature', properties: { id: rec.id },
        geometry: { type: 'LineString', coordinates: [[lng, lat], [ll.lng, ll.lat]] },
      });
    });
    pts.setData({ type: 'FeatureCollection', features });
    lines.setData({ type: 'FeatureCollection', features: lineFeatures });
    if (!keepReference || !spiderRef.current) {
      spiderRef.current = { zoom0: map.getZoom(), pixel0: { x: center.x, y: center.y }, anchor: group.anchor };
    }
  }, []);

  // ---- Creación del mapa (una sola vez)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const base = import.meta.env.BASE_URL || '/';
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        // Glifos SDF autoalojados (Noto Sans, generados en tools/fonts):
        // las etiquetas no dependen de ningún servidor externo.
        glyphs: `${base}glyphs/{fontstack}/{range}.pbf`,
        sources: {},
        layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#04070d' } }],
      },
      center: [5, 22],
      zoom: 1.6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // El lienzo debe poder recibir el foco por programa (volver
    // desde el selector de coincidentes al cerrarlo con Escape).
    if (!map.getCanvas().hasAttribute('tabindex')) map.getCanvas().setAttribute('tabindex', '-1');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.GlobeControl(), 'top-right');

    map.on('load', async () => {
      try {
        map.setProjection({ type: 'globe' });
      } catch { /* proyección por defecto si no está disponible */ }
      try {
        (map as unknown as { setSky?: (s: Record<string, string | number>) => void }).setSky?.({
          'sky-color': '#04070d', 'horizon-color': '#16294d', 'fog-color': '#04070d',
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
        paint: { 'line-color': '#1d3157', 'line-width': 0.7, 'line-opacity': 0.5 },
      });

      const res = await fetch(`${base}data/countries.geojson`);
      const countries = (await res.json()) as GeoJSON.FeatureCollection;
      map.addSource('countries', { type: 'geojson', data: countries });
      map.addLayer({
        id: 'paises-relleno', type: 'fill', source: 'countries',
        paint: {
          'fill-color': ['case', ['boolean', ['get', 'inDirectory'], false], '#16294d', '#0d1830'],
          'fill-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'paises-borde', type: 'line', source: 'countries',
        paint: { 'line-color': '#2a4a7f', 'line-width': 0.7 },
      });
      map.addLayer({
        id: 'pais-seleccionado-relleno', type: 'fill', source: 'countries',
        filter: ['==', ['get', 'code'], ''],
        paint: { 'fill-color': '#e8a33d', 'fill-opacity': 0.07 },
      });
      map.addLayer({
        id: 'pais-seleccionado', type: 'line', source: 'countries',
        filter: ['==', ['get', 'code'], ''],
        paint: { 'line-color': '#e8a33d', 'line-width': 2 },
      });

      // Etiquetas de país: un punto por país del directorio (el mayor
      // polígono), con su nombre en español; ver tools/data/build_labels.py.
      const labelsRes = await fetch(`${base}data/countries-labels.geojson`);
      const countryLabels = (await labelsRes.json()) as GeoJSON.FeatureCollection;
      map.addSource('etiquetas-paises', { type: 'geojson', data: countryLabels });
      map.addLayer({
        id: 'etiquetas-paises', type: 'symbol', source: 'etiquetas-paises',
        maxzoom: 6.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1.2, 9.5, 3, 12.5, 5.5, 14.5],
          'text-letter-spacing': 0.07,
          'text-transform': 'uppercase',
          'text-max-width': 9,
        },
        paint: {
          'text-color': '#b9c9e2',
          'text-halo-color': '#04070d',
          'text-halo-width': 1.3,
        },
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
          'circle-color': '#e8a33d',
          'circle-stroke-color': '#e8a33d', 'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 15, 25, 21, 80, 27, 200, 34],
          'circle-opacity': 0.14, 'circle-stroke-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'puntos', type: 'circle', source: 'iniciativas',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3.2, 6, 5, 12, 7.5],
          'circle-stroke-color': '#04070d', 'circle-stroke-width': 1.1,
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
      // Conteo dentro de cada agrupación (sin glifos era imposible).
      map.addLayer({
        id: 'clusters-conteo', type: 'symbol', source: 'iniciativas',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12.5,
        },
        paint: { 'text-color': '#f5d9a8', 'text-halo-color': '#04070d', 'text-halo-width': 0.9 },
      });
      // Nombre de la localidad bajo cada punto al acercar.
      map.addLayer({
        id: 'etiquetas-localidades', type: 'symbol', source: 'iniciativas',
        filter: ['!', ['has', 'point_count']],
        minzoom: 5,
        layout: {
          'text-field': ['get', 'locality'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.15],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-optional': true,
        },
        paint: {
          'text-color': '#e8eef7',
          'text-halo-color': '#04070d',
          'text-halo-width': 1.2,
        },
      });

      // Spiderfy de iniciativas coincidentes (hotfix Fase 7):
      // fuentes temporales propias, vacías hasta que se abre un
      // grupo. Los puntos desplegados se pintan sobre el resto de
      // capas de puntos para que el hit-test los priorice.
      map.addSource('desplegados-lineas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('desplegados', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'desplegados-lineas', type: 'line', source: 'desplegados-lineas',
        paint: { 'line-color': '#f5d9a8', 'line-width': 1, 'line-opacity': 0.55 },
      });
      map.addLayer({
        id: 'desplegados', type: 'circle', source: 'desplegados',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 8.5,
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.6,
          'circle-opacity': 1,
        },
      });
      // Etiquetas de los puntos desplegados: una capa por lado
      // dominante, cada una anclada hacia fuera del ancla (la
      // propiedad `side` la calcula layoutSpiderfy). Así ningún
      // nombre se pinta sobre el centro del despliegue.
      const labelPaint = { 'text-color': '#e8eef7', 'text-halo-color': '#04070d', 'text-halo-width': 1.2 };
      const labelLayout = (anchor: string, offset: [number, number]) => ({
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': offset,
        'text-anchor': anchor,
        'text-max-width': 12,
        'text-optional': true,
      });
      map.addLayer({
        id: 'desplegados-nombres-t', type: 'symbol', source: 'desplegados',
        filter: ['==', ['get', 'side'], 't'],
        layout: labelLayout('bottom', [0, -1.05]) as never, paint: labelPaint as never,
      });
      map.addLayer({
        id: 'desplegados-nombres-b', type: 'symbol', source: 'desplegados',
        filter: ['==', ['get', 'side'], 'b'],
        layout: labelLayout('top', [0, 1.35]) as never, paint: labelPaint as never,
      });
      map.addLayer({
        id: 'desplegados-nombres-l', type: 'symbol', source: 'desplegados',
        filter: ['==', ['get', 'side'], 'l'],
        layout: labelLayout('right', [-1.05, 0]) as never, paint: labelPaint as never,
      });
      map.addLayer({
        id: 'desplegados-nombres-r', type: 'symbol', source: 'desplegados',
        filter: ['==', ['get', 'side'], 'r'],
        layout: labelLayout('left', [1.05, 0]) as never, paint: labelPaint as never,
      });

      const notifyExplored = () => window.dispatchEvent(new Event('atlas:explored'));
      map.once('dragstart', notifyExplored);
      map.once('zoomstart', notifyExplored);
      map.once('wheel', notifyExplored);

      // La capa Three.js ya no se crea aquí: se carga bajo demanda
      // (ensureMarker) cuando aparece la primera selección ubicada.
      readyRef.current = true;
      (window as unknown as { __atlasMap?: maplibregl.Map }).__atlasMap = map;

      // --- Interacciones (hotfix Fase 7)
      // Un solo manejador de clic con hit-test unificado y
      // prioridades deterministas: desplegados (spiderfy) >
      // clusters > puntos > países. Antes cada capa tenía su
      // propio manejador y un clic sobre un punto también podía
      // disparar la selección de país que había debajo.
      const openGroupFor = (records: Initiative[]) => {
        const first = records[0];
        if (!first || first.lat === null || first.lng === null) return;
        useAtlas.getState().openCoincident({
          anchor: [first.lng, first.lat],
          ids: records.map((r) => r.id),
          locality: first.locality ?? first.country,
        });
      };

      const onClusterClick = (feature: maplibregl.MapGeoJSONFeature) => {
        const clusterId = (feature.properties as { cluster_id: number }).cluster_id;
        const center = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        const source = map.getSource('iniciativas') as maplibregl.GeoJSONSource;
        Promise.all([
          source.getClusterExpansionZoom(clusterId),
          source.getClusterLeaves(clusterId, 10000, 0),
        ]).then(([expansionZoom, leaves]) => {
          const st = useAtlas.getState();
          const recs = leaves
            .map((leaf) => st.catalog?.initiatives.find((i) => i.id === (leaf.properties as { id?: string }).id))
            .filter((r): r is Initiative => !!r);
          const first = recs[0];
          if (!first) {
            map.easeTo({ center, zoom: expansionZoom + 0.5 });
            return;
          }
          // Todas las hojas en la MISMA coordenada exacta: la
          // precisión es de localidad y acercar nunca las
          // separará. Se abre el spiderfy + selector en vez de
          // seguir haciendo zoom (el antiguo tope en
          // clusterMaxZoom dejaba este caso en bucle).
          if (recs.every((r) => r.lng === first.lng && r.lat === first.lat)) {
            openGroupFor(recs);
            return;
          }
          // Clúster con coordenadas distintas: UNA sola
          // aproximación al zoom real de expansión (+0,5 de
          // margen), sin tope en clusterMaxZoom. El máximo con
          // zoom actual + 0,5 garantiza que siempre hay progreso.
          const target = Math.max(expansionZoom + 0.5, map.getZoom() + 0.5);
          map.easeTo({ center, zoom: target });
        }).catch(() => undefined);
      };

      const onPointClick = (feature: maplibregl.MapGeoJSONFeature) => {
        const st = useAtlas.getState();
        const id = (feature.properties as { id?: string }).id;
        if (!id) return;
        const rec = st.catalog?.initiatives.find((i) => i.id === id);
        if (!st.catalog || !rec || rec.lat === null || rec.lng === null) {
          st.select(id);
          return;
        }
        // Con zoom manual la fuente ya no agrupa (clusterMaxZoom),
        // pero varios puntos pueden seguir EXACTAMENTE
        // superpuestos: se cuentan las iniciativas filtradas en
        // esa coordenada y, si hay más de una, se abre el
        // selector en vez de elegir arbitrariamente la primera.
        const filtered = filterInitiatives(st.catalog.initiatives, st.countryCode, st.categories, st.query);
        const same = filtered.filter((i) => i.lng === rec.lng && i.lat === rec.lat);
        if (same.length > 1) openGroupFor(same);
        else st.select(id);
      };

      map.on('click', (e) => {
        const hitLayers = ['desplegados', 'clusters', 'puntos', 'paises-relleno'].filter((l) => map.getLayer(l));
        const feats = map.queryRenderedFeatures(e.point, { layers: hitLayers });
        const byLayer = (layerId: string) => feats.find((f) => f.layer.id === layerId);
        const deployed = byLayer('desplegados');
        if (deployed) {
          const id = (deployed.properties as { id?: string }).id;
          if (id) useAtlas.getState().select(id);
          return;
        }
        const cluster = byLayer('clusters');
        if (cluster) { onClusterClick(cluster); return; }
        const point = byLayer('puntos');
        if (point) { onPointClick(point); return; }
        // Sin elemento interactivo bajo el clic: es un «clic
        // fuera» (cierra el selector si estaba abierto) y, si hay
        // un país del directorio, se selecciona como antes.
        // Excepción: con el grupo abierto, un clic dentro del área
        // del despliegue se traga — las iniciativas del grupo han
        // salido de la fuente base y el centro vacío no debe
        // atravesar hasta el país (cerraría el selector que el
        // propio usuario está usando).
        const st = useAtlas.getState();
        if (st.coincident) {
          const ap = map.project(st.coincident.anchor as [number, number]);
          const radio = Math.min(34 + 3 * st.coincident.ids.length, 96) + 16;
          if (Math.hypot(e.point.x - ap.x, e.point.y - ap.y) <= radio) return;
          st.closeCoincident();
        }
        const pais = byLayer('paises-relleno');
        if (pais) {
          const props = pais.properties as { code?: string; inDirectory?: boolean };
          if (props?.code && props.inDirectory) st.setCountry(props.code);
        }
      });
      for (const layer of ['desplegados', 'puntos', 'clusters', 'paises-relleno']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }

      // Cierre del spiderfy por movimiento significativo del
      // mapa: |Δzoom| ≥ 0,5 o desplazamiento del ancla en
      // pantalla ≥ 25 % del lado menor del lienzo, medidos desde
      // la posición en que se abrió. Con un movimiento menor, el
      // círculo en píxeles solo se recoloca (sin rearmar la
      // referencia, para que la deriva acumulada también cuente).
      map.on('moveend', () => {
        const st = useAtlas.getState();
        const open = spiderRef.current;
        if (!st.coincident || !open) return;
        const zoomDelta = Math.abs(map.getZoom() - open.zoom0);
        const p = map.project(open.anchor);
        const shift = Math.hypot(p.x - open.pixel0.x, p.y - open.pixel0.y);
        const canvas = map.getCanvas();
        const threshold = 0.25 * Math.min(canvas.clientWidth, canvas.clientHeight);
        if (zoomDelta >= 0.5 || shift >= threshold) st.closeCoincident();
        else layoutSpiderfy(true);
      });
    });

    // El selector pide devolver el foco al lienzo del mapa al
    // cerrarse con Escape o con su botón de cierre.
    const onFocusMap = () => { mapRef.current?.getCanvas().focus({ preventScroll: true }); };
    window.addEventListener('atlas:focus-map', onFocusMap);

    return () => {
      window.removeEventListener('atlas:focus-map', onFocusMap);
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
      // Con el grupo coincidente abierto, sus iniciativas salen de
      // la fuente base: ya las representa el spiderfy y en el ancla
      // no debe quedar ningún círculo (el clúster, el punto apilado
      // ni el halo del seleccionado) tapando el despliegue
      // (corrección pedida por Jon, 2026-11-13: «ese círculo fuera»).
      const visible = coincident
        ? filtered.filter((i) => !coincident.ids.includes(i.id))
        : filtered;
      const source = map.getSource('iniciativas') as maplibregl.GeoJSONSource | undefined;
      source?.setData(toFeatureCollection(visible));
      for (const layerId of ['pais-seleccionado', 'pais-seleccionado-relleno']) {
        if (map.getLayer(layerId)) map.setFilter(layerId, ['==', ['get', 'code'], countryCode ?? '']);
      }
    };
    if (readyRef.current) apply();
    else {
      const t = setInterval(() => { if (readyRef.current) { apply(); clearInterval(t); } }, 250);
      return () => clearInterval(t);
    }
  }, [catalog, countryCode, categories, query, coincident]);

  // ---- Spiderfy del grupo coincidente: pintar al abrir, limpiar
  // al cerrar (incluye los cierres por cambio de filtros/país/
  // búsqueda, que la store ya refleja poniendo coincident a null).
  useEffect(() => {
    const apply = () => { if (readyRef.current) layoutSpiderfy(); };
    if (readyRef.current) apply();
    else {
      const t = setInterval(() => { if (readyRef.current) { apply(); clearInterval(t); } }, 250);
      return () => clearInterval(t);
    }
  }, [coincident, catalog, layoutSpiderfy]);

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
      if (coincident) {
        // Grupo coincidente abierto: el marcador 3D del seleccionado
        // se retira del ancla mientras dure el despliegue (tapaba el
        // centro del spiderfy); vuelve al cerrar el grupo.
        markerRef.current?.clearTarget();
        return;
      }
      if (rec && rec.lat !== null && rec.lng !== null) {
        const targetId = rec.id;
        void ensureMarker().then((marker) => {
          // Solo aplica si la selección no ha cambiado mientras cargaba
          // y no se ha abierto un grupo coincidente entretanto.
          if (marker && useAtlas.getState().selectedId === targetId && !useAtlas.getState().coincident) {
            marker.setTarget(rec.lng!, rec.lat!, categoryColor(rec.category));
          }
        });
      } else {
        markerRef.current?.clearTarget();
      }
    };
    if (readyRef.current) apply();
    else {
      const t = setInterval(() => { if (readyRef.current) { apply(); clearInterval(t); } }, 250);
      return () => clearInterval(t);
    }
  }, [catalog, selectedId, coincident]);

  // ---- Cámara
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !camera || !catalog) return;
    const run = () => {
      if (!readyRef.current) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (camera.kind === 'world') {
        map.flyTo({ center: [5, 22], zoom: 1.6, pitch: 0, bearing: 0, duration: reduced ? 0 : 1500, essential: !reduced });
      } else if (camera.kind === 'country' && camera.countryCode) {
        const country = catalog.countries.find((c) => c.code === camera.countryCode);
        const override = VIEW_OVERRIDES[camera.countryCode];
        const bounds = override?.bounds ?? country?.bbox;
        if (bounds) {
          map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 36, duration: reduced ? 0 : 1500 });
        }
      } else if (camera.kind === 'point' && camera.lng !== undefined && camera.lat !== undefined) {
        map.flyTo({ center: [camera.lng, camera.lat], zoom: Math.max(map.getZoom(), 7), duration: reduced ? 0 : 850, essential: !reduced });
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
