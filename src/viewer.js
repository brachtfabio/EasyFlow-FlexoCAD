// ===== Visualizador 3D =====
const Viewer = (() => {
  function create(canvas, opts = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserve });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 5, 60000);
    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8676, 0.72));
    const sun = new THREE.DirectionalLight(0xffffff, 0.62);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 1.2;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.22); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: .2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

    const fluteTex = new THREE.CanvasTexture(Texture.flute());
    fluteTex.wrapS = fluteTex.wrapT = THREE.RepeatWrapping; fluteTex.encoding = THREE.sRGBEncoding;
    const sideMat = new THREE.MeshStandardMaterial({ map: fluteTex, roughness: 1 });
    const innerMat = new THREE.MeshStandardMaterial({ color: 0xc6a06a, roughness: 1 });
    let printMat = null, artTex = null;

    const world = new THREE.Group(), lift = new THREE.Group();
    scene.add(lift); lift.add(world);
    let S = null;  // estado da caixa atual

    function faceGeometry(model, f) {
      const F = model.faces[f], t = model.thickness;
      const shape = new THREE.Shape(F.poly.map(p => new THREE.Vector2(p[0], p[1])));
      for (const h of F.holes) shape.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
      const pitch = model.flutePitch || 7;
      const uvGen = {
        generateTopUV(g, v, a, b, c) { return [a, b, c].map(i => { const uv = model.uvOf([v[i * 3], v[i * 3 + 1]]); return new THREE.Vector2(uv[0], uv[1]); }); },
        generateSideWallUV(g, v, a, b, c, d) {
          return [a, b, c, d].map(i => new THREE.Vector2((v[i * 3] + v[i * 3 + 1]) / pitch, v[i * 3 + 2] / t));
        },
      };
      const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 4, UVGenerator: uvGen });
      geo.translate(0, 0, -t);
      // separa as tampas: lado impresso (z=0) e lado de dentro (z=-t)
      const pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal;
      const g0 = geo.groups[0], g1 = geo.groups[1];
      const tris = { print: [], inner: [], side: [] };
      for (let i = g0.start; i < g0.start + g0.count; i += 3) (Math.abs(pos.getZ(i)) < t * 0.5 ? tris.print : tris.inner).push(i);
      for (let i = g1.start; i < g1.start + g1.count; i += 3) tris.side.push(i);
      const N = pos.count, P = new Float32Array(N * 3), U = new Float32Array(N * 2), Nn = new Float32Array(N * 3);
      let k = 0; const out = new THREE.BufferGeometry();
      const groups = [];
      ['print', 'inner', 'side'].forEach((key, mi) => {
        const start = k;
        for (const i of tris[key]) for (let j = 0; j < 3; j++) {
          P.set([pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)], k * 3);
          U.set([uv.getX(i + j), uv.getY(i + j)], k * 2);
          Nn.set([nor.getX(i + j), nor.getY(i + j), nor.getZ(i + j)], k * 3); k++;
        }
        groups.push([start, k - start, mi]);
      });
      out.setAttribute('position', new THREE.BufferAttribute(P, 3));
      out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      out.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
      groups.forEach(g => out.addGroup(...g));
      geo.dispose();
      return out;
    }

    function setBox({ model, recipe, art }) {
      clear();
      if (art) {
        artTex = new THREE.CanvasTexture(art); artTex.encoding = THREE.sRGBEncoding;
        artTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      }
      printMat = new THREE.MeshStandardMaterial({ map: artTex, color: art ? 0xffffff : 0xc49a62, roughness: .88 });
      const tr = Fold.tree(model, recipe.root);
      const offsets = Fold.layerOffsets(model, tr, recipe.prog);
      const objs = model.faces.map((F, f) => {
        if (tr.depth[f] < 0) return null;
        const m = new THREE.Mesh(faceGeometry(model, f), [printMat, innerMat, sideMat]);
        m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; m.userData.face = f;
        world.add(m); return m;
      });
      world.rotation.set(recipe.orient === 'base' ? Math.PI / 2 : 0, 0, 0);
      world.updateMatrix();
      S = { model, recipe, tr, offsets, objs, T: 1, copies: null };
      // meia caixa: a segunda metade é a mesma peça girada 180° em volta do eixo vertical do centro da caixa
      if (recipe.copy) {
        const c = recipe.copy, cx = c.sideRight ? c.x0 + c.L / 2 : c.x0 + c.L / 2, cz = -c.W / 2;
        S.copyM = new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(Math.PI)).multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
        S.copies = objs.map(o => { if (!o) return null; const m = new THREE.Mesh(o.geometry, o.material); m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; m.userData.face = o.userData.face; m.userData.copy = true; world.add(m); return m; });
      }
      // centros do desenho aberto e da caixa montada (para deslizar suavemente durante a dobra)
      S.c0 = bounds(0); S.c1 = bounds(1);
      const span = Math.max(S.c0.size.x, S.c0.size.z, S.c1.size.x, S.c1.size.y, S.c1.size.z);
      const r = span * 1.6;
      sun.position.set(-0.55 * r, 1.1 * r, 0.8 * r); fill.position.set(0.8 * r, 0.3 * r, -0.6 * r);
      Object.assign(sun.shadow.camera, { left: -r * .7, right: r * .7, top: r * .7, bottom: -r * .7, near: r * .05, far: r * 4 });
      sun.shadow.camera.updateProjectionMatrix();
      floor.scale.set(r * 8, r * 8, 1);
      setT(1);
    }
    function clear() {
      if (!S) return;
      S.objs.forEach(o => { if (o) { world.remove(o); o.geometry.dispose(); } });
      if (S.copies) S.copies.forEach(o => { if (o) world.remove(o); });
      if (artTex) { artTex.dispose(); artTex = null; }
      if (printMat) printMat.dispose();
      S = null;
    }
    const tmpV = new THREE.Vector3();
    // a segunda metade aparece quando as paredes já estão em pé
    const copyOn = T => T >= 1 / Math.max(1, Fold.timeline(S.recipe.prog).stages.length) - 1e-6;
    function bounds(T) {
      const { M } = Fold.poses(S.model, S.tr, S.recipe.prog, T, S.offsets);
      const box = new THREE.Box3(), R = world.matrix;
      S.model.faces.forEach((F, f) => { if (!M[f]) return; for (const p of F.poly) box.expandByPoint(tmpV.set(p[0], p[1], 0).applyMatrix4(M[f]).applyMatrix4(R)); });
      if (S.copies && copyOn(T)) S.model.faces.forEach((F, f) => { if (!M[f]) return; for (const p of F.poly) box.expandByPoint(tmpV.set(p[0], p[1], 0).applyMatrix4(M[f]).applyMatrix4(S.copyM).applyMatrix4(R)); });
      return { box, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
    }
    function setT(T) {
      if (!S) return;
      S.T = T;
      const { M } = Fold.poses(S.model, S.tr, S.recipe.prog, T, S.offsets);
      S.objs.forEach((o, f) => { if (o) { o.matrix.copy(M[f]); o.matrixWorldNeedsUpdate = true; } });
      if (S.copies) { const on = copyOn(T); S.copies.forEach((o, f) => { if (!o) return; o.visible = on; o.matrix.multiplyMatrices(S.copyM, M[f]); o.matrixWorldNeedsUpdate = true; }); }
      const b = bounds(T);
      const e = Fold.ease(T);
      lift.position.set(-THREE.MathUtils.lerp(S.c0.center.x, S.c1.center.x, e), -b.box.min.y + 0.5, -THREE.MathUtils.lerp(S.c0.center.z, S.c1.center.z, e));
      S.cur = b;
    }
    // ---- câmera ----
    const VIEWS = { iso: [1, .6, 1.3], front: [0, .1, 1], side: [1, .1, 0], top: [0, 1, .001], back: [-.85, .45, -1], under: [.6, -.8, .9] };
    let anim = null;
    function frame(name = 'iso', instant) {
      if (!S) return;
      const b = bounds(S.T);
      const size = b.size, ctr = b.center.clone().add(lift.position);
      const dir = new THREE.Vector3(...VIEWS[name]).normalize();
      const rad = Math.max(size.x, size.y, size.z) * 0.62 + 20;
      const fov = THREE.MathUtils.degToRad(camera.fov / 2);
      const dist = rad / Math.sin(Math.min(fov, Math.atan(Math.tan(fov) * camera.aspect))) * 1.05;
      const to = ctr.clone().add(dir.multiplyScalar(dist));
      if (instant) { camera.position.copy(to); controls.target.copy(ctr); controls.update(); return; }
      anim = { from: camera.position.clone(), to, tf: controls.target.clone(), tt: ctr, t: 0 };
    }
    function resize() {
      const r = canvas.parentElement.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
    }
    let last = performance.now(), running = true;
    function loop(now) {
      if (!running) return;
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (anim) { anim.t = Math.min(1, anim.t + dt / 1.0); const k = Fold.ease(anim.t); camera.position.lerpVectors(anim.from, anim.to, k); controls.target.lerpVectors(anim.tf, anim.tt, k); if (anim.t >= 1) anim = null; }
      if (opts.onFrame) opts.onFrame(dt);
      controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop);
    }
    new ResizeObserver(resize).observe(canvas.parentElement);
    resize(); requestAnimationFrame(loop);
    return {
      setBox, setT, frame, renderer, scene, camera, controls, world, lift,
      get state() { return S; },
      pick(x, y) {
        const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x, y), camera);
        const hit = ray.intersectObjects(S ? S.objs.filter(Boolean) : [])[0];
        return hit ? { face: hit.object.userData.face, point: hit.point } : null;
      },
      stop() { running = false; },
    };
  }
  return { create };
})();
