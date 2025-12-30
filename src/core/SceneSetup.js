import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './GameManager.js';

export class SceneSetup {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.colors.sky);
        this.scene.fog = new THREE.FogExp2(CONFIG.colors.sky, 0.005);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
        this.playerGroup = new THREE.Group();
        this.playerGroup.add(this.camera);
        this.camera.position.set(0, CONFIG.player.height, 0);
        this.scene.add(this.playerGroup);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        this.world = new CANNON.World();
        this.world.gravity.set(0, -30, 0);

        // Materials
        this.materials = {
            def: new CANNON.Material('def'),
            ply: new CANNON.Material('ply'),
            ene: new CANNON.Material('ene'),
            kek: new CANNON.Material('kek'),
            item: new CANNON.Material('item') // Added item material
        };

        // Expose materials to world for other entities to access
        this.world.materials = this.materials;

        this.initPhysicsRules();
        this.initLights();
        this.buildSchoolField();
    }

    initPhysicsRules() {
        const { def, ply, ene, kek } = this.materials;
        this.world.addContactMaterial(new CANNON.ContactMaterial(ply, def, { friction: 0.0, restitution: 0.0 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(ene, def, { friction: 0.5, restitution: 0.3 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(kek, ene, { friction: 0.1, restitution: 0.8 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(kek, ply, { friction: 0.8, restitution: 0.0 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(ply, ene, { friction: 0.5, restitution: 0.5 }));
    }

    initLights() {
        const sun = new THREE.DirectionalLight(0xffffee, 1.2);
        sun.position.set(-50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        this.scene.add(sun);
        this.scene.add(new THREE.AmbientLight(0x555566, 0.6));
    }

    createBox(x, y, z, w, h, d, col, tr=false, op=1, rotY=0) {
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshStandardMaterial({ color: col, transparent: tr, opacity: op })
        );
        m.position.set(x, y, z);
        m.rotation.y = rotY;
        m.castShadow = !tr;
        m.receiveShadow = true;
        this.scene.add(m);

        const b = new CANNON.Body({ mass: 0, material: this.materials.def });
        b.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
        b.position.copy(m.position);
        b.quaternion.copy(m.quaternion);
        this.world.addBody(b);
        return m;
    }

    createVisualBox(x, y, z, w, h, d, col, rotY=0) {
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshStandardMaterial({ color: col })
        );
        m.position.set(x, y, z);
        m.rotation.y = rotY;
        m.castShadow = true;
        m.receiveShadow = true;
        this.scene.add(m);
        return m;
    }

    buildSchoolField() {
        const FW = CONFIG.field.width;
        const FD = CONFIG.field.depth;

        // Ground
        const gGeo = new THREE.PlaneGeometry(FW + 40, FD + 40);
        const gMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.ground, roughness: 0.9 });
        const ground = new THREE.Mesh(gGeo, gMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        const gBody = new CANNON.Body({ mass: 0, material: this.materials.def });
        gBody.addShape(new CANNON.Plane());
        gBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(gBody);

        // Walls
        const WH = 8;
        const gateW = 24;
        const wallW = (FW - gateW) / 2;
        this.createBox(-FW/2 + wallW/2, WH/2, FD/2+1, wallW, WH, 2, CONFIG.colors.wall);
        this.createBox(FW/2 - wallW/2, WH/2, FD/2+1, wallW, WH, 2, CONFIG.colors.wall);
        this.createBox(-FW/2-1, WH/2, 0, 2, WH, FD+2, CONFIG.colors.wall);
        this.createBox(FW/2+1, WH/2, 0, 2, WH, FD+2, CONFIG.colors.wall);

        // Building
        const bH = 30;
        const bZ = -FD/2 - 20;
        this.createBox(0, bH/2, bZ, FW, bH, 40, CONFIG.colors.building);

        // Windows
        for (let i = -FW/2 + 5; i < FW/2; i += 10) {
            for (let j = 5; j < 28; j += 7) {
                const w = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0x87CEFA }));
                w.position.set(i, j, bZ + 20 + 0.1);
                this.scene.add(w);
            }
        }

        // Roof
        this.createBox(0, bH + 1, bZ, FW, 2, 40, CONFIG.colors.concrete);

        // Slope / Ramp logic ported from legacy
        const rampH = 0.6, rampW = 1.2;
        const createRampFence = (x, z, length, rotY) => {
            const shape = new THREE.Shape();
            shape.moveTo(0,0); shape.lineTo(0, rampH); shape.lineTo(rampW, 0); shape.lineTo(0,0);
            const geo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: length, bevelEnabled: false });
            const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: CONFIG.colors.concrete}));
            m.position.set(0, 0, -length/2);
            const wrapper = new THREE.Object3D(); wrapper.add(m);
            wrapper.position.set(x, bH+1, z); wrapper.rotation.y = rotY; this.scene.add(wrapper);

            const ang = Math.atan2(rampH, rampW);
            const hyp = Math.sqrt(rampH**2 + rampW**2);
            const b = new CANNON.Body({mass:0, material: this.materials.def});
            b.addShape(new CANNON.Box(new CANNON.Vec3(hyp/2, 0.1, length/2)), new CANNON.Vec3(rampW/2, rampH/2, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), -ang));
            b.addShape(new CANNON.Box(new CANNON.Vec3(0.1, rampH/2, length/2)), new CANNON.Vec3(0, rampH/2, 0));
            b.position.set(x, bH+1, z); b.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), rotY); this.world.addBody(b);
        };
        createRampFence(0, bZ-20, FW, -Math.PI/2);
        createRampFence(-FW/2, bZ, 40, 0);
        createRampFence(FW/2, bZ, 40, Math.PI);

        // Water Tank
        const wtX = FW/2 - 8, wtZ = bZ - 8, wtBaseH = bH+2;
        const wtTank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 6, 16), new THREE.MeshStandardMaterial({color: CONFIG.colors.concrete}));
        wtTank.position.set(wtX, wtBaseH + 8, wtZ);
        wtTank.castShadow = true;
        this.scene.add(wtTank);

        const wtTankBody = new CANNON.Body({mass:0, material: this.materials.def});
        wtTankBody.addShape(new CANNON.Cylinder(4,4,6,16));
        wtTankBody.position.copy(wtTank.position);
        this.world.addBody(wtTankBody);

        // Slope
        const stW = 6, stRise = bH, stRun = 60;
        const landD = stW + 2; const landY = bH; const landZ = bZ + 20 + landD/2;
        const landW = 8; const landX = FW/2 - landW/2 - 2;
        this.createBox(landX, landY, landZ, landW, 1, landD, CONFIG.colors.concrete);

        const slLen = Math.sqrt(stRun**2 + stRise**2);
        const slAng = Math.atan2(stRise, stRun);
        const slMidX = landX - landW/2 - stRun/2;
        const slMidY = stRise/2;
        const slZ = bZ + 20 + stW/2 + 0.05;

        const slB = new CANNON.Body({mass:0, material: this.materials.def});
        slB.addShape(new CANNON.Box(new CANNON.Vec3(slLen/2, 0.5, stW/2)));
        slB.position.set(slMidX, slMidY, slZ);
        const slQ = new THREE.Quaternion(); slQ.setFromEuler(new THREE.Euler(0,0,slAng));
        slB.quaternion.copy(slQ);
        this.world.addBody(slB);

        const slM = new THREE.Mesh(new THREE.BoxGeometry(slLen, 1, stW), new THREE.MeshStandardMaterial({color: CONFIG.colors.concrete}));
        slM.position.copy(slB.position); slM.quaternion.copy(slB.quaternion);
        this.scene.add(slM);

        // Pool
        const pX = 35, pZ = 10, pW = 20, pD = 40, pBaseH = 4;
        this.createBox(pX, pBaseH/2, pZ, pW+4, pBaseH, pD+4, CONFIG.colors.concrete);
        // Water
        const water = new THREE.Mesh(new THREE.PlaneGeometry(pW, pD), new THREE.MeshBasicMaterial({color: 0x00aaff, transparent: true, opacity: 0.6, side: THREE.DoubleSide}));
        water.rotation.x = -Math.PI/2; water.position.set(pX, pBaseH+1.5, pZ);
        this.scene.add(water);

        // Gate
        const gZ = FD/2;
        this.createBox(-gateW/2-1, 4, gZ, 2, 8, 2, CONFIG.colors.wall);
        this.createBox(gateW/2+1, 4, gZ, 2, 8, 2, CONFIG.colors.wall);
        this.createVisualBox(0, 5.5, gZ, gateW, 0.3, 0.3, CONFIG.colors.iron);
        const gateB = new CANNON.Body({mass:0, material: this.materials.def});
        gateB.addShape(new CANNON.Box(new CANNON.Vec3(gateW/2, 3, 0.1)));
        gateB.position.set(0, 3, gZ);
        this.world.addBody(gateB);

        // Trees
        const createTree = (x, z) => {
            const trunkH = 4 + Math.random()*2;
            this.createBox(x, trunkH/2, z, 1, trunkH, 1, CONFIG.colors.wood);
            const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5 + Math.random(), 1), new THREE.MeshStandardMaterial({color: CONFIG.colors.leaf, roughness: 0.8}));
            leaves.position.set(x, trunkH+2, z);
            leaves.castShadow = true;
            this.scene.add(leaves);
        };
        for(let i=0; i<5; i++) createTree(-FW/2+3, -FD/2 + 10 + i*20);
        for(let i=0; i<5; i++) createTree(FW/2-3, -FD/2 + 10 + i*20);
    }
}
