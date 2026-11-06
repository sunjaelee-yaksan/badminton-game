// Three.js 화면. 게임 로직은 읽기만 하고 바꾸지 않습니다.
import * as THREE from 'three';
import { COURT } from '../config/court.js';

const SHUTTLE_SCALE = 2.4; // 아이들이 잘 보이도록 셔틀을 실제보다 크게

export class CourtRenderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2430);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4656, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(3, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 10, bottom: -10 });
    this.scene.add(sun);

    this.buildCourt();
    this.buildShuttle();
    this.buildMarkers();
    this.buildServeHelpers();
    this.playerMeshes = [];
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camInit = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    const portrait = h > w;
    // 멀리서 좁은 화각으로 → 상대 코트도 크게, 높은 클리어도 화면 안에
    // 내 코트 끝선과 가장 높은 리프트(약 6.7m)가 모두 화면 안에 들어오도록 계산한 값
    // 세로 화면은 아래쪽 조이패드에 가리지 않게 코트를 위로 올림
    this.portrait = portrait;
    this.defaultPose = portrait
      ? { fov: 66, pos: new THREE.Vector3(0, 13, 14), look: new THREE.Vector3(0, 0, 2.2) }
      : { fov: 40, pos: new THREE.Vector3(0, 11, 17.5), look: new THREE.Vector3(0, 1.2, 0.3) };
    this.camera.fov = this.defaultPose.fov;
    this.camera.updateProjectionMatrix();
  }

  buildCourt() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x2a3644 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const court = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT.doublesHalfWidth * 2 + 1.2, COURT.halfLength * 2 + 1.6),
      new THREE.MeshLambertMaterial({ color: 0x1f7a52 }),
    );
    court.rotation.x = -Math.PI / 2;
    court.position.y = 0.002;
    court.receiveShadow = true;
    this.scene.add(court);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const line = (x1, z1, x2, z2, w = 0.04) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len + w, w), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
      m.position.set((x1 + x2) / 2, 0.005, (z1 + z2) / 2);
      this.scene.add(m);
    };
    const { halfLength: L, doublesHalfWidth: D, singlesHalfWidth: S, shortService: SS, doublesLongService: DL } = COURT;
    for (const x of [-D, -S, S, D]) line(x, -L, x, L);
    for (const z of [-L, -DL, -SS, SS, DL, L]) line(-D, z, D, z);
    line(0, SS, 0, L);
    line(0, -SS, 0, -L);

    // 네트
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(D * 2, COURT.netDepth),
      new THREE.MeshLambertMaterial({ color: 0x111418, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    net.position.set(0, COURT.netHeight - COURT.netDepth / 2, 0);
    this.scene.add(net);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(D * 2, 0.05, 0.02), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    tape.position.set(0, COURT.netHeight, 0);
    this.scene.add(tape);
    for (const x of [-D, D]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, COURT.netPostHeight), new THREE.MeshLambertMaterial({ color: 0xd8dde3 }));
      post.position.set(x, COURT.netPostHeight / 2, 0);
      post.castShadow = true;
      this.scene.add(post);
    }

    // 서비스 코트 강조(서브 때만 보임)
    this.serveBoxMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.serveBoxMesh.rotation.x = -Math.PI / 2;
    this.serveBoxMesh.position.y = 0.008;
    this.serveBoxMesh.visible = false;
    this.scene.add(this.serveBoxMesh);
  }

  buildShuttle() {
    const g = new THREE.Group();
    const cork = new THREE.Mesh(new THREE.SphereGeometry(0.033, 16, 12), new THREE.MeshLambertMaterial({ color: 0xf2efe6 }));
    const skirt = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.085, 16, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    skirt.rotation.x = Math.PI; // 넓은 쪽이 뒤
    skirt.position.y = 0.05;
    const inner = new THREE.Group();
    inner.add(cork, skirt);
    g.add(inner);
    g.scale.setScalar(SHUTTLE_SCALE);
    g.traverse((o) => { o.castShadow = true; });
    this.shuttle = g;
    this.shuttleInner = inner;
    this.scene.add(g);

    this.shuttleShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shuttleShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shuttleShadow);
  }

  buildMarkers() {
    const flat = (geo, color, opacity) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.landingMarker = flat(new THREE.CircleGeometry(0.22, 28), 0x000000, 0.45);  // 떨어질 곳(그림자)
    this.standMarker = flat(new THREE.RingGeometry(0.26, 0.36, 36), 0xff3b3b, 0.95); // 서야 할 곳(빨간 원)
    this.timingRing = flat(new THREE.RingGeometry(0.33, 0.38, 36), 0xffffff, 0.9);    // 줄어드는 타이밍 링
    this.aimLong = flat(new THREE.RingGeometry(0.16, 0.24, 28), 0x58a6ff, 0.95);
    this.aimShort = flat(new THREE.RingGeometry(0.16, 0.24, 28), 0x5fe39b, 0.95);
  }

  // 서브 관련 표시: 서버·리시버가 설 칸, 서버 발밑 링, 1인칭 서브 높이 기준선(1.15m)
  buildServeHelpers() {
    const boxMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false });
    this.serverStandMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), boxMat(0x5fe39b));
    this.receiverStandMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), boxMat(0x58a6ff));
    for (const m of [this.serverStandMesh, this.receiverStandMesh]) {
      m.rotation.x = -Math.PI / 2; m.visible = false; this.scene.add(m);
    }
    this.serverRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    this.serverRing.rotation.x = -Math.PI / 2;
    this.serverRing.visible = false;
    this.scene.add(this.serverRing);

    // 1.15m 기준선: 빨간 선 + 그 위 위험 구역 + 글자
    const g = new THREE.Group();
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.014, 0.014), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    zone.position.y = 0.2;
    const label = makeLabel('1.15m', '#ff6b6b', 0.06);
    label.position.set(-0.5, 0.05, 0);
    g.add(line, zone, label);
    g.visible = false;
    this.heightGuide = g;
    this.scene.add(g);
  }

  setPlayers(players) {
    for (const pm of this.playerMeshes) this.scene.remove(pm.group);
    this.playerMeshes = players.map((p) => {
      const pm = this.makePlayer(p.color);
      const label = makeLabel(p.name, p.team === 0 ? '#9cc7ff' : '#ffb0b0', 0.32);
      label.position.y = 2.05;
      pm.group.add(label);
      return pm;
    });
  }

  makePlayer(color) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.75, 6, 12), bodyMat);
    body.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshLambertMaterial({ color: 0xf1c7a0 }));
    head.position.y = 1.55;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.025, 8, 20), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.62;
    // 라켓: 오른쪽 어깨 축으로 회전
    const pivot = new THREE.Group();
    pivot.position.set(0.3, 1.3, 0);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    handle.position.y = 0.2;
    const head2 = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 24), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
    head2.position.y = 0.53;
    const strings = new THREE.Mesh(new THREE.CircleGeometry(0.125, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    strings.position.y = 0.53;
    pivot.add(handle, head2, strings);
    group.add(body, head, band, pivot);
    group.traverse((o) => { o.castShadow = true; });
    this.scene.add(group);
    return { group, pivot, body };
  }

  // 매 프레임: 경기 상태를 화면에 반영
  update(match, humanIdx = 0) {
    const now = match.time;
    match.players.forEach((p, i) => {
      const pm = this.playerMeshes[i];
      if (!pm) return;
      pm.group.position.set(p.x, 0, p.z);
      // 자동 방향 전환: 기본은 네트를 보고, 셔틀 쪽으로 살짝 돌아봄
      const base = p.side > 0 ? 0 : Math.PI;
      const dx = (match.shuttle.x - p.x) * p.side;
      const turn = Math.max(-0.7, Math.min(0.7, -dx * 0.35));
      pm.group.rotation.y += (base + turn - pm.group.rotation.y) * 0.2;
      // 스윙 애니메이션
      const age = p.swingAge(now);
      const dur = 0.32;
      let ang = -0.35;
      if (age < dur) {
        const k = age / dur;
        ang = k < 0.35 ? -0.35 + (2.3 + 0.35) * (k / 0.35) : 2.3 - 3.9 * ((k - 0.35) / 0.65);
      }
      pm.pivot.rotation.x = ang;
      // 대시 중: 앞으로 숙이고 살짝 낮게
      const lean = p.dashT > 0 ? 0.35 : 0;
      pm.body.rotation.x += (-lean - pm.body.rotation.x) * 0.3;
      pm.group.scale.y = p.dashT > 0 ? 0.92 : 1;
    });

    // 셔틀
    const s = match.shuttle;
    this.shuttle.position.set(s.x, Math.max(s.y, 0.03), s.z);
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    if (sp > 0.3) {
      // 코르크가 진행 방향 앞쪽
      const dir = new THREE.Vector3(s.vx, s.vy, s.vz).normalize();
      this.shuttle.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    } else if (s.y <= 0.01) {
      this.shuttle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    } else {
      this.shuttle.quaternion.identity(); // 손에 들고 있을 때: 코르크가 아래
    }
    this.shuttleShadow.position.set(s.x, 0.006, s.z);
    this.shuttleShadow.visible = s.y > 0.02;

    // 내 쪽으로 오는 공: 그림자·빨간 원·타이밍 링
    const pred = match.prediction;
    const human = match.players[humanIdx]; // 데모 화면에서는 없음
    const ourBall = !!human && match.state === 'rally' && pred && pred.receiverTeam === human.team && pred.ideal;
    // 복식에서 파트너가 받을 공이면 그림자만, 내가 받을 공이면 빨간 원·타이밍 링까지
    const mine = ourBall && pred.takerIdx === humanIdx;
    this.landingMarker.visible = !!ourBall;
    this.standMarker.visible = !!mine;
    this.timingRing.visible = false;
    if (ourBall) this.landingMarker.position.set(pred.landing.x, 0.007, pred.landing.z);
    if (mine) {
      const st = pred.ideal.stand;
      this.standMarker.position.set(st.x, 0.009, st.z);
      const remain = pred.ideal.pressAt - now;
      if (remain > -0.08 && remain < 1.2) {
        this.timingRing.visible = true;
        const sc = 1 + Math.max(0, remain) * 2.6;
        this.timingRing.scale.set(sc, sc, sc);
        this.timingRing.position.set(st.x, 0.011, st.z);
        this.timingRing.material.color.set(Math.abs(remain) < 0.06 ? 0xffe066 : 0xffffff);
      }
    }

    // 서브: 떨어질 칸(노랑), 서버가 설 칸(초록), 리시버가 설 칸(파랑), 조준 링
    const sv = match.getServeInfo();
    const myServe = !!human && sv && sv.serverIdx === humanIdx;
    const fp = !!(myServe && sv.ready); // 1인칭 서브
    this.serveBoxMesh.visible = !!sv;
    this.aimLong.visible = !!myServe;
    this.aimShort.visible = !!myServe;
    this.serverRing.visible = !!sv && !fp;
    const placeBox = (mesh, b) => {
      mesh.scale.set(b.xMax - b.xMin, b.zMax - b.zMin, 1);
      mesh.position.set((b.xMin + b.xMax) / 2, 0.009, (b.zMin + b.zMax) / 2);
    };
    this.serverStandMesh.visible = !!sv && !sv.ready;
    this.receiverStandMesh.visible = !!sv && !sv.ready;
    if (sv) {
      placeBox(this.serveBoxMesh, sv.box);
      placeBox(this.serverStandMesh, sv.serverStand);
      placeBox(this.receiverStandMesh, sv.receiverStand);
      const sp = match.players[sv.serverIdx];
      this.serverRing.position.set(sp.x, 0.013, sp.z);
    }
    if (myServe) {
      this.aimLong.position.set(sv.long.x, 0.012, sv.long.z);
      this.aimShort.position.set(sv.short.x, 0.012, sv.short.z);
    }

    // 1인칭 서브: 내 눈높이에서 상대 서비스 코트를 바라봄, 내 몸은 숨김
    const me = human;
    this.playerMeshes.forEach((pm, i) => { pm.group.visible = !(fp && i === humanIdx); });
    this.heightGuide.visible = fp;
    // 위 코트 선수(온라인 참가자)는 자기 쪽 뒤에서 보도록 카메라를 반대로
    const vs = human ? human.side : 1;
    let pos = this.defaultPose.pos.clone().multiply(new THREE.Vector3(vs, 1, vs));
    let look = this.defaultPose.look.clone().multiply(new THREE.Vector3(vs, 1, vs));
    let fov = this.defaultPose.fov;
    if (fp) {
      const tgt = sv.long;
      pos = new THREE.Vector3(me.x - 0.1 * me.side, 1.62, me.z + 0.75 * me.side);
      look = new THREE.Vector3((tgt.x + sv.from.x) / 2, 0.9, (tgt.z + sv.from.z) / 2);
      fov = this.portrait ? 75 : 60;
      this.heightGuide.position.set(sv.from.x, 1.15, sv.from.z - 0.02 * me.side);
      this.heightGuide.rotation.y = me.side > 0 ? 0 : Math.PI;
    }
    this.shuttle.scale.setScalar(fp ? 1.1 : SHUTTLE_SCALE); // 1인칭에서는 실제 크기에 가깝게
    if (!this.camInit) { this.camPos.copy(pos); this.camLook.copy(look); this.camInit = true; }
    this.camPos.lerp(pos, 0.1);
    this.camLook.lerp(look, 0.1);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - fov) > 0.1) { this.camera.fov += (fov - this.camera.fov) * 0.1; this.camera.updateProjectionMatrix(); }

    this.renderer.render(this.scene, this.camera);
  }
}


// 머리 위 이름표·글자 (항상 카메라를 향함)
function makeLabel(text, color = '#ffffff', height = 0.3) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = 'bold 48px "Noto Sans KR", "Malgun Gothic", sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w; c.height = 72;
  ctx.font = font;
  ctx.fillStyle = 'rgba(10,14,20,0.65)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, 72, 20); ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(height * (w / 72), height, 1);
  sp.renderOrder = 10;
  return sp;
}
