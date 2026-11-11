import * as maplibregl from 'maplibre-gl';
import * as THREE from 'three';

/**
 * Capa Three.js del marcador de la iniciativa seleccionada.
 *
 * Sigue el ejemplo oficial de integración MapLibre + Three.js:
 * - Un solo mapa y una sola cámara: la cámara de Three.js deriva en cada
 *   frame de `args.defaultProjectionData.mainMatrix` de MapLibre.
 * - Con proyección de globo (projectionTransition > 0) se usa la matriz de
 *   modelo sobre la esfera; en mercator, MercatorCoordinate. Así el
 *   marcador queda anclado y el propio globo lo oculta al girar.
 * - Solo existe UN objeto (el marcador del seleccionado), nunca uno por
 *   registro. Sin controles propios de Three.js.
 * - onRemove libera renderer, geometrías y materiales.
 */

const EARTH_RADIUS = 6_371_008.8;

function mercatorModelMatrix(origin: maplibregl.LngLatLike, altitude: number): THREE.Matrix4 {
  const c = maplibregl.MercatorCoordinate.fromLngLat(origin, altitude);
  const scale = c.meterInMercatorCoordinateUnits();
  return new THREE.Matrix4()
    .makeTranslation(c.x, c.y, c.z)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .scale(new THREE.Vector3(-scale, scale, scale));
}

function globeModelMatrix(origin: maplibregl.LngLatLike, altitude: number): THREE.Matrix4 {
  const { lng, lat } = maplibregl.LngLat.convert(origin);
  const scale = 1 / EARTH_RADIUS;
  return new THREE.Matrix4()
    .makeRotationY((lng / 180) * Math.PI)
    .multiply(new THREE.Matrix4().makeRotationX((-lat / 180) * Math.PI))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, 1 + altitude / EARTH_RADIUS))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .scale(new THREE.Vector3(scale, scale, scale));
}

export class SelectedMarkerLayer implements maplibregl.CustomLayerInterface {
  id = 'selected-marker-3d';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private group = new THREE.Group();
  private target: { lng: number; lat: number; color: string } | null = null;
  private built = false;
  /** Último estado de render, para diagnóstico y pruebas. */
  lastRender: { visible: boolean; at: number } = { visible: false, at: 0 };

  setTarget(lng: number, lat: number, color: string) {
    this.target = { lng, lat, color };
    this.buildMarker(color);
    this.map?.triggerRepaint();
  }

  clearTarget() {
    this.target = null;
    this.map?.triggerRepaint();
  }

  private buildMarker(color: string) {
    // Reconstruir materiales con el color de la categoría seleccionada
    while (this.group.children.length > 0) {
      const child = this.group.children.pop() as THREE.Mesh;
      child.geometry?.dispose();
      (child.material as THREE.Material)?.dispose?.();
    }
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.35 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    // Pin en metros, eje Y hacia arriba (la convención de los modelos del
    // ejemplo oficial; las matrices de modelo lo apoyan sobre el terreno):
    // anillo base + cono con la punta hacia el suelo + esfera superior.
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 18), mat);
    sphere.position.set(0, 10500, 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1900, 8200, 24), mat);
    cone.rotation.x = Math.PI;
    cone.position.set(0, 4300, 0);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(620, 16, 12), white);
    tip.position.set(0, 9500, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3000, 260, 10, 40), white);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 120, 0);
    this.group.add(sphere, cone, tip, ring);
    this.built = true;
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    const light1 = new THREE.DirectionalLight(0xffffff, 1.6);
    light1.position.set(0, -70, 100).normalize();
    const light2 = new THREE.DirectionalLight(0xffffff, 0.9);
    light2.position.set(0, 70, 100).normalize();
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(light1, light2, ambient, this.group);
    if (this.target && !this.built) this.buildMarker(this.target.color);
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: maplibregl.CustomRenderMethodInput) {
    if (!this.renderer || !this.target) {
      this.lastRender = { visible: false, at: Date.now() };
      return;
    }
    const origin: [number, number] = [this.target.lng, this.target.lat];
    const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
    const l = args.defaultProjectionData.projectionTransition > 0
      ? globeModelMatrix(origin, 0)
      : mercatorModelMatrix(origin, 0);
    // Tamaño aparente aproximadamente constante (~46 px de alto): la
    // geometría está en metros, así que se escala según los metros por
    // píxel del zoom y la latitud actuales, con tope para la vista globo.
    const zoom = this.map?.getZoom() ?? 2;
    const metersPerPixel = (156543.03392 * Math.cos((this.target.lat * Math.PI) / 180)) / Math.pow(2, zoom);
    const factor = THREE.MathUtils.clamp((46 * metersPerPixel) / 13000, 0.05, 30);
    l.scale(new THREE.Vector3(factor, factor, factor));
    this.camera.projectionMatrix = m.multiply(l);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.lastRender = { visible: true, at: Date.now() };
  }

  onRemove() {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
    this.built = false;
  }
}
