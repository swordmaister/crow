import * as THREE from 'three';
import * as CANNON from 'cannon-es'; // for types if needed
import { Enemy } from '../entities/Enemy.js';
import { Vip } from '../entities/Vip.js';
import { CONFIG, GameManager } from '../core/GameManager.js';

export class EnemyManager {
    constructor(scene, world, player) {
        this.scene = scene;
        this.world = world;
        this.player = player;
        this.gameManager = GameManager.instance;
        this.enemies = [];
        this.vip = null;

        // Expose to window for KekkaiManager (temporary hack solution mentioned in plan)
        window.enemyManager = this;
        // Also spawnItem helper
        window.spawnItem = (pos) => this.spawnItem(pos);

        this.items = [];

        this.gameManager.on('waveStart', () => this.onWaveStart());
        this.gameManager.on('spawnVip', () => this.spawnVip());
    }

    onWaveStart() {
        // Clear old enemies if any? Legacy code keeps them?
        // Legacy: "enemies.forEach(removeEnemy)" on CLEAR.
        // So at START, list is empty usually.
    }

    spawnVip() {
        if (this.vip) this.vip.destroy();
        this.vip = new Vip(this.scene, this.world);
    }

    update(dt, t) {
        // Spawn Logic
        if (t > this.gameManager.state.nextSpawn) {
            this.spawnEnemy();
            // Next spawn time logic from legacy
            // gameState.nextSpawn = t + 3000 - gameState.wave * 100;
            const interval = Math.max(500, 3000 - this.gameManager.state.wave * 100);
            this.gameManager.state.nextSpawn = t + interval;
        }

        // Update Enemies
        const pPos = this.player.getPosition();
        // Copy list to avoid issues if died during update
        [...this.enemies].forEach(e => e.update(dt, pPos, this.vip));

        // Update VIP
        if (this.vip) this.vip.update(dt);

        // Update Items
        this.items.forEach(it => {
            it.mesh.position.copy(it.body.position);
            it.mesh.rotation.y += 0.05;
            if (pPos.distanceTo(it.body.position) < 2.0) {
                this.gameManager.heal(20);
                this.removeItem(it);
            }
        });
    }

    spawnEnemy(forceType=null) {
        if (this.gameManager.state.missionType === 'annihilation') {
            if (this.gameManager.state.enemiesToSpawn <= 0) return;
        }
        if (this.enemies.length >= 15) return;

        // Position Logic
        const r = Math.random();
        let x, y, z;
        const fW = CONFIG.field.width, fD = CONFIG.field.depth;
        if (r < 0.6) { x = (Math.random() - .5) * fW; z = (Math.random() - .5) * fD; y = 20; }
        else if (r < 0.8) { x = (Math.random() - .5) * (fW - 5); z = (-fD / 2 - 20) + (Math.random() - .5) * 30; y = 35; }
        else { x = (fW / 2 - 25) + (Math.random() - .5) * 20; z = (Math.random() - .5) * 50; y = 10; }
        const pos = new CANNON.Vec3(x, y, z);

        let type = 'normal';
        if (forceType) {
            type = forceType;
        } else {
            // Random Type Logic
            if (this.gameManager.state.missionType === 'hunt' && this.enemies.filter(e=>e.type==='target').length === 0) {
                 type = 'target'; // Ensure target spawns?
                 // Legacy: `startWave` calls `spawnEnemy('target')` once.
                 // Here `spawnEnemy()` is called periodically.
                 // We should rely on `forceType` or random.
                 // Legacy: `if (Math.random() < 0.1) spawnGiant...`
            }

            if (Math.random() < 0.1) {
                type = 'giant';
            } else {
                const typeR = Math.random();
                if (typeR < 0.2) type = 'floater_high';
                else if (typeR < 0.4) type = 'floater_low';
                else if (typeR < 0.6) type = 'jumper';
                else type = 'normal';
            }
        }

        const e = new Enemy(this.scene, this.world, pos, type, this.enemies.length);
        this.enemies.push(e);

        if (this.gameManager.state.missionType === 'annihilation') {
            this.gameManager.state.enemiesToSpawn--;
        }
    }

    removeEnemy(e) {
        this.enemies = this.enemies.filter(o => o !== e);
    }

    removeAllEnemies() {
        [...this.enemies].forEach(e => e.die(true)); // True = escape/forced removal without loot?
        // Actually die(true) calls removeEnemy.
        // We want to clear them.
    }

    spawnItem(pos) {
        const b = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)), material: this.world.materials ? this.world.materials.item : new CANNON.Material('item') });
        b.position.copy(pos);
        this.world.addBody(b);

        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: CONFIG.colors.item, wireframe: true }));
        m.position.copy(pos);
        m.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: CONFIG.colors.item })));
        this.scene.add(m);

        this.items.push({ body: b, mesh: m });
    }

    removeItem(it) {
        this.world.removeBody(it.body);
        this.scene.remove(it.mesh);
        this.items = this.items.filter(i => i !== it);
    }
}
