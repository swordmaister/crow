import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG, GameManager } from '../core/GameManager.js';

export class KekkaiManager {
    constructor(scene, world, camera, player, inputManager) {
        this.scene = scene;
        this.world = world;
        this.camera = camera;
        this.player = player;
        this.input = inputManager;
        this.gameManager = GameManager.instance;

        this.kekkaiList = [];
        this.currentDist = CONFIG.dist.near;
        this.isPhysMode = false;

        // Aiming
        this.aimMarker = this.createAimMarker();
        this.raycaster = new THREE.Raycaster();
        this.currentTargetKekkai = null;

        // Dynamic Draw State
        this.activePhysKekkai = null; // Mobile physics drawing
        this.drawState = { active: false, startX: 0, startY: 0, ghost: null }; // Mobile ghost drawing

        // VR Draw State handled via InputManager? No, input manager reports drawing=true.
        // We handle logic here.
        this.vrDrawState = {
            left: { mesh: null, body: null, startHandPos: new THREE.Vector3(), startOrigin: new THREE.Vector3() },
            right: { mesh: null, body: null, startHandPos: new THREE.Vector3(), startOrigin: new THREE.Vector3() }
        };
    }

    createAimMarker() {
        const geo = new THREE.SphereGeometry(0.3, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.marker, transparent: true, opacity: 0.7, depthTest: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 999;
        this.scene.add(mesh);
        return mesh;
    }

    update(dt, inputState) {
        // Mode Switch
        if (inputState.modeSwitch) {
            this.isPhysMode = !this.isPhysMode;
            this.gameManager.emit('controlUpdate', { isPhys: this.isPhysMode, dist: this.currentDist });
        }

        // Distance Switch
        if (inputState.distChange) {
            this.currentDist = (this.currentDist === CONFIG.dist.near) ? CONFIG.dist.far : CONFIG.dist.near;
            this.gameManager.emit('controlUpdate', { isPhys: this.isPhysMode, dist: this.currentDist });
        }

        // Aim Marker Position
        this.updateAimMarker(dt);

        // Actions
        if (inputState.metsu) this.actionMetsu();
        if (inputState.kai) this.actionKai();
        if (inputState.globalMetsu) this.actionGlobalMetsu();
        if (inputState.globalKai) this.actionGlobalKai();

        // Drawing Logic
        this.handleDrawing(inputState);
        this.handleVRDrawing(inputState, 'left');
        this.handleVRDrawing(inputState, 'right');

        // Animation for shrinking/Metsu
        this.updateShrinkingKekkai(dt);
    }

    updateAimMarker(dt) {
        const camPos = new THREE.Vector3();
        const camDir = new THREE.Vector3();
        this.camera.getWorldPosition(camPos);
        this.camera.getWorldDirection(camDir);

        this.aimMarker.position.copy(camPos).add(camDir.clone().multiplyScalar(this.currentDist));
        this.aimMarker.rotation.y = Math.atan2(camDir.x, camDir.z);
        this.aimMarker.visible = true;

        // Auto-Aim / Selection Logic
        let bestCandidate = null;
        this.raycaster.set(camPos, camDir);
        const intersects = this.raycaster.intersectObjects(this.kekkaiList.map(k => k.mesh));
        if (intersects.length > 0) {
            bestCandidate = this.kekkaiList.find(k => k.mesh === intersects[0].object);
        }

        if (!bestCandidate) {
            // Cone Search
            let minDistanceToRay = 999;
            this.kekkaiList.forEach(k => {
                if (k.shrinking) return;
                const kPos = k.mesh.position;
                const vecToK = kPos.clone().sub(camPos);
                const t = vecToK.dot(camDir);

                if (t > 0 && t < CONFIG.dist.far + 20) {
                    const closestPoint = camPos.clone().add(camDir.clone().multiplyScalar(t));
                    const dist = kPos.distanceTo(closestPoint);
                    const size = Math.max(k.mesh.scale.x, k.mesh.scale.y, k.mesh.scale.z);
                    const allowDist = CONFIG.aimAssist.baseRadius + (size * 0.5);

                    if (dist < allowDist) {
                        if (dist < minDistanceToRay) {
                            minDistanceToRay = dist;
                            bestCandidate = k;
                        }
                    }
                }
            });
        }

        // Highlight
        if (this.currentTargetKekkai && this.currentTargetKekkai !== bestCandidate) {
            this.setHighlight(this.currentTargetKekkai, false);
        }
        this.currentTargetKekkai = bestCandidate;
        if (this.currentTargetKekkai) {
            this.setHighlight(this.currentTargetKekkai, true);
        }
    }

    setHighlight(k, active) {
        if (k.edges && k.edges.material) {
            k.edges.material.color.setHex(active ? CONFIG.colors.highlight : 0xffffff);
            k.edges.material.linewidth = active ? 3 : 1;
        }
    }

    handleDrawing(input) {
        // Mobile Drawing
        if (input.drawing && !this.input.renderer.xr.isPresenting) {
            if (this.isPhysMode) {
                // Phys Mode: Mobile
                if (!this.activePhysKekkai) {
                    this.activePhysKekkai = this.createActiveMobile();
                    // Store start touch pos relative to something?
                    // InputManager provides `drawStartPos`.
                }
                const dx = Math.abs(input.drawCurrentPos.x - input.drawStartPos.x) * 0.06;
                const dy = (input.drawStartPos.y - input.drawCurrentPos.y) * 0.06;
                this.updateActiveMobile(this.activePhysKekkai, dx, dy);
            } else {
                // Ghost Mode: Mobile
                if (!this.drawState.active) {
                    this.drawState.active = true;
                    this.drawState.ghost = this.createGhostMesh();
                }
                const dx = Math.abs(input.drawCurrentPos.x - input.drawStartPos.x) * 0.06;
                const dy = (input.drawStartPos.y - input.drawCurrentPos.y) * 0.06;
                const sxz = 1.0 + Math.max(0, dx);
                const sy = 1.0 + Math.max(0, dy);
                this.drawState.ghost.scale.set(sxz, sy, sxz);
            }
        } else {
            // End Drawing
            if (this.activePhysKekkai) {
                this.finalizeMobile(this.activePhysKekkai);
                this.activePhysKekkai = null;
            }
            if (this.drawState.active && this.drawState.ghost) {
                this.createKekkai(
                    this.drawState.ghost.position,
                    this.drawState.ghost.scale,
                    this.drawState.ghost.rotation.y,
                    true
                );
                this.safeRemoveMesh(this.drawState.ghost);
                this.drawState.ghost = null;
                this.drawState.active = false;
            }
        }
    }

    handleVRDrawing(input, hand) {
        const state = (hand === 'left') ? input.vrLeft : input.vrRight;
        const localState = (hand === 'left') ? this.vrDrawState.left : this.vrDrawState.right;

        if (state.drawing) {
            // Get controller position (handPos is set in InputManager if possible, or we query it)
            // InputManager handles querying GP, but getting THREE position needs Controller object.
            // Let's assume input.vrLeft.handPos was NOT populated because I commented on it.
            // We need to fetch it here.
            const controller = this.input.getControllerPose((hand === 'left') ? 0 : 1);
            if (!controller) return;
            const ctrlPos = controller.position;

            if (!localState.drawing) {
                // Start
                localState.drawing = true;
                localState.startHandPos.copy(ctrlPos);
                localState.startOrigin.copy(this.aimMarker.position).sub(new THREE.Vector3(0, 0.5, 0));

                const isPhys = (hand === 'left'); // Left hand force Phys mode drawing?
                // Legacy: Left grip = Phys, Right grip = Ghost.
                // Wait, Legacy:
                // Left: Grip -> drawing (Phys)
                // Right: Grip -> drawing (Ghost)
                const isGhost = (hand === 'right');

                const color = isGhost ? CONFIG.colors.drawGhost : CONFIG.colors.drawPhys;
                const g = new THREE.BoxGeometry(1, 1, 1);
                const m = new THREE.MeshPhongMaterial({ color: color, transparent: true, opacity: isGhost ? 0.4 : 0.6, side: THREE.DoubleSide });
                localState.mesh = new THREE.Mesh(g, m);
                localState.mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })));
                localState.mesh.position.copy(localState.startOrigin);
                this.scene.add(localState.mesh);

                if (!isGhost) {
                     localState.body = new CANNON.Body({ mass: 0, material: this.world.materials ? this.world.materials.kek : new CANNON.Material('kek') });
                     localState.body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
                     localState.body.position.copy(localState.startOrigin);
                     this.world.addBody(localState.body);
                }
            } else {
                // Update
                const dx = Math.abs(ctrlPos.x - localState.startHandPos.x);
                const dy = Math.abs(ctrlPos.y - localState.startHandPos.y);
                const dz = Math.abs(ctrlPos.z - localState.startHandPos.z);

                const sensitivity = CONFIG.kekkai.sensitivity;
                const hMove = Math.sqrt(dx*dx + dz*dz);
                const sy = 1.0 + dy * sensitivity;
                const sx = 1.0 + hMove * sensitivity;
                const sz = 1.0 + hMove * sensitivity;

                localState.mesh.position.copy(localState.startOrigin);
                localState.mesh.scale.set(sx, sy, sz);

                if (localState.body) {
                    // Update physics body size
                    this.world.removeBody(localState.body);
                    const newBody = new CANNON.Body({ mass: 0, material: this.world.materials ? this.world.materials.kek : new CANNON.Material('kek') });
                    newBody.position.copy(localState.mesh.position);
                    newBody.addShape(new CANNON.Box(new CANNON.Vec3(sx/2, sy/2, sz/2)));
                    this.world.addBody(newBody);
                    localState.body = newBody;
                }
            }
        } else {
            // End
            if (localState.drawing) {
                if (localState.mesh) {
                    const isGhost = (hand === 'right');
                    this.createKekkai(
                        localState.mesh.position,
                        localState.mesh.scale,
                        0,
                        isGhost
                    );
                    this.safeRemoveMesh(localState.mesh);
                    if (localState.body) this.world.removeBody(localState.body);
                }
                localState.mesh = null;
                localState.body = null;
                localState.drawing = false;
            }
        }
    }

    createKekkai(p, s, r, isGhost) {
        const cost = 0; // Creation cost? Spec doesn't mention instant cost, only SP drain per sec?
        // Legacy: createKekkai doesn't check cost. updateSP drains based on count.

        const b = new CANNON.Body({ mass: 0, material: this.world.materials ? this.world.materials.kek : new CANNON.Material('kek'), collisionFilterGroup: 1 });
        b.position.copy(p);
        b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), r);

        const t = 0.5;
        const x = s.x/2, y = s.y/2, z = s.z/2;

        if (!isGhost) {
            b.addShape(new CANNON.Box(new CANNON.Vec3(x, y, z)));
        } else {
             // Ghost: Hollow box
            b.addShape(new CANNON.Box(new CANNON.Vec3(t, y, z)), new CANNON.Vec3(-x, 0, 0));
            b.addShape(new CANNON.Box(new CANNON.Vec3(t, y, z)), new CANNON.Vec3(x, 0, 0));
            b.addShape(new CANNON.Box(new CANNON.Vec3(x, t, z)), new CANNON.Vec3(0, -y, 0));
            b.addShape(new CANNON.Box(new CANNON.Vec3(x, t, z)), new CANNON.Vec3(0, y, 0));
            b.addShape(new CANNON.Box(new CANNON.Vec3(x, y, t)), new CANNON.Vec3(0, 0, -z));
            b.addShape(new CANNON.Box(new CANNON.Vec3(x, y, t)), new CANNON.Vec3(0, 0, z));
        }
        this.world.addBody(b);

        const color = isGhost ? CONFIG.colors.ghost : CONFIG.colors.kekkai;
        const g = new THREE.BoxGeometry(s.x, s.y, s.z);
        const m = new THREE.MeshPhongMaterial({ color: color, transparent: true, opacity: isGhost ? 0.3 : 0.5, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(g, m);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
        mesh.add(edges);
        mesh.position.copy(p);
        mesh.rotation.y = r;
        this.scene.add(mesh);

        this.kekkaiList.push({ body: b, mesh: mesh, edges: edges, shrinking: false, isGhost: isGhost });
        this.spawnText("結", p, isGhost ? "#0ff" : "#ff0");
    }

    // --- Mobile Draw Helpers ---
    createActiveMobile() {
        const p = this.aimMarker.position.clone().sub(new THREE.Vector3(0, 0.5, 0));
        const r = this.player.camAngle.yaw;
        const b = new CANNON.Body({ mass: 0, material: this.world.materials ? this.world.materials.kek : new CANNON.Material('kek') });
        b.position.copy(p);
        b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), r);
        this.world.addBody(b);

        const g = new THREE.BoxGeometry(1, 1, 1);
        const m = new THREE.MeshPhongMaterial({ color: CONFIG.colors.drawPhys, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(g, m);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
        mesh.add(edges);
        mesh.position.copy(p);
        mesh.rotation.y = r;
        this.scene.add(mesh);

        return { body: b, mesh: mesh, startP: p, startR: r, currentS: { x: 1, y: 1, z: 1 } };
    }

    updateActiveMobile(k, dx, dy) {
        const sx = 1.0 + Math.max(0, dx * 10);
        const sy = 1.0 + Math.max(0, dy * 10);
        const sz = sx;
        k.currentS = { x: sx, y: sy, z: sz };
        k.mesh.scale.set(sx, sy, sz);
        const newY = k.startP.y;
        k.mesh.position.y = newY;
        k.body.position.y = newY;

        // Update shape
        // Cannon bodies with multiple shapes need clearing?
        // Simple box here.
        // Legacy: b.shapes = []; b.addShape...
        k.body.shapes = [];
        k.body.shapeOffsets = [];
        k.body.shapeOrientations = [];
        k.body.updateMassProperties(); // Important after shape change? mass is 0 though.
        k.body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
    }

    finalizeMobile(k) {
        k.mesh.material.color.setHex(CONFIG.colors.kekkai);
        k.mesh.material.opacity = 0.5;
        const edges = k.mesh.children[0];
        this.kekkaiList.push({ body: k.body, mesh: k.mesh, edges: edges, shrinking: false, isGhost: false });
        this.spawnText("結", k.mesh.position, "#ff0");
    }

    createGhostMesh() {
        const g = new THREE.BoxGeometry(1, 1, 1);
        const m = new THREE.MeshPhongMaterial({ color: CONFIG.colors.drawGhost, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(g, m);
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })));
        mesh.position.copy(this.aimMarker.position).sub(new THREE.Vector3(0, 0.5, 0));
        mesh.rotation.y = this.player.camAngle.yaw;
        this.scene.add(mesh);
        return mesh;
    }

    // --- Actions ---
    actionMetsu() {
        if (this.currentTargetKekkai) {
            this.gameManager.emit('message', { text: "滅！", color: "#f24" });
            this.performMetsu(this.currentTargetKekkai);
        }
    }

    actionKai() {
        if (this.currentTargetKekkai) {
             this.gameManager.emit('message', { text: "解", color: "#4f8" });
             this.spawnText("解", this.currentTargetKekkai.mesh.position, "#4f8");
             this.removeKekkai(this.currentTargetKekkai);
        } else if (this.kekkaiList.length > 0) {
             const t = this.kekkaiList[this.kekkaiList.length - 1];
             this.gameManager.emit('message', { text: "解(直近)", color: "#4f8" });
             this.spawnText("解", t.mesh.position, "#4f8");
             this.removeKekkai(t);
        }
    }

    actionGlobalMetsu() {
        if (this.kekkaiList.length === 0) return;
        const cost = this.kekkaiList.length * CONFIG.kekkai.metsuCost;
        if (this.gameManager.state.playerSp < cost) {
            this.gameManager.emit('message', { text: `霊力不足 (必要:${Math.floor(cost)})`, color: "#f00" });
            return;
        }

        this.gameManager.emit('message', { text: "全方囲・滅！！", color: "#f24" });
        // Visual Flash (Main/UI handles overlay)
        const overlay = document.getElementById('damage-overlay');
        overlay.style.background = "white";
        overlay.style.opacity = 0.8;
        setTimeout(() => {
            overlay.style.opacity = 0;
            setTimeout(() => { overlay.style.background = "radial-gradient(circle, transparent 60%, red 100%)"; }, 200);
        }, 100);

        [...this.kekkaiList].forEach(k => {
            if(k.mesh.material) { k.mesh.material.color.setHex(0xff0000); k.mesh.material.opacity = 0.8; }
            if(k.edges && k.edges.material) { k.edges.material.color.setHex(0xffff00); k.edges.material.linewidth = 5; }
            this.performMetsu(k);
        });
    }

    actionGlobalKai() {
        if (this.kekkaiList.length === 0) return;
        this.gameManager.emit('message', { text: "全解除", color: "#4f8" });
        [...this.kekkaiList].forEach(k => this.removeKekkai(k));
    }

    performMetsu(t) {
        if (!t || t.shrinking) return;
        if (!this.gameManager.consumeSp(CONFIG.kekkai.metsuCost)) return;

        this.spawnText("滅", t.mesh.position, "#f24");
        t.shrinking = true;
        if (t.body) {
            this.world.removeBody(t.body);
            t.body = null;
        }
    }

    updateShrinkingKekkai(dt) {
        // Find enemies
        // We need EnemyManager instance or a way to query enemies.
        // Passed via constructor? Or Global list?
        // Legacy: `enemies` global variable.
        // We'll expose `enemies` from EnemyManager? Or use Physics overlap?
        // Legacy uses `Box3.intersectsBox` manually for metsu damage.
        // So we need access to Enemy meshes.
        // Let's assume GameManager has `enemyManager` reference or we pass `enemyManager` to KekkaiManager.
        // I will assume `window.enemyManager` or similar for now, or update Main to link them.

        const enemyList = (window.enemyManager) ? window.enemyManager.enemies : [];

        [...this.kekkaiList].forEach(t => {
            if (!t.shrinking) return;

            t.mesh.scale.multiplyScalar(0.7);

            const kekkaiBox = new THREE.Box3().setFromObject(t.mesh);
            enemyList.forEach(e => {
                const enemyBox = new THREE.Box3().setFromObject(e.mesh);
                if (kekkaiBox.intersectsBox(enemyBox)) {
                     // Hit Enemy
                     // e.takeDamage?
                     e.takeMetsuDamage();
                }
            });

            if (t.mesh.scale.x <= 0.05) {
                this.removeKekkai(t);
                this.spawnParticle(t.mesh.position, 30, 0xffaa00);
            }
        });
    }

    removeKekkai(k) {
        if (this.currentTargetKekkai === k) this.currentTargetKekkai = null;
        this.safeRemoveMesh(k.mesh);
        if (k.body) this.world.removeBody(k.body);
        this.kekkaiList = this.kekkaiList.filter(o => o !== k);
    }

    // --- Visuals ---
    spawnText(s, p, c) {
        // ... Same as legacy ...
        const cvs = document.createElement('canvas'); cvs.width = 128; cvs.height = 64;
        const ctx = cvs.getContext('2d'); ctx.font = "bold 48px sans-serif"; ctx.fillStyle = c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, 64, 32);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true }));
        sp.position.copy(p); sp.scale.set(3, 1.5, 3); this.scene.add(sp);
        setTimeout(() => { if(sp.parent) { this.scene.remove(sp); sp.material.map.dispose(); sp.geometry.dispose(); } }, 500);
        let f = 0; const a = () => { if(!sp.parent) return; f += 0.2; sp.position.y += 0.05; sp.material.opacity = 1 - f; if (f < 1) requestAnimationFrame(a); else { this.safeRemoveMesh(sp); } }; a();
    }

    spawnParticle(p, n, c) {
        // ... Same as legacy ...
        const g = new THREE.BoxGeometry(0.25, 0.25, 0.25), m = new THREE.MeshBasicMaterial({ color: c });
        const particles = [];
        for (let i = 0; i < n; i++) {
            const me = new THREE.Mesh(g, m); me.position.copy(p).add(new THREE.Vector3((Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2)); this.scene.add(me);
            const v = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(1.5);
            particles.push({ mesh: me, v: v });
        }
        setTimeout(() => { particles.forEach(o => this.safeRemoveMesh(o.mesh)); }, 500);
        const a = () => { let active = false; particles.forEach(o => { if(!o.mesh.parent) return; o.mesh.position.add(o.v); o.mesh.scale.multiplyScalar(0.7); if (o.mesh.scale.x > 0.05) active = true; else this.safeRemoveMesh(o.mesh); }); if(active) requestAnimationFrame(a); }; a();
    }

    safeRemoveMesh(mesh) {
        if (!mesh || !mesh.parent) return;
        mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
            if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
            else mesh.material.dispose();
        }
    }
}
