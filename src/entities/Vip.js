import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG, GameManager } from '../core/GameManager.js';

export class Vip {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.gameManager = GameManager.instance;
        this.hp = 100;

        // Body
        this.body = new CANNON.Body({
            mass: 50,
            shape: new CANNON.Cylinder(0.5, 0.5, 1.8, 8),
            material: this.world.materials ? this.world.materials.ply : new CANNON.Material('ply'),
            fixedRotation: true,
            linearDamping: 0.5,
            collisionFilterGroup: 2,
            collisionFilterMask: 1 | 4 // Walls, Enemies
        });
        this.body.position.set(0, 5, -CONFIG.field.depth / 2 + 30);
        this.world.addBody(this.body);

        // Mesh
        this.mesh = new THREE.Group();
        const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16), new THREE.MeshStandardMaterial({ color: CONFIG.colors.vip }));
        this.mesh.add(bodyM);
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshStandardMaterial({ color: 0xffcccc }));
        headM.position.y = 1.0;
        this.mesh.add(headM);
        this.scene.add(this.mesh);

        // Goal
        this.goal = new CANNON.Vec3(0, 5, CONFIG.field.depth / 2);
        this.createGoalMarker();
    }

    createGoalMarker() {
        const geo = new THREE.ConeGeometry(1, 40, 32, 1, true);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        this.goalMesh = new THREE.Mesh(geo, mat);
        this.goalMesh.position.set(this.goal.x, 20, this.goal.z);
        this.scene.add(this.goalMesh);
    }

    update(dt) {
        if (!this.body) return;
        this.mesh.position.copy(this.body.position);

        if (this.goalMesh) this.goalMesh.rotation.y += 0.02;

        const tg = this.goal.vsub(this.body.position);
        if (tg.length() < 6.0) {
            this.success();
        } else {
            tg.normalize();
            this.body.velocity.x = tg.x * 7;
            this.body.velocity.z = tg.z * 7;
        }
    }

    takeDamage(amt) {
        this.hp -= amt;
        this.gameManager.state.vipHp = this.hp; // Update state directly or emit?
        // GameManager state is source of truth, but we update it here.
        // And emit update.
        this.gameManager.emit('hudUpdate');

        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.gameManager.vipDied();
        this.destroy();
    }

    success() {
        this.gameManager.vipReachedGoal();
        this.destroy();
    }

    destroy() {
        if (this.body) this.world.removeBody(this.body);
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.goalMesh) this.scene.remove(this.goalMesh);
        this.body = null;
        this.mesh = null;
        this.goalMesh = null;
    }
}
